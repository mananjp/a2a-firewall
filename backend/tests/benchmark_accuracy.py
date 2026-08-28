"""Detection accuracy benchmark harness.

Runs all items in tests/attack_corpus/ through the detection pipeline
(Layer 0 preflight + Layer 3 rule engine) and reports:
- True Positive Rate (TPR) for malicious payloads
- False Positive Rate (FPR) for benign payloads
- Per-layer detection breakdown
- p50 / p95 / p99 latency

Usage:
    cd backend
    python -m pytest tests/benchmark_accuracy.py -v --tb=short
    # Or run standalone:
    python tests/benchmark_accuracy.py
"""

from __future__ import annotations

import json
import statistics
import time
import uuid
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from a2a_firewall.detection.layer0_preflight import preflight
from a2a_firewall.detection.layer3_rules import run_rules

ATTACK_CORPUS_DIR = Path(__file__).parent / "attack_corpus"
BENCHMARK_CORPUS_DIR = Path(__file__).parent / "benchmark_corpus"


def _load_all_fixtures() -> list[dict[str, Any]]:
    """Load all JSON fixture files from both corpus directories."""
    fixtures = []
    dirs = [BENCHMARK_CORPUS_DIR, ATTACK_CORPUS_DIR]
    for d in dirs:
        if not d.exists():
            continue
        for p in sorted(d.glob("*.json")):
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, list):
                for item in data:
                    item["_source_file"] = p.name
                    fixtures.append(item)
            elif isinstance(data, dict):
                data["_source_file"] = p.name
                fixtures.append(data)
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


async def _run_single(fixture: dict[str, Any]) -> dict[str, Any]:
    """Run a single fixture through the detection pipeline and return results."""
    sender = _sender()
    workspace = _workspace()
    db = _mock_db()

    payload = dict(fixture.get("payload", {}))
    if "payload_size_target_bytes" in fixture:
        payload["big"] = "x" * fixture["payload_size_target_bytes"]

    request_data: dict[str, Any] = {
        "task_id": str(uuid.uuid4()),
        "task_type": fixture.get("task_type", "research"),
        "schema_version": "v1",
        "depth": fixture.get("depth", 0),
        "payload": payload,
        "receiver_agent_id": (
            str(sender.id) if fixture.get("use_sender_as_receiver") else str(uuid.uuid4())
        ),
    }

    payload_str = json.dumps(payload, sort_keys=True)
    payload_size = len(payload_str.encode())

    start = time.perf_counter()

    # Run preflight
    pre = await preflight(request_data, sender, workspace, payload_size, db)
    blocked_at_preflight = pre is not None and pre.get("block")

    if blocked_at_preflight:
        elapsed_ms = (time.perf_counter() - start) * 1000
        violations = pre.get("violations", [])
        return {
            "fixture": fixture["name"],
            "source_file": fixture.get("_source_file", "unknown"),
            "expected_decision": fixture.get("expected_decision", "block"),
            "actual_decision": "block",
            "blocked_by_layer": "preflight",
            "violation_types": [v["violation_type"] for v in violations],
            "latency_ms": elapsed_ms,
        }

    # Run rules
    rule_result = await run_rules(request_data, sender, workspace, db)
    violations = list(rule_result.get("violations", []))
    risk_delta = rule_result.get("risk_delta", 0.0)

    # Run PII scanner (deterministic layer)
    from a2a_firewall.detection.pii_patterns import pii_matches_to_violations, scan_all_pii

    pii_matches = scan_all_pii(payload_str)
    if pii_matches:
        pii_violations = pii_matches_to_violations(pii_matches)
        violations.extend(pii_violations)
        pii_risk = min(0.5, len(pii_matches) * 0.15)
        risk_delta = min(1.0, risk_delta + pii_risk)

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

    blocked_by = "rules" if actual_decision == "block" else None
    if actual_decision == "block" and pii_matches and not rule_result.get("violations"):
        blocked_by = "pii_scanner"

    return {
        "fixture": fixture["name"],
        "source_file": fixture.get("_source_file", "unknown"),
        "expected_decision": fixture.get("expected_decision", "block"),
        "actual_decision": actual_decision,
        "blocked_by_layer": blocked_by,
        "violation_types": [v["violation_type"] for v in violations],
        "risk_delta": risk_delta,
        "latency_ms": elapsed_ms,
    }


