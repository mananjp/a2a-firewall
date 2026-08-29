"""OWASP GenAI benchmark runner scaffold.

Runs starter fixtures in tests/owasp_corpus/ through the deterministic
detection pipeline (Layer 0 preflight + Layer 3 rule engine + PII scanner)
and reports TPR / FPR per OWASP LLM category.

NOTE: the fixtures in owasp_corpus/ are *starter* fixtures, not the official
OWASP GenAI Security Verification Standard corpus. They are a scaffold for
plugging in a real, licensed OWASP corpus (or your own curated set) later.
See tests/owasp_corpus/README.md.

Usage:
    cd backend
    python -m pytest tests/benchmark_owasp.py -v -s
    # Or run standalone (requires the package on the Python path):
    python tests/benchmark_owasp.py
    # Live Groq run (requires GROQ_API_KEY and network):
    python tests/benchmark_owasp.py --live
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from a2a_firewall.detection.layer0_preflight import preflight
from a2a_firewall.detection.layer3_rules import run_rules

OWASP_CORPUS_DIR = Path(__file__).parent / "owasp_corpus"


def _load_fixtures() -> list[dict[str, Any]]:
    """Load all JSON fixture files from the OWASP corpus directory."""
    fixtures = []
    if not OWASP_CORPUS_DIR.exists():
        return fixtures
    for p in sorted(OWASP_CORPUS_DIR.glob("*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else [data]
        for item in items:
            item["_source_file"] = p.name
            fixtures.append(item)
    return fixtures


def _mock_db() -> AsyncMock:
    db = AsyncMock()
    execute_result = MagicMock()
    execute_result.scalars.return_value.all.return_value = []
    db.execute.return_value = execute_result
    return db


def _sender() -> MagicMock:
    s = MagicMock()
    s.id = uuid.uuid4()
    s.status = "active"
    return s


def _workspace() -> MagicMock:
    w = MagicMock()
    w.id = uuid.uuid4()
    w.block_threshold = 0.8
    w.groq_threshold = 0.3
    w.default_deny = True
    return w


async def _run_deterministic(fixture: dict[str, Any]) -> dict[str, Any]:
    """Run a single fixture through deterministic layers only."""
    sender = _sender()
    workspace = _workspace()
    db = _mock_db()

    payload = dict(fixture.get("payload", {}))
    request_data: dict[str, Any] = {
        "task_id": str(uuid.uuid4()),
        "task_type": fixture.get("task_type", "research"),
        "schema_version": "v1",
        "depth": fixture.get("depth", 0),
        "payload": payload,
        "receiver_agent_id": str(uuid.uuid4()),
    }

    payload_str = json.dumps(payload, sort_keys=True)
    payload_size = len(payload_str.encode())

    start = time.perf_counter()
    pre = await preflight(request_data, sender, workspace, payload_size, db)
    if pre is not None and pre.get("block"):
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "fixture": fixture["name"],
            "category": fixture.get("category", "unknown"),
            "expected_decision": fixture.get("expected_decision", "block"),
            "actual_decision": "block",
            "blocked_by_layer": "preflight",
            "violation_types": [v["violation_type"] for v in pre.get("violations", [])],
            "latency_ms": elapsed_ms,
        }

    rule_result = await run_rules(request_data, sender, workspace, db)
    violations = list(rule_result.get("violations", []))
    risk_delta = rule_result.get("risk_delta", 0.0)

    from a2a_firewall.detection.pii_patterns import pii_matches_to_violations, scan_all_pii

    pii_matches = scan_all_pii(payload_str)
    if pii_matches:
        violations.extend(pii_matches_to_violations(pii_matches))
        risk_delta = min(1.0, risk_delta + min(0.5, len(pii_matches) * 0.15))

    elapsed_ms = (time.perf_counter() - start) * 1000
    actual_decision = (
        "block"
        if (
            risk_delta >= workspace.block_threshold
            or len(violations) > 0
            and any(v.get("severity") == "critical" for v in violations)
        )
        else "allow"
    )

    return {
        "fixture": fixture["name"],
        "category": fixture.get("category", "unknown"),
        "expected_decision": fixture.get("expected_decision", "block"),
        "actual_decision": actual_decision,
        "blocked_by_layer": "rules" if actual_decision == "block" else None,
        "violation_types": [v["violation_type"] for v in violations],
        "risk_delta": risk_delta,
        "latency_ms": elapsed_ms,
    }


def _summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute TPR / FPR and per-category breakdown from results."""
    malicious = [r for r in results if r["expected_decision"] == "block"]
    benign = [r for r in results if r["expected_decision"] == "allow"]

    true_positives = sum(1 for r in malicious if r["actual_decision"] == "block")
    false_negatives = sum(1 for r in malicious if r["actual_decision"] == "allow")
    true_negatives = sum(1 for r in benign if r["actual_decision"] == "allow")
    false_positives = sum(1 for r in benign if r["actual_decision"] == "block")

    tpr = true_positives / max(1, len(malicious)) * 100
    fpr = false_positives / max(1, len(benign)) * 100

    categories: dict[str, dict[str, int]] = {}
    for r in results:
        cat = r["category"]
        entry = categories.setdefault(cat, {"total": 0, "block": 0, "allow": 0})
        entry["total"] += 1
        entry[r["actual_decision"]] += 1

    return {
        "total": len(results),
        "malicious": len(malicious),
        "benign": len(benign),
        "true_positives": true_positives,
        "false_negatives": false_negatives,
        "true_negatives": true_negatives,
        "false_positives": false_positives,
        "tpr": round(tpr, 2),
        "fpr": round(fpr, 2),
        "categories": categories,
        "results": results,
    }


