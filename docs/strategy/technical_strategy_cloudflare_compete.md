# Technical Strategy to Compete with Cloudflare AI Security

## Executive position

Trying to beat Cloudflare at global edge delivery, SASE coverage, CASB discovery, browser isolation, or network scale is not a realistic near-term objective. The credible route to a technical upper hand is to become the **deepest runtime security and authorization layer for autonomous agents**, while remaining deployable inside a customer's VPC, cluster, endpoint, or air-gapped environment.

Cloudflare's public product is broad: AI Gateway, prompt/response guardrails, DLP, shadow-AI visibility, ZTNA, MCP portals, spend controls, and a globally distributed network. Its MCP governance centralizes servers and controls which users, groups, and tools are visible, while its AI Gateway scans prompts and responses for safety and sensitive data.[^1][^2][^3][^4]

A2A Firewall already has ingredients that are unusually strong at the agent-runtime layer: Ed25519 signing, hash-chained lineage, attenuated delegation, agent identity, RBAC, SCIM, spend enforcement, compliance packs, a transparent TLS proxy, an MCP policy gateway, and eBPF/process-level egress enforcement. Production hardening also added Argon2id authentication, Postgres-backed rate limits, operational telemetry, backup procedures, benchmark infrastructure, and static security analysis. The strategic answer is therefore **not another generic AI Gateway**; it is an **Agent Runtime Security Fabric** that proves who acted, under whose authority, with which constrained capability, on what data, through which tool, and whether the execution escaped policy.

## Competitive gap

| Capability | Cloudflare strength | Current A2A position | Required move |
|---|---|---|---|
| Global traffic delivery | Major structural advantage from Cloudflare's network | Hosted on comparatively small infrastructure | Do not compete directly; offer local sidecars, gateways and bring-your-own-edge deployment |
| User-to-model gateway | Provider routing, rate limits, caching, logs and guardrails[^1] | Inspection pipeline and proxy exist | Add provider adapters, response streaming inspection and semantic caching only where useful |
| DLP | Scans prompts and responses across supported AI providers[^4] | PII patterns and compliance packs exist | Build typed, bidirectional DLP with redaction, tokenization and lineage-aware policies |
| Shadow AI | CASB/SWG visibility and control | Limited discovery | Add endpoint/process discovery, model endpoint inventory and unsanctioned-agent detection |
| MCP aggregation | Single endpoint, Access policies, OAuth and selectable tools/prompts[^2][^5] | MCP stdio/HTTP gateway with content-aware argument controls | Add full MCP portal, OAuth 2.1 delegation and per-call capability tokens |
| Agent-to-agent trust | Public messaging emphasizes users/bots accessing MCP resources | Cryptographic identity, delegation and tamper-evident lineage already exist | Make verifiable A2A authorization the flagship product surface |
| Runtime bypass resistance | Network enforcement through Cloudflare controls | eBPF and process watcher can detect or prevent direct egress | Productize workload identity plus default-deny process egress across Kubernetes and endpoints |
| Agent memory security | Not prominent in the referenced product material | Not established as a complete subsystem | Add memory write firewall, provenance, quarantine, poisoning detection and rollback |
| Action safety | Tool visibility/access is strong | MCP argument inspection and destructive-command blocking exist | Add transaction-aware policy, effect simulation, two-phase commit and compensating actions |
| Explainability | Central logs and policy decisions | Layer-level decisions and cryptographic lineage | Produce machine-verifiable decision evidence, not only natural-language explanations |

## Technical moat

### Verifiable agent authorization

Build every sensitive action around a short-lived **Agent Capability Token** rather than static API keys. A token should bind principal, parent user or service identity, agent identity and version, workflow ID, allowed tools, argument constraints, data classifications, budget, time-to-live, maximum delegation depth, approved destinations, and a nonce. Each child agent must receive a strictly attenuated token; it must never be able to increase scope, spend, duration, or delegation depth.

Sign the token and each execution transition, then anchor them into the existing hash-chained lineage. The verifier should be available as a small open-source library and CLI so customers, auditors, and downstream services can independently validate a decision without trusting the dashboard. This creates a sharper claim than ordinary zero-trust access: **authorization follows the task across every agent and tool hop**.

### Stateful workflow security

Most gateways evaluate requests individually. Add a stateful runtime engine that evaluates the entire workflow graph:

- Detect circular delegation, fan-out explosions, privilege accumulation and unusual tool-call sequences.
- Compare observed execution against a declared plan or finite-state policy.
- Score cumulative risk and cumulative data exposure across hops rather than resetting at every request.
- Quarantine an entire root workflow when one descendant becomes compromised.
- Revoke active capability tokens and terminate descendants when an ancestor is blocked.

