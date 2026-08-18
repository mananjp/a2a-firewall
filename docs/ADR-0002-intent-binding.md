# ADR-0002: Intent-Binding for Multi-Agent Session Trust

## Status
Accepted

## Context
Non-amplification enforcement (ADR-0001) prevents sub-agents from requesting capabilities exceeding their token caveats. However, an attacker exploiting a confused-deputy flaw can still craft a payload that fits within valid capability caveats while **drifting away from the root task's original purpose** (e.g., a research agent asking a database agent for user credentials under the guise of "research").

Role-based access control and scope checks cannot detect semantic drift when the requested action is technically permitted by role permissions.

## Decision
We implement **Intent-Binding** at Layer 4 (Groq Semantic Layer) of the A2A Firewall:

1. **Declared Intent Propagation**: When a root task is initialized, the caller declares the root task's overall purpose statement (`declared_intent`). This intent is persisted on the root task row.
2. **Lineage Context Lookup**: When a child delegated task is inspected, the firewall automatically resolves the root task's `declared_intent`.
3. **Groq Intent Consistency Scoring**: The root `declared_intent` is passed alongside the child payload to Groq LLM classifier, which evaluates an `intent_consistency` score between `0.0` (fully consistent) and `1.0` (completely drifted/contradictory).
4. **Drift Threshold Enforcement**: If `intent_drift_score > INTENT_DRIFT_THRESHOLD` (default: 0.7), the firewall generates a critical `intent_drift` violation and blocks the request.

## Consequences
### Positive
- Defends against semantic prompt injection and goal hijacking across multi-hop delegation chains.
- Provides quantitative drift telemetry (`intent_drift_score`) visible in the audit dashboard.
- Activates conditionally only when both a `declared_intent` and `delegation_token` exist, avoiding unnecessary LLM calls for plain tasks.

### Negative / Trade-offs
- Adds LLM evaluation latency (~100-300ms) for delegated requests when LLM inspection is triggered.
- Requires network connectivity to the Groq API (gracefully degrades to standard rules if Groq API is unavailable).
