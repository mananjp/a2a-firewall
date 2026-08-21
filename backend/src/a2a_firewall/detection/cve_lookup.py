"""CVE/CVSS lookup with NVD REST API integration and local caching.

Enriches risk scoring with known vulnerability data so the firewall can flag
when an agent, tool, or dependency involved in a task is linked to a disclosed
CVE, weighting severity using CVSS v3 scores.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from a2a_firewall.core.config import settings

logger = logging.getLogger(__name__)

NVD_API_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0"


@dataclass
class CVEResult:
    """Result of a CVE lookup."""

    cve_id: str
    cvss_score: float = 0.0
    severity: str = "unknown"  # critical / high / medium / low / unknown
    vector_string: str = ""
    published_date: str = ""
    description: str = ""
    found: bool = False


# ---------------------------------------------------------------------------
# In-memory cache (backed by the DB cve_cache table for persistence)
# ---------------------------------------------------------------------------
_mem_cache: dict[str, tuple[CVEResult, float]] = {}
_CACHE_TTL = 3600  # 1 hour in-memory


def _from_mem_cache(cve_id: str) -> CVEResult | None:
    entry = _mem_cache.get(cve_id)
    if entry is None:
        return None
    result, ts = entry
    if time.time() - ts > _CACHE_TTL:
        del _mem_cache[cve_id]
        return None
    return result


def _to_mem_cache(result: CVEResult) -> None:
    _mem_cache[result.cve_id] = (result, time.time())


# ---------------------------------------------------------------------------
# CVSS severity band helpers
# ---------------------------------------------------------------------------

def cvss_severity(score: float) -> str:
    """Map a CVSS v3 base score to the standard severity band."""
    if score >= 9.0:
        return "critical"
    if score >= 7.0:
        return "high"
    if score >= 4.0:
        return "medium"
    if score > 0.0:
        return "low"
    return "unknown"


def severity_color(severity: str) -> str:
    """Return a CSS-friendly color token for CVSS severity badges."""
    return {
        "critical": "#dc2626",
        "high": "#ea580c",
        "medium": "#ca8a04",
        "low": "#16a34a",
    }.get(severity, "#6b7280")


# ---------------------------------------------------------------------------
# NVD API lookup
# ---------------------------------------------------------------------------

async def lookup_cve(cve_id: str) -> CVEResult:
    """Fetch CVE details from NVD. Returns cached data when available.

    Uses the NVD CVE 2.0 REST API. An optional NVD_API_KEY env var
    increases rate limits from 5 req/30s to 50 req/30s.
    """
    cve_id = cve_id.upper().strip()

    # Check memory cache first
    cached = _from_mem_cache(cve_id)
    if cached is not None:
        return cached

    headers: dict[str, str] = {}
    if settings.NVD_API_KEY:
        headers["apiKey"] = settings.NVD_API_KEY

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            resp = await client.get(
                NVD_API_BASE,
                params={"cveId": cve_id},
                headers=headers,
            )

        if resp.status_code != 200:
            logger.warning("NVD API returned %s for %s", resp.status_code, cve_id)
            return CVEResult(cve_id=cve_id, found=False)

        data = resp.json()
        vulns = data.get("vulnerabilities", [])
        if not vulns:
            result = CVEResult(cve_id=cve_id, found=False)
            _to_mem_cache(result)
            return result

        cve_item = vulns[0].get("cve", {})
        result = _parse_cve_item(cve_id, cve_item)
        _to_mem_cache(result)
        return result

    except Exception:
        logger.debug("NVD API unreachable for %s", cve_id, exc_info=True)
        return CVEResult(cve_id=cve_id, found=False)


def _parse_cve_item(cve_id: str, cve_item: dict[str, Any]) -> CVEResult:
    """Extract CVSS v3 score and metadata from an NVD CVE item."""
    metrics = cve_item.get("metrics", {})

    # Try CVSS v3.1 first, then v3.0
    cvss_data: dict[str, Any] = {}
    for key in ("cvssMetricV31", "cvssMetricV30"):
        metric_list = metrics.get(key, [])
        if metric_list:
            cvss_data = metric_list[0].get("cvssData", {})
            break

    score = cvss_data.get("baseScore", 0.0)
    vector = cvss_data.get("vectorString", "")

    # Description
    descriptions = cve_item.get("descriptions", [])
    desc = ""
    for d in descriptions:
        if d.get("lang") == "en":
            desc = d.get("value", "")
            break
    if not desc and descriptions:
        desc = descriptions[0].get("value", "")

    published = cve_item.get("published", "")

    return CVEResult(
        cve_id=cve_id,
        cvss_score=float(score),
        severity=cvss_severity(float(score)),
        vector_string=vector,
        published_date=published,
        description=desc[:500],
        found=True,
    )


async def lookup_cve_by_cpe(cpe_string: str) -> list[CVEResult]:
    """Find CVEs matching a CPE string via NVD API.

    Returns a list of CVEResult objects for matching vulnerabilities.
    """
    headers: dict[str, str] = {}
    if settings.NVD_API_KEY:
        headers["apiKey"] = settings.NVD_API_KEY

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            resp = await client.get(
                NVD_API_BASE,
                params={"cpeName": cpe_string, "resultsPerPage": "10"},
                headers=headers,
            )

        if resp.status_code != 200:
            logger.warning("NVD CPE lookup returned %s for %s", resp.status_code, cpe_string)
            return []

        data = resp.json()
        results: list[CVEResult] = []
        for vuln in data.get("vulnerabilities", []):
            cve_item = vuln.get("cve", {})
            cve_id = cve_item.get("id", "")
            if cve_id:
                result = _parse_cve_item(cve_id, cve_item)
                _to_mem_cache(result)
                results.append(result)
        return results

    except Exception:
        logger.debug("NVD CPE lookup failed for %s", cpe_string, exc_info=True)
        return []


async def match_component(
    component_name: str,
    component_version: str,
    cpe_string: str | None = None,
) -> list[CVEResult]:
    """Match a software component against known CVEs.

    If a CPE string is provided, queries NVD by CPE.
    Otherwise uses a keyword search (component name + version).
    """
    if cpe_string:
        return await lookup_cve_by_cpe(cpe_string)

    # Fallback: keyword search via NVD API
    headers: dict[str, str] = {}
    if settings.NVD_API_KEY:
        headers["apiKey"] = settings.NVD_API_KEY

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            resp = await client.get(
                NVD_API_BASE,
                params={
                    "keywordSearch": f"{component_name} {component_version}",
                    "resultsPerPage": "5",
                },
                headers=headers,
            )

        if resp.status_code != 200:
            return []

        data = resp.json()
        results: list[CVEResult] = []
        for vuln in data.get("vulnerabilities", []):
            cve_item = vuln.get("cve", {})
            cve_id = cve_item.get("id", "")
            if cve_id:
                result = _parse_cve_item(cve_id, cve_item)
                _to_mem_cache(result)
                results.append(result)
        return results

    except Exception:
        logger.debug("NVD keyword search failed", exc_info=True)
        return []