The agentic threat model increasingly includes goal hijacking, tool misuse, identity abuse, memory poisoning, insecure inter-agent communication and cascading failures, so single-prompt filtering is insufficient.[^6][^7][^8]

### Memory and RAG firewall

Add a dedicated control plane around vector databases, episodic memory and RAG ingestion. Every memory write should carry source identity, retrieval origin, content hash, classification, confidence, tenant, expiration and the workflow that produced it.

Implement:

- Write-time prompt-injection and malicious-instruction scanning.
- Provenance signatures and content-addressable integrity.
- Trust-tiered collections separating verified, external and quarantined memories.
- Retrieval-time policy filtering based on the requesting agent's capability token.
- Poisoning detection using source concentration, embedding outliers, instruction density and retrieval-trigger anomalies.
- Versioned memory snapshots, rollback and cryptographic deletion receipts.

Memory poisoning persists beyond the original interaction and can influence future sessions, making write validation and integrity controls central to agent security rather than an optional guardrail.[^7][^9][^6]

### Action and transaction safety

Move beyond “is this text malicious?” to “is this proposed effect authorized and reversible?” Add typed tool contracts describing side effects, required approvals, data touched, maximum monetary value, reversibility and compensating action.

For high-impact tools, introduce a two-phase model:

1. **Prepare:** validate arguments, capability, budget, policy, destination reputation and expected effect.
2. **Commit:** execute only after approval or a second independent policy check, using an idempotency key.

Support dry-run adapters for SQL, shell, filesystem, GitHub, cloud IAM and payment APIs. Compare declared intent with predicted effect, block confused-deputy behavior, and automatically invoke compensating actions where supported. This would create an upper hand in actual autonomous execution safety, not merely prompt hygiene.

### Bidirectional typed DLP

Cloudflare already scans prompts and responses for sensitive information, so basic regex PII matching will not differentiate the product. Build DLP that understands the complete agent path:[^4]

- Inspect prompt, model response, MCP arguments/results, file reads/writes, database rows, retrieval chunks and A2A messages.
- Classify fields using schema and context, not only regex.
- Apply actions per destination: allow, block, redact, tokenize, hash, summarize locally or require approval.
- Track derived data so a secret transformed by an agent remains classified.
- Enforce purpose limitation: data approved for summarization cannot later be sent to email or an external model.
- Add customer-controlled detectors and local inference for regulated deployments.

The key differentiator should be **lineage-aware DLP**: policy follows data as it is transformed and delegated, instead of inspecting each isolated request.

### Runtime confinement

Turn the eBPF/process-watcher work into a supported deployment product:

- Kubernetes DaemonSet plus sidecar/ambient proxy modes.
- Workload identity via SPIFFE/SPIRE or cloud workload identities.
- Default-deny egress by agent identity, process, destination, protocol and tool.
- DNS, HTTP CONNECT, QUIC/HTTP3 and direct-IP bypass handling.
- File, subprocess and sensitive-syscall policies where platform support allows.
- Ephemeral execution sandbox for code and browser tools.
- Automatic isolation of rogue agents and forensic bundle capture.

Cloudflare's network is its advantage; A2A Firewall's answer should be **enforcement at the workload and process boundary**, including traffic that never reaches a public edge.

### Decision evidence

Natural-language rationale is useful but insufficient for high-assurance environments. Each decision should return a signed evidence bundle containing policy version, detector versions, input hashes, redacted matched evidence, rule outputs, model-evaluator identity, risk aggregation, authorization chain, timestamp, nonce and final action.

Add deterministic replay so an auditor can rerun a historical decision against the original policy and detector versions. Keep semantic model output as one signal, never the authority for cryptographic identity, permissions, or irreversible actions. This supports a defensible message: **LLMs explain and enrich; deterministic controls authorize and enforce**.

## Parity additions

These features are required to prevent immediate losses in enterprise evaluations, even though they are not the moat.

### Model gateway completeness

Add OpenAI-compatible and native adapters for major model providers, unified routing, streaming support, retries, circuit breakers, timeout budgets, provider health, quotas, caching, fallback models, token accounting and per-model policy. Cloudflare positions AI Gateway as the central point for provider traffic, controls and guardrails, so buyers will expect this baseline.[^1]

Inspection must preserve streaming behavior. Use incremental scanning and a bounded holdback buffer rather than waiting for the entire response. Separate a fast deterministic path from asynchronous deep analysis so low-risk requests avoid remote LLM inspection.

### MCP portal and OAuth

Extend the current MCP gateway into a full registry and portal:

- Import and discover stdio, Streamable HTTP and SSE servers.
- Support the current MCP transport versions and safe compatibility fallback.
- OAuth 2.1/OIDC, dynamic client registration where available, pre-registered clients and service identities.
- Per-user and per-agent authorization rather than shared admin credentials by default.
- Tool/prompt/resource visibility policies plus argument-level policy.
- Signed server manifests, publisher reputation and version pinning.
- Approval workflows for newly discovered or modified tools.

