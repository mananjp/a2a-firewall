"""Layer 3b: CVE risk scoring.

Inserted after Layer 3 rules and before Layer 4 semantic. For the sender
and receiver agent, looks up their `agent_software_inventory`, matches
components against cached/fetched CVE records, and increases risk_score
proportionally to the CVSS score for any match above a configurable
threshold (default 7.0 = High).
"""

from __future__ import annotations

import contextlib
import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from a2a_firewall.core.config import settings
from a2a_firewall.db.models import AgentSoftwareInventory
from a2a_firewall.detection.cve_lookup import match_component

logger = logging.getLogger(__name__)


async def run_cve_risk(
    request_data: dict[str, Any],
    sender: Any,
    workspace: Any,
    db: AsyncSession,
) -> dict[str, Any]:
    """Check sender and receiver agents' software inventory against CVE data.

    Returns a dict matching the same shape as layer3_rules.run_rules:
      {
        "violations": [...],
        "risk_delta": float,
        "cve_matches": [...],  # extra: for dashboard display
      }
    """
    violations: list[dict[str, Any]] = []
    risk_delta = 0.0
    cve_matches: list[dict[str, Any]] = []

    agent_ids: list[uuid.UUID] = [sender.id]
    receiver_id_str = request_data.get("receiver_agent_id")
    if receiver_id_str:
        with contextlib.suppress(ValueError, TypeError):
            agent_ids.append(uuid.UUID(receiver_id_str))

    threshold = settings.CVE_CVSS_THRESHOLD

    for agent_id in agent_ids:
        result = await db.execute(
            select(AgentSoftwareInventory).where(AgentSoftwareInventory.agent_id == agent_id)
        )
        components = result.scalars().all()

        for comp in components:
            try:
                matches = await match_component(
                    component_name=str(comp.component_name),
                    component_version=str(comp.component_version),
                    cpe_string=str(comp.cpe_string) if comp.cpe_string else None,
                )
            except Exception:
                logger.debug(
                    "CVE match failed for %s/%s",
                    comp.component_name,
                    comp.component_version,
                    exc_info=True,
                )
                continue

            for cve_result in matches:
                if not cve_result.found:
                    continue
                if cve_result.cvss_score < threshold:
                    continue

                cve_matches.append(
                    {
                        "agent_id": str(agent_id),
                        "component": str(comp.component_name),
                        "version": str(comp.component_version),
                        "cve_id": cve_result.cve_id,
                        "cvss_score": cve_result.cvss_score,
                        "severity": cve_result.severity,
                        "description": cve_result.description[:200],
                    }
                )

                delta = cve_result.cvss_score / 10.0
                risk_delta = min(1.0, risk_delta + delta)

                violations.append(
                    {
                        "layer": "rule",
                        "violation_type": "known_vulnerable_component",
                        "severity": cve_result.severity,
                        "details": {
                            "agent_id": str(agent_id),
                            "component": str(comp.component_name),
                            "version": str(comp.component_version),
                            "cve_id": cve_result.cve_id,
                            "cvss_score": cve_result.cvss_score,
                            "cvss_severity": cve_result.severity,
                            "vector_string": cve_result.vector_string,
                        },
                    }
                )

    return {
        "violations": violations,
        "risk_delta": risk_delta,
        "cve_matches": cve_matches,
    }
