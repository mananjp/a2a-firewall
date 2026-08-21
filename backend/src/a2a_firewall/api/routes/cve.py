"""CVE lookup routes — manual debug/dashboard endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from a2a_firewall.api.deps import get_current_workspace
from a2a_firewall.db.models import Workspace
from a2a_firewall.detection.cve_lookup import lookup_cve

router = APIRouter()


@router.get("/{cve_id}")
async def get_cve(
    cve_id: str,
    ws: Workspace = Depends(get_current_workspace),
) -> dict[str, Any]:
    """Lookup a CVE by ID via the NVD API (with caching).

    Returns CVSS v3 base score, severity, vector string, published date,
    and description.
    """
    result = await lookup_cve(cve_id)

    if not result.found:
        raise HTTPException(404, f"CVE {cve_id} not found in NVD")

    return {
        "cve_id": result.cve_id,
        "cvss_score": result.cvss_score,
        "severity": result.severity,
        "vector_string": result.vector_string,
        "published_date": result.published_date,
        "description": result.description,
        "found": result.found,
    }
