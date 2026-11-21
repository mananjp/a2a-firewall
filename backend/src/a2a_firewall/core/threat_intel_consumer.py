"""External TAXII feed consumer for threat intelligence enrichment.

Polls configured external TAXII 2.1 servers, pulls STIX indicators, and
converts them into IPS signatures that the detection pipeline can apply.

Usage:
  - Configure feeds via ``POST /v1/taxii/feeds``
  - Trigger manual poll via ``POST /v1/taxii/feeds/{id}/poll``
  - Auto-poll runs on a configurable interval (see ``TAXII_POLL_INTERVAL_MINUTES``)

Supported STIX indicator pattern types:
  - ``stix`` — parsed for observable predicates
  - ``pcre`` / ``snort`` / ``yara`` — stored as regex patterns in IPS engine
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

from a2a_firewall.detection.ips_signatures import IPSSignature, get_engine

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Feed configuration
# ---------------------------------------------------------------------------


@dataclass
class ThreatFeedConfig:
    """Configuration for an external TAXII feed."""

    id: str
    name: str
    taxii_url: str  # e.g. "https://cti.example.com/taxii2/"
    api_root: str  # e.g. "https://cti.example.com/taxii2/stix/"
    collection_id: str  # Collection UUID on the remote server
    auth_type: str = "none"  # none | basic | bearer
    auth_credentials: str = ""  # username:password or bearer token
    poll_interval_minutes: int = 60
    enabled: bool = True
    last_polled_at: str = ""
    added_after: str = ""  # TAXII added_after filter for incremental polling


# ---------------------------------------------------------------------------
# STIX pattern → IPS signature conversion
# ---------------------------------------------------------------------------


def _extract_pattern_value(stix_pattern: str) -> str | None:
    """Extract a regex or value from a STIX pattern for IPS signature matching.

    Supports patterns like:
      [x-a2a-payload:content MATCHES 'regex_here']
      [file:name = 'malicious.exe']
      [network-traffic:dst_ref.value = '192.168.1.1']
    """
    # Try MATCHES first (regex)
    match = re.search(r"MATCHES\s+'([^']+)'", stix_pattern, re.IGNORECASE)
    if match:
        return match.group(1)

    # Try equality
    match = re.search(r"=\s+'([^']+)'", stix_pattern)
    if match:
        value = match.group(1)
        # Escape for regex use
        return re.escape(value)

    return None


def stix_indicator_to_ips_signature(
    indicator: dict[str, Any],
    source: str = "external-taxii",
) -> IPSSignature | None:
    """Convert a STIX Indicator into an IPS signature for the detection engine.

    Returns None if the indicator cannot be converted (e.g. unsupported pattern type).
    """
    pattern = indicator.get("pattern", "")
    pattern_type = indicator.get("pattern_type", "stix")

    regex_pattern: str | None = None

    if pattern_type == "stix":
        regex_pattern = _extract_pattern_value(pattern)
    elif pattern_type in ("pcre", "snort", "yara"):
        # Use the raw pattern as regex
        regex_pattern = pattern
    else:
        logger.debug("Unsupported pattern type: %s", pattern_type)
        return None

    if not regex_pattern:
        return None

    # Determine severity from indicator labels/extensions
    severity = "medium"
    labels = indicator.get("labels", [])
    if "critical" in labels or any("critical" in str(v) for v in indicator.values()):
        severity = "critical"
    elif "high" in labels:
        severity = "high"
    elif "low" in labels:
        severity = "low"

    # Custom severity from x_a2a extensions
    if indicator.get("x_a2a_severity"):
        severity = indicator["x_a2a_severity"]

    # Category from labels or indicator_types
    category = "external_threat"
    indicator_types = indicator.get("indicator_types", [])
    if "malicious-activity" in indicator_types:
        category = "malicious_activity"
    elif "anomalous-activity" in indicator_types:
        category = "anomalous_activity"
    if any("injection" in lbl for lbl in labels):
        category = "prompt_injection"
    elif any("exfil" in lbl for lbl in labels):
        category = "data_exfiltration"

    # MITRE technique from kill_chain_phases
    mitre_technique = ""
    for phase in indicator.get("kill_chain_phases", []):
        if phase.get("kill_chain_name") == "mitre-attack":
            mitre_technique = phase.get("phase_name", "")
            break

    stix_id = indicator.get("id", f"external-{uuid.uuid4().hex[:8]}")
    sig_id = f"EXT-{stix_id.split('--')[-1][:8].upper()}"

    return IPSSignature(
        id=sig_id,
        category=category,
        pattern=regex_pattern,
        severity=severity,
        action="block",
        description=indicator.get("name", f"External indicator {sig_id}"),
        enabled=True,
        mitre_technique=mitre_technique,
    )


# ---------------------------------------------------------------------------
# TAXII Client — poll a remote TAXII 2.1 server
# ---------------------------------------------------------------------------


async def poll_taxii_feed(
    feed: ThreatFeedConfig,
    request_timeout: float = 30.0,
) -> list[dict[str, Any]]:
    """Poll a remote TAXII 2.1 server for new STIX objects.

    Returns list of STIX objects from the collection.
    """
    headers: dict[str, str] = {
        "Accept": "application/taxii+json;version=2.1",
    }

    if feed.auth_type == "basic":
        import base64

        encoded = base64.b64encode(feed.auth_credentials.encode()).decode()
        headers["Authorization"] = f"Basic {encoded}"
    elif feed.auth_type == "bearer":
        headers["Authorization"] = f"Bearer {feed.auth_credentials}"

    # Build the objects URL
    objects_url = f"{feed.api_root.rstrip('/')}/collections/{feed.collection_id}/objects/"

    params: dict[str, str] = {}
    if feed.added_after:
        params["added_after"] = feed.added_after

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(request_timeout)) as client:
            resp = await client.get(objects_url, headers=headers, params=params)

        if resp.status_code != 200:
            logger.warning(
                "TAXII feed %s returned %s: %s",
                feed.name,
                resp.status_code,
                resp.text[:200],
            )
            return []

        data = resp.json()

        # TAXII response has objects at top level or in an envelope
        objects = data.get("objects", [])
        if not objects and isinstance(data, list):
            objects = data

        logger.info(
            "Polled TAXII feed %s: %d objects received",
            feed.name,
            len(objects),
        )
        return objects

    except Exception:
        logger.warning("Failed to poll TAXII feed %s", feed.name, exc_info=True)
        return []


# ---------------------------------------------------------------------------
# Apply external indicators to the IPS engine
# ---------------------------------------------------------------------------


def apply_stix_indicators_to_ips(
    stix_objects: list[dict[str, Any]],
    source: str = "external-taxii",
) -> list[IPSSignature]:
    """Convert STIX indicators to IPS signatures and load them into the engine.

    Returns the list of successfully created signatures.
    """
    engine = get_engine()
    created: list[IPSSignature] = []

    for obj in stix_objects:
        if obj.get("type") != "indicator":
            continue

        sig = stix_indicator_to_ips_signature(obj, source)
        if sig:
            engine.add_signature(sig)
            created.append(sig)
            logger.debug("Loaded external indicator as IPS signature: %s", sig.id)

    if created:
        logger.info(
            "Applied %d external STIX indicators as IPS signatures (source: %s)",
            len(created),
            source,
        )

    return created


# ---------------------------------------------------------------------------
# Full poll + apply pipeline
# ---------------------------------------------------------------------------


async def poll_and_apply_feed(feed: ThreatFeedConfig) -> dict[str, Any]:
    """Poll a TAXII feed and apply its indicators to the detection engine.

    Returns a summary of what was polled and applied.
    """
    objects = await poll_taxii_feed(feed)
    signatures = apply_stix_indicators_to_ips(objects, source=feed.name)

    return {
        "feed_id": feed.id,
        "feed_name": feed.name,
        "objects_received": len(objects),
        "indicators_found": sum(1 for o in objects if o.get("type") == "indicator"),
        "signatures_created": len(signatures),
        "signature_ids": [s.id for s in signatures],
        "polled_at": datetime.now(UTC).isoformat(),
    }

