"""STIX 2.1 object converter for A2A Firewall threat data.

Translates internal firewall events (violations, SOC alerts, IPS signature
matches, CVE results, blocked inspection payloads) into well-formed STIX 2.1
objects so they can be shared via the built-in TAXII 2.1 server or exported
as bundles.

STIX object types produced:
  - ``indicator``       — IPS signatures, PII patterns, detection rules
  - ``observed-data``   — raw inspection events (task payloads)
  - ``attack-pattern``  — MITRE ATT&CK technique references
  - ``malware``         — prompt-injection / data-exfil payloads
  - ``sighting``        — links observed-data to indicators
  - ``vulnerability``   — CVE-enriched findings
  - ``report``          — SOC alert wrappers
  - ``identity``        — workspace / agent identities
  - ``relationship``    — links between objects
  - ``infrastructure``  — agent infrastructure records

All timestamps are ISO-8601 UTC.  IDs follow the STIX 2.1 deterministic
UUID-5 convention (``<type>--<uuid5(namespace, content-key)>``).
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

STIX_SPEC_VERSION = "2.1"
STIX_NAMESPACE = uuid.UUID("a2a1f1e0-dead-beef-cafe-a2a1f1e00000")

A2A_IDENTITY_ID = f"identity--{uuid.uuid5(STIX_NAMESPACE, 'a2a-firewall')}"

# MITRE ATT&CK technique → name mapping (subset relevant to agent attacks)
MITRE_TECHNIQUE_MAP: dict[str, str] = {
    "T1059": "Command and Scripting Interpreter",
    "T1059.001": "PowerShell",
    "T1078": "Valid Accounts",
    "T1041": "Exfiltration Over C2 Channel",
    "T1132": "Data Encoding",
    "T1134": "Access Token Manipulation",
    "T1190": "Exploit Public-Facing Application",
    "T1195": "Supply Chain Compromise",
    "T1550": "Use Alternate Authentication Material",
    "T1557": "Adversary-in-the-Middle",
    "T1562": "Impair Defenses",
    "T1564": "Hide Artifacts",
    "T1657": "Financial Theft",
    "T1005": "Data from Local System",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _stix_id(obj_type: str, seed: str) -> str:
    """Deterministic STIX ID from type + seed string."""
    return f"{obj_type}--{uuid.uuid5(STIX_NAMESPACE, f'{obj_type}:{seed}')}"


def _base_object(stix_type: str, stix_id: str, **extra: Any) -> dict[str, Any]:
    now = _now_iso()
    obj: dict[str, Any] = {
        "type": stix_type,
        "spec_version": STIX_SPEC_VERSION,
        "id": stix_id,
        "created": now,
        "modified": now,
        "created_by_ref": A2A_IDENTITY_ID,
    }
    obj.update(extra)
    return obj


# ---------------------------------------------------------------------------
# Identity objects
# ---------------------------------------------------------------------------


def workspace_identity(workspace_id: str, name: str) -> dict[str, Any]:
    """Create a STIX Identity for a workspace."""
    sid = _stix_id("identity", f"workspace:{workspace_id}")
    return _base_object(
        "identity",
        sid,
        name=f"A2A Firewall Workspace: {name}",
        identity_class="organization",
        sectors=["technology"],
        x_a2a_workspace_id=workspace_id,
    )


def agent_identity(agent_id: str, agent_name: str, workspace_id: str) -> dict[str, Any]:
    """Create a STIX Identity for an agent."""
    sid = _stix_id("identity", f"agent:{agent_id}")
    return _base_object(
        "identity",
        sid,
        name=f"A2A Agent: {agent_name}",
        identity_class="system",
        x_a2a_agent_id=agent_id,
        x_a2a_workspace_id=workspace_id,
    )


def a2a_firewall_identity() -> dict[str, Any]:
    """The A2A Firewall platform identity — created_by_ref for all objects."""
    return _base_object(
        "identity",
        A2A_IDENTITY_ID,
        name="A2A Firewall",
        identity_class="system",
        description="Inter-agent governance mesh for AI agent networks",
        sectors=["technology"],
    )


# ---------------------------------------------------------------------------
# Indicators (from IPS signatures)
# ---------------------------------------------------------------------------


def ips_signature_to_indicator(sig: dict[str, Any]) -> dict[str, Any]:
    """Convert an IPS signature dict to a STIX Indicator."""
    sig_id = sig.get("signature_id") or sig.get("id", "SIG-0000")
    sid = _stix_id("indicator", f"ips-sig:{sig_id}")

    pattern = sig.get("pattern", "")
    # STIX pattern — wrap the regex in a custom observable
    stix_pattern = f"[x-a2a-payload:content MATCHES '{pattern}']"

    labels = ["malicious-activity"]
    if sig.get("category") == "prompt_injection":
        labels.append("prompt-injection")
    elif sig.get("category") == "data_exfiltration":
        labels.append("data-exfiltration")

    indicator = _base_object(
        "indicator",
        sid,
        name=sig.get("description", f"IPS Signature {sig_id}"),
        description=f"A2A IPS signature {sig_id}: {sig.get('description', '')}",
        indicator_types=["malicious-activity"],
        pattern=stix_pattern,
        pattern_type="stix",
        valid_from=_now_iso(),
        labels=labels,
        x_a2a_signature_id=sig_id,
        x_a2a_category=sig.get("category", "unknown"),
        x_a2a_severity=sig.get("severity", "medium"),
        x_a2a_action=sig.get("action", "block"),
    )

    # Add kill chain phase if MITRE technique is known
    mitre = sig.get("mitre_technique")
    if mitre:
        indicator["kill_chain_phases"] = [
            {
                "kill_chain_name": "mitre-attack",
                "phase_name": MITRE_TECHNIQUE_MAP.get(mitre, mitre),
            }
        ]

    return indicator


# ---------------------------------------------------------------------------
# Attack Patterns (MITRE ATT&CK references)
# ---------------------------------------------------------------------------


def mitre_technique_to_attack_pattern(
    technique_id: str,
    technique_name: str | None = None,
    tactic: str | None = None,
) -> dict[str, Any]:
    """Create a STIX Attack Pattern for a MITRE ATT&CK technique."""
    name = technique_name or MITRE_TECHNIQUE_MAP.get(technique_id, technique_id)
    sid = _stix_id("attack-pattern", f"mitre:{technique_id}")
    obj = _base_object(
        "attack-pattern",
        sid,
        name=name,
        description=f"MITRE ATT&CK {technique_id}: {name}",
        external_references=[
            {
                "source_name": "mitre-attack",
                "external_id": technique_id,
                "url": f"https://attack.mitre.org/techniques/{technique_id.replace('.', '/')}/",
            }
        ],
    )
    if tactic:
        obj["kill_chain_phases"] = [{"kill_chain_name": "mitre-attack", "phase_name": tactic}]
    return obj


# ---------------------------------------------------------------------------
# Vulnerabilities (from CVE data)
# ---------------------------------------------------------------------------


def cve_to_vulnerability(cve: dict[str, Any]) -> dict[str, Any]:
    """Convert CVE lookup result to a STIX Vulnerability."""
    cve_id = cve.get("cve_id", "CVE-0000-0000")
    sid = _stix_id("vulnerability", f"cve:{cve_id}")
    return _base_object(
        "vulnerability",
        sid,
        name=cve_id,
        description=cve.get("description", ""),
        external_references=[
            {
                "source_name": "cve",
                "external_id": cve_id,
                "url": f"https://nvd.nist.gov/vuln/detail/{cve_id}",
            }
        ],
        x_a2a_cvss_score=cve.get("cvss_score", 0.0),
        x_a2a_severity=cve.get("severity", "unknown"),
        x_a2a_vector_string=cve.get("vector_string", ""),
    )


# ---------------------------------------------------------------------------
# Observed Data (from task inspection events)
# ---------------------------------------------------------------------------


def inspection_to_observed_data(
    task_data: dict[str, Any],
    decision: str,
    risk_score: float,
) -> dict[str, Any]:
    """Convert a firewall inspection event to STIX Observed Data."""
    task_id = task_data.get("task_id", str(uuid.uuid4()))
    sid = _stix_id("observed-data", f"inspection:{task_id}")

    # Sanitize payload — truncate for STIX bundle size
    payload = task_data.get("payload", {})
    payload_str = json.dumps(payload, sort_keys=True, default=str)
    if len(payload_str) > 2000:
        payload_str = payload_str[:2000] + "...<truncated>"

    return _base_object(
        "observed-data",
        sid,
        first_observed=_now_iso(),
        last_observed=_now_iso(),
        number_observed=1,
        object_refs=[],
        x_a2a_task_id=task_id,
        x_a2a_task_type=task_data.get("task_type", "unknown"),
        x_a2a_sender_agent_id=task_data.get("sender_agent_id", ""),
        x_a2a_receiver_agent_id=task_data.get("receiver_agent_id", ""),
        x_a2a_decision=decision,
        x_a2a_risk_score=risk_score,
        x_a2a_payload_preview=payload_str[:500],
    )


# ---------------------------------------------------------------------------
# Sightings
# ---------------------------------------------------------------------------


def violation_to_sighting(
    violation: dict[str, Any],
    indicator_id: str,
    observed_data_id: str | None = None,
    workspace_identity_id: str | None = None,
) -> dict[str, Any]:
    """Create a STIX Sighting linking a violation to its indicator."""
    v_type = violation.get("violation_type", "unknown")
    task_id = violation.get("task_id", str(uuid.uuid4()))
    sid = _stix_id("sighting", f"violation:{v_type}:{task_id}")

    sighting = _base_object(
        "sighting",
        sid,
        first_seen=_now_iso(),
        last_seen=_now_iso(),
        count=1,
        sighting_of_ref=indicator_id,
        x_a2a_violation_type=v_type,
        x_a2a_severity=violation.get("severity", "medium"),
    )

    if observed_data_id:
        sighting["observed_data_refs"] = [observed_data_id]
    if workspace_identity_id:
        sighting["where_sighted_refs"] = [workspace_identity_id]

    return sighting


# ---------------------------------------------------------------------------
# Malware (prompt injection / data exfil payloads)
# ---------------------------------------------------------------------------


def injection_to_malware(
    violation: dict[str, Any],
    task_id: str | None = None,
) -> dict[str, Any]:
    """Model a prompt injection or data exfil payload as STIX Malware."""
    v_type = violation.get("violation_type", "prompt_injection")
    seed = f"{v_type}:{task_id or uuid.uuid4()}"
    sid = _stix_id("malware", seed)

    is_family = False
    malware_types = ["trojan"]
    if "injection" in v_type:
        malware_types = ["trojan"]
    elif "exfil" in v_type:
        malware_types = ["spyware"]

    return _base_object(
        "malware",
        sid,
        name=f"A2A Agent Attack: {v_type.replace('_', ' ').title()}",
        description=f"Detected {v_type} in agent-to-agent communication",
        malware_types=malware_types,
        is_family=is_family,
        x_a2a_violation_type=v_type,
        x_a2a_severity=violation.get("severity", "high"),
    )


# ---------------------------------------------------------------------------
# Reports (from SOC alerts)
# ---------------------------------------------------------------------------


def soc_alert_to_report(
    alert: dict[str, Any],
    object_refs: list[str] | None = None,
) -> dict[str, Any]:
    """Wrap a SOC alert as a STIX Report."""
    alert_id = alert.get("id", str(uuid.uuid4()))
    sid = _stix_id("report", f"soc-alert:{alert_id}")

    return _base_object(
        "report",
        sid,
        name=alert.get("title", "Security Alert"),
        description=alert.get("description", ""),
        report_types=["threat-report"],
        published=alert.get("created_at", _now_iso()),
        object_refs=object_refs or [],
        x_a2a_alert_id=alert_id,
        x_a2a_severity=alert.get("severity", "P3"),
        x_a2a_status=alert.get("status", "new"),
        x_a2a_mitre_technique=alert.get("mitre_technique"),
    )


# ---------------------------------------------------------------------------
# Relationships
# ---------------------------------------------------------------------------


def relationship(
    source_ref: str,
    relationship_type: str,
    target_ref: str,
    description: str = "",
) -> dict[str, Any]:
    """Create a STIX Relationship between two objects."""
    seed = f"{source_ref}:{relationship_type}:{target_ref}"
    sid = _stix_id("relationship", seed)
    return _base_object(
        "relationship",
        sid,
        relationship_type=relationship_type,
        source_ref=source_ref,
        target_ref=target_ref,
        description=description,
    )


# ---------------------------------------------------------------------------
# Bundle assembly
# ---------------------------------------------------------------------------


def create_bundle(objects: list[dict[str, Any]]) -> dict[str, Any]:
    """Wrap STIX objects in a STIX 2.1 Bundle."""
    # De-duplicate by id
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for obj in objects:
        oid = obj.get("id", "")
        if oid not in seen:
            seen.add(oid)
            deduped.append(obj)

    return {
        "type": "bundle",
        "id": f"bundle--{uuid.uuid4()}",
        "objects": deduped,
    }


# ---------------------------------------------------------------------------
# High-level converters (compose multiple objects from a single event)
# ---------------------------------------------------------------------------


def violations_to_stix_bundle(
    violations: list[dict[str, Any]],
    task_data: dict[str, Any],
    decision: str,
    risk_score: float,
    workspace_id: str = "",
    workspace_name: str = "",
) -> dict[str, Any]:
    """Convert a full inspection result into a STIX 2.1 Bundle.

    Produces:
    - A2A Firewall identity
    - Workspace identity (if workspace_id provided)
    - Observed data for the inspection
    - Indicators + attack patterns for each violation
    - Sightings linking violations to indicators
    - Relationships connecting everything
    """
    objects: list[dict[str, Any]] = []

    # Platform identity
    objects.append(a2a_firewall_identity())

    # Workspace identity
    ws_identity_id = None
    if workspace_id:
        ws_identity = workspace_identity(workspace_id, workspace_name or workspace_id)
        objects.append(ws_identity)
        ws_identity_id = ws_identity["id"]

    # Observed data
    obs = inspection_to_observed_data(task_data, decision, risk_score)
    objects.append(obs)

    for violation in violations:
        v_type = violation.get("violation_type", "unknown")
        severity = violation.get("severity", "medium")
        details = violation.get("details", {})

        # Create indicator for the violation type
        indicator = _base_object(
            "indicator",
            _stix_id("indicator", f"violation-type:{v_type}"),
            name=f"A2A Detection: {v_type.replace('_', ' ').title()}",
            description=f"Firewall detection rule for {v_type}",
            indicator_types=["malicious-activity"],
            pattern=f"[x-a2a-violation:type = '{v_type}']",
            pattern_type="stix",
            valid_from=_now_iso(),
            x_a2a_violation_type=v_type,
            x_a2a_severity=severity,
        )
        objects.append(indicator)

        # Sighting
        sighting = violation_to_sighting(
            {**violation, "task_id": task_data.get("task_id", "")},
            indicator["id"],
            obs["id"],
            ws_identity_id,
        )
        objects.append(sighting)

        # Attack pattern if MITRE technique is known
        mitre = details.get("mitre_technique") or details.get("signature_id", "")
        if mitre and mitre.startswith("T"):
            ap = mitre_technique_to_attack_pattern(mitre)
            objects.append(ap)
            objects.append(relationship(indicator["id"], "indicates", ap["id"]))

        # Malware object for injection/exfil types
        if any(kw in v_type for kw in ("injection", "exfil", "jailbreak")):
            mal = injection_to_malware(violation, task_data.get("task_id"))
            objects.append(mal)
            objects.append(relationship(indicator["id"], "indicates", mal["id"]))

        # CVE vulnerability
        cve_id = details.get("cve_id")
        if cve_id:
            vuln = cve_to_vulnerability(details)
            objects.append(vuln)
            objects.append(relationship(indicator["id"], "indicates", vuln["id"]))

    return create_bundle(objects)
