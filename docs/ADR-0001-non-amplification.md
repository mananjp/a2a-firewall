# ADR-0001: Non-Amplification Principle in Multi-Agent Delegation

## Status
Accepted

## Context
In multi-agent systems, agents delegate tasks to other agents across multi-hop chains. A central security vulnerability in these architectures is the **confused deputy problem** — where a low-privilege agent (or an attacker using prompt injection against a low-privilege agent) tricks a higher-privilege sub-agent into taking actions that exceed the original delegator's authority.

Traditional security gateways evaluate requests strictly against static permissions or single-prompt content rules. They lack awareness of the delegation trust relationship between agents, allowing permission expansion across delegation hops.

## Decision
We enforce the **Non-Amplification Principle** at Layer 2 of the A2A Firewall inspection pipeline:

1. **Caveat-based Scope Extraction**: At every delegation hop, the child agent's requested capabilities (`task_type`, `resource_type`, `action`, `max_risk`) are parsed into a normalized capability scope set.
2. **Strict Subset Check (`is_subset`)**: Every capability requested by a delegatee must be a **STRICT SUBSET** (or equal) of the caveats embedded in the delegator's macaroon-style `DelegationToken`.
3. **Immediate Short-Circuit Block**: If a delegatee asks for any capability not granted by the delegator's token caveats (or if numeric bounds like `max_risk` or `max_depth` exceed parent limits), the request is immediately blocked with a `non_amplification_violation` event.

## Consequences
### Positive
- Completely prevents permission escalation across multi-agent delegation chains.
- Purely functional, deterministic check running in microsecond time before rule engines or LLM inspection.
- Preserves backward compatibility: plain un-tokenized requests follow standard workspace permission policies without non-amplification gating.

### Negative / Trade-offs
- Delegation tokens must explicitly declare caveats for all resources a sub-agent might need to access.
- Requires delegating agents to use macaroon tokens generated or attenuated via the SDK.