Cloudflare portals already aggregate servers, integrate Access policies, support OAuth and service tokens, and filter visible tools/prompts. Matching that usability while adding attenuated per-call capabilities and content-aware enforcement is the correct technical target.[^2][^10][^11][^12]

### Shadow-agent discovery

Add a discovery sensor that inventories:

- Processes contacting model-provider endpoints.
- Installed MCP configurations and local MCP servers.
- Browser/SaaS AI usage where endpoint integration permits.
- API keys and model SDKs in CI/CD or runtime configuration, reporting fingerprints rather than secret values.
- Unregistered agents, unknown model endpoints and direct-egress bypass attempts.

Feed discovery results into an AI security posture graph that links agent, owner, model, tools, credentials, data stores, policies, vulnerabilities and observed behavior. Cloudflare's broad shadow-AI and posture offering makes inventory a table-stakes capability.

### Enterprise integrations

Add SIEM/SOAR exports, webhooks and native integrations for Splunk, Microsoft Sentinel, Elastic, Datadog, Grafana, Jira and PagerDuty. Add Terraform/OpenTofu provider support, GitOps policy bundles, OPA/Rego or Cedar compatibility, signed policy packages, approval history and drift detection.

Adopt OpenTelemetry GenAI and MCP semantics behind a versioned compatibility layer. The conventions cover agent invocations, workflows and tool execution, but remain in development, so the implementation should dual-emit stable internal attributes and the current external convention rather than coupling storage to an unstable schema.[^13][^14][^15]

## Architecture target

Use four separable planes:

1. **Enforcement plane:** local proxy, MCP wrapper, Kubernetes sidecar/ambient component, eBPF/process guard and sandbox. It must continue enforcing cached deterministic policy if the control plane is unavailable.
2. **Decision plane:** deterministic policy VM, capability verifier, schema/DLP engine, workflow-risk engine and optional local semantic classifier.
3. **Control plane:** tenants, identity federation, agent/tool registry, policy authoring, approvals, revocation, spend and posture graph.
4. **Evidence plane:** append-only signed events, lineage graph, OTel export, replay engine, compliance reports and SIEM delivery.

Make the enforcement plane open and portable. Offer the control/evidence planes as hosted, customer-VPC and air-gapped deployments. This avoids direct dependence on owning a global network and turns data sovereignty into an advantage.

## Delivery priorities

### First 30 days

- Convert cryptographic delegation into formal, versioned capability tokens with offline verification.
- Add response/tool-result inspection to the proxy and MCP gateway.
- Add policy-as-code bundles, signed policy versions and decision evidence envelopes.
- Add provider adapters and a fast-path/deep-path architecture.
- Ship Kubernetes deployment manifests and basic SPIFFE-compatible workload identity.
- Publish a precise OWASP Agentic Top 10 coverage matrix; avoid claiming coverage without tests.

### Days 31–60

- Implement memory write/read gateway with provenance, quarantine and rollback.
- Build typed tool contracts and prepare/commit enforcement for destructive tools.
- Add lineage-aware DLP with redact/tokenize/block actions.
- Add MCP registry/portal plus OAuth/OIDC and per-agent authorization.
- Add posture graph and basic shadow-agent discovery from proxy/eBPF observations.
- Export current OpenTelemetry GenAI/MCP spans through a compatibility adapter.

### Days 61–90

- Add workflow anomaly detection and root-workflow kill/revocation.
- Add sandbox adapters for shell, browser, filesystem and SQL.
- Add SIEM/SOAR integrations and Terraform provider.
- Add high-availability control-plane deployment, offline policy cache and failure-mode testing.
- Run the external security review against capability attenuation, replay resistance, policy bypass, MCP confused-deputy scenarios, memory poisoning and egress escape.
- Publish attack-corpus results, layer-by-layer detection contribution, false-positive measurements and latency for deterministic, local-semantic and remote-semantic paths.

## Priority scorecard

| Initiative | Competitive value | Engineering effort | Priority |
|---|---:|---:|---:|
| Verifiable capability tokens | Very high | Medium | P0 |
| Decision evidence and replay | Very high | Medium | P0 |
| Memory/RAG firewall | Very high | High | P0 |
| Stateful workflow security | Very high | High | P0 |
| Typed action safety | Very high | High | P0 |
| Bidirectional lineage-aware DLP | High | High | P1 |
| Kubernetes/runtime confinement | High | High | P1 |
| Full MCP portal and OAuth | High | Medium-high | P1 |
| Model gateway parity | Medium | Medium | P1 |
| Shadow-agent discovery/posture graph | Medium-high | High | P2 |
| CASB/RBI replacement | Low strategic fit | Very high | Do not build now |
| Global CDN/SASE replacement | Not feasible near-term | Extreme | Partner instead |