def _print_report(summary: dict[str, Any]) -> None:
    print("\n" + "=" * 70)
    print("  A2A FIREWALL — OWASP GENAI BENCHMARK (starter fixtures)")
    print("=" * 70)
    print(f"\n  Total fixtures:    {summary['total']}")
    print(f"  Malicious:         {summary['malicious']}")
    print(f"  Benign:            {summary['benign']}")
    print(
        f"\n  True Positive Rate:  {summary['tpr']:.1f}% "
        f"({summary['true_positives']}/{summary['malicious']})"
    )
    print(
        f"  False Positive Rate: {summary['fpr']:.1f}% "
        f"({summary['false_positives']}/{summary['benign']})"
    )
    print("\n  Per-category breakdown:")
    for cat, counts in sorted(summary["categories"].items()):
        print(
            f"    {cat:45s} {counts['total']} fixture(s) "
            f"-> {counts['block']} block / {counts['allow']} allow"
        )
    if summary["false_negatives"] > 0:
        print(f"\n  [!] FALSE NEGATIVES ({summary['false_negatives']}):")
        for r in summary["results"]:
            if r["expected_decision"] == "block" and r["actual_decision"] == "allow":
                print(f"    - {r['fixture']} ({r['category']})")
    if summary["false_positives"] > 0:
        print(f"\n  [!] FALSE POSITIVES ({summary['false_positives']}):")
        for r in summary["results"]:
            if r["expected_decision"] == "allow" and r["actual_decision"] == "block":
                print(f"    - {r['fixture']}: {r['violation_types']}")
    print("\n" + "=" * 70)
    print("  NOTE: starter fixtures only — not the official OWASP GenAI SVSC.")
    print("=" * 70)


@pytest.mark.asyncio
async def test_benchmark_owasp() -> None:
    """Run the deterministic OWASP benchmark (no external API)."""
    fixtures = _load_fixtures()
    assert len(fixtures) > 0, "No fixtures found in owasp_corpus/"

    results = []
    for fixture in fixtures:
        results.append(await _run_deterministic(fixture))

    summary = _summarize(results)
    _print_report(summary)

    output_path = Path(__file__).parent / "owasp_benchmark_results.json"
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\n  Results saved to: {output_path}")


async def _run_live(fixtures: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Run fixtures through the full pipeline including the Layer 4 Groq check.

    Requires GROQ_API_KEY and network access. Falls back to fail-open
    (no block) on Groq errors, mirroring runtime behavior.
    """
    from a2a_firewall.detection.layer4_groq import groq_inspect

    results = []
    for fixture in fixtures:
        base = await _run_deterministic(fixture)
        if base["actual_decision"] == "block":
            results.append(base)
            continue

        sender = _sender()
        workspace = _workspace()
        request_data: dict[str, Any] = {
            "task_id": str(uuid.uuid4()),
            "task_type": fixture.get("task_type", "research"),
            "schema_version": "v1",
            "depth": fixture.get("depth", 0),
            "payload": dict(fixture.get("payload", {})),
            "receiver_agent_id": str(uuid.uuid4()),
        }
        payload_hash = str(uuid.uuid4())
        try:
            res = await groq_inspect(
                request_data=request_data,
                sender=sender,
                workspace=workspace,
                payload_hash=payload_hash,
                injection_only=not contains_non_ascii_script_api(request_data["payload"]),
                rules_risk_delta=base.get("risk_delta", 0.0),
            )
            risk_delta = max(base.get("risk_delta", 0.0), res.get("risk_score_delta", 0.0))
            block = (
                res.get("injection_detected", False)
                or risk_delta >= workspace.block_threshold
                or len(base.get("violation_types", [])) > 0
            )
        except Exception as exc:  # noqa: BLE001 - fail-open on Groq errors
            print(f"  [warn] Groq unavailable for {fixture['name']}: {exc}")
            block = False
        base["blocked_by_layer"] = "groq" if block else base["blocked_by_layer"]
        base["actual_decision"] = "block" if block else base["actual_decision"]
        results.append(base)
    return results


def contains_non_ascii_script_api(payload: Any) -> bool:
    """Stand-in for layer4_groq.contains_non_ascii_script without importing at module load."""
    from a2a_firewall.detection.layer4_groq import contains_non_ascii_script

    return contains_non_ascii_script(payload)


def _main() -> None:
    fixtures = _load_fixtures()
    if not fixtures:
        print("No fixtures found in owasp_corpus/")
        sys.exit(1)

    live = "--live" in sys.argv
    if live:
        try:
            import a2a_firewall.detection.layer4_groq  # noqa: F401 - import check
        except Exception as exc:  # noqa: BLE001
            print(f"Layer 4 (Groq) unavailable, running deterministic only: {exc}")
            live = False

    if live:
        results = asyncio.run(_run_live(fixtures))
    else:
        results = asyncio.run(asyncio.gather(*(_run_deterministic(f) for f in fixtures)))

    summary = _summarize(results)
    _print_report(summary)
    if live:
        summary["mode"] = "live"
    output_path = Path(__file__).parent / "owasp_benchmark_results.json"
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\n  Results saved to: {output_path}")


if __name__ == "__main__":
    _main()
