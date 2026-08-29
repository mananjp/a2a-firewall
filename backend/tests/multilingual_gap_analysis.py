"""Multilingual adversarial detection gap analysis.

Measures whether the deterministic Layers (0 + 3 + PII) miss multilingual
adversarial payloads, and whether the Layer 4 Groq semantic layer catches what
the rules do not — turning the "multilingual gap" hypothesis into a number.

Pipeline tested (mirrors the real orchestrator):
  1. Layer 0 preflight (deterministic)
  2. Layer 3 rule engine (deterministic, English-only regex)
  3. Layer 4 Groq semantic inspection via `groq_inspect`
     - In *injection_only* mode when risk_score == 0 (the exact risk-threshold
       optimized path hit by multilingual payloads that bypass the rules).

Usage:
    cd backend
    python tests/multilingual_gap_analysis.py [--limit N] [--delay MS] [--mode both|injection_only|full]
        --limit  cap the number of fixtures per language (protect Groq API quota)
        --delay  milliseconds to sleep between Groq calls (rate-limit guard)
        --mode   which Groq prompt path(s) to exercise

No pytest is required; this is a standalone, developer-controlled harness that
consumes real Groq API credits and therefore must NOT run in CI.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from a2a_firewall.detection.layer3_rules import run_rules
from a2a_firewall.detection.layer4_groq import contains_non_ascii_script, groq_inspect

CORPUS_DIR = Path(__file__).resolve().parent / "attack_corpus_multilingual"
OUTPUT_PATH = Path(__file__).resolve().parent / "multilingual_gap_results.json"


def load_fixtures() -> list[dict[str, Any]]:
    fixtures: list[dict[str, Any]] = []
    for p in sorted(CORPUS_DIR.glob("*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        items = data if isinstance(data, list) else [data]
        for it in items:
            it["_source_file"] = p.name
            fixtures.append(it)
    return fixtures


def _mock_db() -> AsyncMock:
    db = AsyncMock()
    er = MagicMock()
    er.scalars.return_value.all.return_value = []
    db.execute.return_value = er
    return db


def _sender() -> MagicMock:
    s = MagicMock()
    s.id = uuid.uuid4()
    s.status = "active"
    s.name = "researcher"
    s.description = "research and investigation"
    return s


def _workspace() -> MagicMock:
    w = MagicMock()
    w.id = uuid.uuid4()
    w.block_threshold = 0.8
    w.groq_threshold = 0.3
    w.default_deny = True
    w.fail_mode = "closed"
    return w


def build_request_data(fixture: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    sender = _sender()
    payload = dict(fixture.get("payload", {}))
    request_data: dict[str, Any] = {
        "task_id": str(uuid.uuid4()),
        "task_type": fixture.get("task_type", "research"),
        "schema_version": "v1",
        "depth": fixture.get("depth", 0),
        "payload": payload,
        "receiver_agent_id": str(uuid.uuid4()),
        "root_task_id": str(uuid.uuid4()),
        "parent_task_id": None,
    }
    return request_data, {"sender": sender, "workspace": _workspace(), "db": _mock_db()}


async def _run_rules(req: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    return await run_rules(req, ctx["sender"], ctx["workspace"], ctx["db"])


async def _rules_result(fixture: dict[str, Any]) -> dict[str, Any]:
    req, ctx = build_request_data(fixture)
    return await _run_rules(req, ctx)


async def _layer3_detected(fixture: dict[str, Any]) -> bool:
    """Return True if any deterministic Layer 3 rule fires for the payload."""
    result = await _rules_result(fixture)
    return len(result["violations"]) > 0


async def _rules_risk_delta(fixture: dict[str, Any]) -> float:
    result = await _rules_result(fixture)
    return float(result.get("risk_delta", 0.0))


async def groq_detect(
    fixture: dict[str, Any],
    rules_risk_delta: float,
    injection_only: bool,
) -> dict[str, Any]:
    req, ctx = build_request_data(fixture)
    payload_hash = uuid.uuid4().hex
    result = await groq_inspect(
        req,
        ctx["sender"],
        ctx["workspace"],
        payload_hash,
        declared_intent=None,
        injection_only=injection_only,
        rules_risk_delta=rules_risk_delta,
    )
    result["_fixture"] = fixture["name"]
    return result


def orchestrator_injection_only(fixture: dict[str, Any], rules_risk_delta: float) -> bool:
    """Mirror the orchestrator's real injection_only decision (after the fix).

    The orchestrator uses the fast injection-only prompt only when the rules
    found nothing (risk_score == 0) AND the payload is ASCII-compatible
    (i.e. plausibly English-covered). Non-ASCII script payloads are forced to
    the full multi-language semantic prompt.
    """
    return rules_risk_delta == 0 and not contains_non_ascii_script(fixture.get("payload", {}))


async def run_analysis(
    fixtures: list[dict[str, Any]], delay_ms: int, mode: str, limit: int
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []

    def enabled(m: str) -> bool:
        return mode in ("both", m)

    per_language: dict[str, int] = {}
    for fx in fixtures:
        per_language[fx.get("language", "?")] = per_language.get(fx.get("language", "?"), 0) + 1
        if limit and per_language[fx.get("language", "?")] > limit:
            continue

        fx = dict(fx)
        fx["layer3_detected"] = await _layer3_detected(fx)
        fx["rules_risk_delta"] = await _rules_risk_delta(fx)

        row: dict[str, Any] = {
            "name": fx["name"],
            "language": fx.get("language"),
            "source_file": fx["_source_file"],
            "expected_decision": fx.get("expected_decision"),
            "expected_violation_types": fx.get("expected_violation_types", []),
            "groq_expected_detection": fx.get("groq_expected_detection", False),
            "layer3_detected": fx["layer3_detected"],
            "rules_risk_delta": fx["rules_risk_delta"],
        }

        if enabled("injection_only"):
            g = await groq_detect(fx, fx["rules_risk_delta"], injection_only=True)
            row["groq_old_injection_only_detected"] = bool(g.get("injection_detected"))
            row["groq_old_injection_only_type"] = g.get("injection_type")
        else:
            row["groq_old_injection_only_detected"] = None

        # The shipped-path decision (after the fix): mirrors the orchestrator.
        new_injection_only = orchestrator_injection_only(fx, fx["rules_risk_delta"])
        g = await groq_detect(fx, fx["rules_risk_delta"], injection_only=new_injection_only)
        row["groq_shipped_detected"] = bool(g.get("injection_detected"))
        row["groq_shipped_type"] = g.get("injection_type")
        row["groq_shipped_injection_only"] = new_injection_only
        row["groq_shipped_rationale"] = g.get("rationale", "")[:120]

        results.append(row)
        if delay_ms:
            await asyncio.sleep(delay_ms / 1000.0)

    return {"results": results}


def summarize(data: dict[str, Any]) -> None:
    rows = data["results"]
    if not rows:
        print("No fixtures analysed.")
        return

    attack = [r for r in rows if r["expected_decision"] == "block"]
    benign = [r for r in rows if r["expected_decision"] == "allow"]

    rule_caught = [r for r in attack if r["layer3_detected"]]
    rule_missed = [r for r in attack if not r["layer3_detected"]]

    print("\n" + "=" * 78)
    print("  MULTILINGUAL ADVERSARIAL GAP ANALYSIS")
    print("=" * 78)
    print(f"\n  Fixtures:           {len(rows)}  (attack={len(attack)}, benign={len(benign)})")
    print(f"  Layer 3 (rules) caught: {len(rule_caught)}/{len(attack)} attacks")
    print(
        f"  Layer 3 (rules) MISSED: {len(rule_missed)}/{len(attack)} attacks  <-- deterministic gap"
    )

    def block_report(key: str, label: str) -> None:
        if all(r.get(key) is not None for r in rows):
            g_caught = [r for r in attack if r.get(key)]
            g_fp = [r for r in benign if r.get(key) is True]
            e2e = [r for r in attack if r["layer3_detected"] or r.get(key)]
            print(
                f"  Groq [{label}]: caught {len(g_caught)}/{len(attack)} attacks "
                f"(false-positive on benign: {len(g_fp)}/{len(benign)})"
            )
            print(f"    End-to-end (rules OR groq): blocked {len(e2e)}/{len(attack)} attacks")
            missed = [r["name"] for r in attack if not r.get(key)]
            if missed:
                print(f"    missed: {missed}")

    block_report("groq_old_injection_only_detected", "old risk-threshold path (injection_only)")
    block_report("groq_shipped_detected", "shipped path with non-ASCII fix")

    print("\n  Per-fixture details:")
    for r in rows:
        flag = "ATTACK" if r["expected_decision"] == "block" else "benign"
        oldg = (
            "Y"
            if r.get("groq_old_injection_only_detected")
            else "n"
            if r.get("groq_old_injection_only_detected") is not None
            else "-"
        )
        newg = "Y" if r.get("groq_shipped_detected") else "n"
        iomode = "io" if r.get("groq_shipped_injection_only") else "full"
        print(
            f"    {r['name']:<28} [{flag:>5}] L3={'Y' if r['layer3_detected'] else 'n'} "
            f"old={oldg} shipped={newg}({iomode})"
        )
    print("\n" + "=" * 78)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0, help="max fixtures per language")
    parser.add_argument("--delay", type=int, default=400, help="ms sleep between Groq calls")
    parser.add_argument("--mode", default="both", choices=["both", "injection_only", "full"])
    args = parser.parse_args()

    fixtures = load_fixtures()
    if not fixtures:
        print(f"No fixtures found in {CORPUS_DIR}")
        sys.exit(1)

    data = asyncio.run(run_analysis(fixtures, args.delay, args.mode, args.limit))
    summarize(data)

    OUTPUT_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n  Results saved to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