@pytest.mark.asyncio
async def test_benchmark_accuracy() -> None:
    """Run the full benchmark and print results."""
    fixtures = _load_all_fixtures()
    assert len(fixtures) > 0, "No fixtures found in attack_corpus/"

    results: list[dict[str, Any]] = []
    for fixture in fixtures:
        result = await _run_single(fixture)
        results.append(result)

    # Separate malicious and benign
    malicious = [r for r in results if r["expected_decision"] == "block"]
    benign = [r for r in results if r["expected_decision"] == "allow"]

    # Calculate TPR / FPR
    true_positives = sum(1 for r in malicious if r["actual_decision"] == "block")
    false_negatives = sum(1 for r in malicious if r["actual_decision"] == "allow")
    true_negatives = sum(1 for r in benign if r["actual_decision"] == "allow")
    false_positives = sum(1 for r in benign if r["actual_decision"] == "block")

    tpr = true_positives / max(1, len(malicious)) * 100
    fpr = false_positives / max(1, len(benign)) * 100

    # Latency stats
    latencies = [r["latency_ms"] for r in results]
    latencies_sorted = sorted(latencies)
    p50 = latencies_sorted[len(latencies_sorted) // 2] if latencies_sorted else 0
    p95_idx = int(len(latencies_sorted) * 0.95)
    p99_idx = int(len(latencies_sorted) * 0.99)
    p95 = latencies_sorted[min(p95_idx, len(latencies_sorted) - 1)] if latencies_sorted else 0
    p99 = latencies_sorted[min(p99_idx, len(latencies_sorted) - 1)] if latencies_sorted else 0

    # Per-layer breakdown
    layer_counts: dict[str, int] = {}
    for r in results:
        layer = r.get("blocked_by_layer")
        if layer:
            layer_counts[layer] = layer_counts.get(layer, 0) + 1

    # Print report
    print("\n" + "=" * 70)
    print("  A2A FIREWALL — DETECTION ACCURACY BENCHMARK")
    print("=" * 70)
    print(f"\n  Total fixtures:    {len(results)}")
    print(f"  Malicious:         {len(malicious)}")
    print(f"  Benign:            {len(benign)}")
    print(f"\n  True Positive Rate:  {tpr:.1f}% ({true_positives}/{len(malicious)})")
    print(f"  False Positive Rate: {fpr:.1f}% ({false_positives}/{len(benign)})")
    print(f"  True Negatives:      {true_negatives}/{len(benign)}")
    print(f"  False Negatives:     {false_negatives}/{len(malicious)}")
    print("\n  Latency (deterministic layers only, no Groq):")
    print(f"    p50:  {p50:.2f} ms")
    print(f"    p95:  {p95:.2f} ms")
    print(f"    p99:  {p99:.2f} ms")
    print(f"    mean: {statistics.mean(latencies):.2f} ms")
    print("\n  Per-layer detection breakdown:")
    for layer, count in sorted(layer_counts.items()):
        print(f"    {layer}: {count} blocks")

    # Print failed detections (false negatives)
    if false_negatives > 0:
        print(f"\n  [!] FALSE NEGATIVES ({false_negatives}):")
        for r in malicious:
            if r["actual_decision"] == "allow":
                print(f"    - {r['fixture']} ({r['source_file']})")

    # Print false positives
    if false_positives > 0:
        print(f"\n  [!] FALSE POSITIVES ({false_positives}):")
        for r in benign:
            if r["actual_decision"] == "block":
                print(f"    - {r['fixture']} ({r['source_file']}): {r['violation_types']}")

    print("\n" + "=" * 70)

    # Save results to JSON
    output_path = Path(__file__).parent / "benchmark_results.json"
    output_path.write_text(
        json.dumps(
            {
                "total_fixtures": len(results),
                "malicious_count": len(malicious),
                "benign_count": len(benign),
                "true_positive_rate": round(tpr, 2),
                "false_positive_rate": round(fpr, 2),
                "true_positives": true_positives,
                "false_negatives": false_negatives,
                "true_negatives": true_negatives,
                "false_positives": false_positives,
                "latency_p50_ms": round(p50, 2),
                "latency_p95_ms": round(p95, 2),
                "latency_p99_ms": round(p99, 2),
                "latency_mean_ms": round(statistics.mean(latencies), 2),
                "layer_breakdown": layer_counts,
                "results": results,
            },
            indent=2,
        )
    )
    print(f"  Results saved to: {output_path}")