## Claims to avoid

Do not claim to be “better than Cloudflare” in general. Cloudflare has major advantages in network reach, established enterprise access controls and breadth across workforce, application and edge security. Make narrow, testable claims instead:

- Cryptographically verifiable authorization across multi-agent delegation.
- Stateful workflow and cumulative-risk enforcement.
- Memory and RAG write-path security with provenance and rollback.
- Process-level prevention of agent gateway bypass.
- Signed, replayable decision evidence.
- Customer-VPC and air-gapped deployment with no prompt data leaving the environment.

Each claim should be tied to a public test, threat scenario, benchmark and reproducible demo. The existing deterministic benchmark reported strong early results, but the corpus should be expanded and tested against live integrations and adversarial variants before using it as a broad commercial accuracy claim.

## Product message

**Cloudflare secures access to AI across the enterprise. A2A Firewall secures what autonomous agents are authorized to do after access is granted.**

The resulting category is not simply an LLM firewall. It is a **zero-trust execution and evidence layer for AI agents**: identity-bound, delegation-aware, stateful, memory-safe, tool-aware, runtime-enforced and independently verifiable.

---

## References

1. [Guardrails · Cloudflare AI Gateway docs](https://developers.cloudflare.com/ai-gateway/features/guardrails/) - Guardrails help you deploy AI applications safely by intercepting and evaluating both user prompts a...

2. [MCP server portals · Cloudflare Zero Trust docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/configure-apps/mcp-servers/mcp-portals/) - An MCP server portal centralizes multiple Model Context Protocol (MCP) servers onto a single HTTP en...

3. [MCP governance · Cloudflare Agents docs](https://developers.cloudflare.com/agents/model-context-protocol/protocol/governance/) - Control which MCP servers your organization uses and enforce access policies with Cloudflare Access.

4. [Data Loss Prevention (DLP) - AI Gateway](https://developers.cloudflare.com/ai-gateway/features/dlp/) - Protect sensitive data in AI Gateway prompts and responses using Cloudflare DLP detection engines.

5. [MCP server portals · Cloudflare One docs](https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/mcp-portals/) - This guide explains how to add MCP servers to Cloudflare Access, create an MCP portal with customize...

6. [The Ten Risks At A Glance](https://blckalpaca.at/en/knowledge-base/ai-agents/ai-agent-security-owasp/owasp-agentic-asi-top-10-2026) - The OWASP Agentic Top 10 (ASI01–ASI10) is the risk list for autonomous AI agents published on 9 Dece...

7. [OWASP Agentic AI Top 10: Real Attack Chains Are Arriving Before Enterprise Defenses](https://lyrie.ai/research/research/owasp-agentic-ai-top10-enterprise-gap) - TL;DR: OWASP's first formal agentic AI risk taxonomy ASI01–ASI10 landed in December 2025. By April 2...

8. [Addressing the OWASP Top 10 Risks in Agentic AI with Microsoft ...](https://www.microsoft.com/en-us/security/blog/2026/03/30/addressing-the-owasp-top-10-risks-in-agentic-ai-with-microsoft-copilot-studio/) - Agentic AI introduces new security risks. Learn how the OWASP Top 10 Risks for Agentic Applications ...

9. [OWASP Top 10 for Agentic Applications - Lasso Security](https://www.lasso.security/blog/owasp-top-10-for-agentic-applications) - Explore the OWASP Top 10 for Agentic Applications, from goal hijacking to memory poisoning, and how ...

10. [Access Changelog](https://developers.cloudflare.com/changelog/product/access/)

11. [Secure approved AI models and tools](https://developers.cloudflare.com/learning-paths/holistic-ai-security/secure-approved-ai-models-tools/) - Monitor and secure generative AI usage.

12. [Service token support for MCP server portals · Changelog](https://developers.cloudflare.com/changelog/post/2026-06-26-mcp-portal-service-tokens/) - You can now use an Access service token to connect autonomous agents and bots to an MCP server porta...

13. [Agents And Mcp Get...](https://dev.to/azena-ai/opentelemetrys-genai-semantic-conventions-are-not-stable-yet-heres-what-actually-shipped-in-2026-3mke) - If you search for "OpenTelemetry GenAI semantic conventions" right now, you'll find a pile of blog.....

14. [semantic-conventions/docs/gen-ai/README.md at main · open-telemetry/semantic-conventions](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/README.md) - Defines standards for generating consistent, accessible telemetry across a variety of domains - open...

15. [The state of the OpenTelemetry GenAI semantic conventions ...](https://john-hodge.com/blog/opentelemetry-genai-semantic-conventions/) - The OTel GenAI conventions moved to a dedicated repository with no versioned release yet, nothing Ge...

