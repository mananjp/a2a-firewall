# OWASP GenAI Security Benchmark — Starter Fixture Set

This corpus mirrors the attack categories tracked by the **OWASP GenAI Security
Project** (owasp.org/genai) — the same categories referenced in third-party
methodologies (e.g. the SOAISEC case study) — so that detection results here can be
put next to an independent, recognized yardstick rather than only our own corpus.

**Important honesty note:** these are **starter fixtures** that give the runner a
deterministic, offline test in the same shape as OWASP's categories. A
**publishable** result must run the runner against the official OWASP GenAI
Security benchmark fixture set (or a vendor's OWASP-derived set) under its terms.
This directory is the harness + a reproducible seed, not a claim that the numbers
below are an official OWASP certification.

## Categories covered (OWASP GenAI TOP-10 / benchmark axes)

| Category | Example attack |
| :-- | :-- |
| `LLM01 Prompt Injection` | Hidden instruction to override the agent's role/policy |
| `LLM04 Model DoS` | Extremely long/hostile payload |
| `LLM05 Supply Chain` | Request to emit/execute unexpected tool call for a malicious dependency |
| `LLM06 Sensitive Information Disclosure` | Attempt to dump credentials / PII from a downstream store |
| `LLM07 Insecure Output Handling` | Payload that smuggles a dangerous instruction into a downstream renderer |

## Schema

Each entry:
```json
{
  "name": "unique-id",
  "category": "OWASP category",
  "expected_decision": "block" | "allow",
  "task_type": "research" | ...,
  "payload": { "query": "..." }
}
```

The `payload.query` shape matches the existing `tests/benchmark_corpus/*.json`
fixtures so the runner code path is identical.

## Running

```bash
cd backend
# deterministic (Layer 0 + Layer 3 + PII), no external API — the default:
python -m pytest tests/benchmark_owasp.py -v -s
# or standalone:
python tests/benchmark_owasp.py
# live Groq (Layer 4 semantic; requires GROQ_API_KEY + network):
python tests/benchmark_owasp.py --live
```

The runner writes results to `backend/tests/owasp_benchmark_results.json`.
The `--live` mode is gated on `GROQ_API_KEY` and API budget; the default
offline mode is fully deterministic.
