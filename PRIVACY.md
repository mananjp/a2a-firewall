# Privacy & Data Processing Policy — A2A Firewall

A2A Firewall is built from the ground up on the principles of **Privacy-by-Design**, **Zero-Trust**, and **Data Minimization**. This policy outlines how data is handled across self-hosted and cloud-managed deployments.

> **The canonical, published version of this policy is the web page at
> [`/privacy`](https://a2a-firewall.onrender.com/privacy).** This file is a
> convenience copy for readers browsing the repository. If the two ever disagree,
> the web page governs, because that is the version customers are bound to.

---

## 🏛️ Guiding Privacy Principles

1. **Zero-Knowledge Core**: By default, A2A Firewall operates in-memory for deterministic security checks. Payload contents are inspected in volatile memory and never persisted longer than necessary.
   - **Exception — the optional LLM layer.** Where semantic detection is enabled (Pro, Team and Enterprise tiers), up to the **first 300 characters** of each payload are transmitted to the configured LLM provider (Groq, or your own provider) for classification. That excerpt is sent unredacted; the PII scrubbing described below applies to *persisted logs*, not to this transmission. If agent content must never leave your infrastructure, disable the LLM layer or configure your own provider. See [Section: LLM sub-processor](#-llm-sub-processor) below.
2. **Automated PII Scrubbing**: Built-in regex and Luhn algorithms automatically detect, mask, or scrub Personally Identifiable Information (PII) — including Aadhaar numbers, PAN, SSNs, Credit Cards, and emails — before logs are persisted.
3. **Tenant Data Isolation**: Multi-tenant workspaces are strictly isolated via UUID namespaces, dedicated cryptographic keys, and database foreign-key constraints.

---

## 🤖 LLM sub-processor

The single point at which agent content leaves a deployment's own perimeter is the semantic detection layer.

| | |
| :--- | :--- |
| **Provider** | Groq, or whichever LLM provider the workspace has configured |
| **Data sent** | An excerpt of the agent payload: `str(payload)[:300]` |
| **Redacted first?** | No — the excerpt is sent as-is |
| **When** | Only where the LLM layer is enabled (Pro / Team / Enterprise). Never on Free. |
| **Code** | `backend/src/a2a_firewall/detection/layer4_groq.py` |
| **Data residency** | United States |

Payload content is **not** used for model training by the Operator. Customers who cannot accept this egress should keep the LLM layer disabled or bring their own provider key, in which case the transfer is governed by the customer's own agreement with that provider.

---

## 📋 Data Handling Across Deployment Models

| Data Category | Self-Hosted / On-Premise (Docker/K8s) | Cloud-Managed (Render/AWS) |
| :--- | :--- | :--- |
| **Inter-Agent Payloads** | Stored entirely within customer database according to customer retention rules. | Held in memory during inspection and discarded immediately after, unless the review queue is enabled. Up to 300 characters may be sent to the configured LLM provider when the LLM layer is enabled — see [LLM sub-processor](#-llm-sub-processor). |
| **Cryptographic Signatures** | Hashes and Ed25519 signatures stored locally for audit trails. | Hashes and signatures stored in encrypted tenant database. |
| **Telemetry & Metrics** | OpenTelemetry spans routed directly to customer's OTLP collector (Jaeger/Datadog). | Aggregated performance metrics (latency, risk scores) without prompt content. |
| **Customer AI API Keys** | Kept in local container memory; never transmitted to A2A servers. | Never stored; passed through TLS tunnels. |

---

## 🛡️ Compliance Alignment

A2A Firewall satisfies data protection and privacy requirements across major global regulatory frameworks:

### 1. Digital Personal Data Protection Act (DPDP - India)
- **Data Fiduciary Controls**: Provides explicit data retention lifecycles and permanent purge tools.
- **Aadhaar / PII Masking**: Automatically detects Indian 12-digit Aadhaar numbers and 10-character PAN identifiers, applying masking rules.

### 2. Reserve Bank of India (RBI Cyber Security Framework)
- **Payment Tokenization**: Scans for credit card numbers with Luhn-algorithm validation to prevent unmasked storage.
- **Immutable Audit Trail**: Ed25519 hash-chained logs ensure regulatory non-repudiation.

### 3. Health Insurance Portability and Accountability Act (HIPAA)
- **Protected Health Information (PHI)**: In-flight detection and redaction of patient names, medical IDs, and healthcare records.
- **Audit Logging**: Minimum 365-day retention floor enforcement for administrative and security actions.

### 4. General Data Protection Regulation (GDPR - EU) & CCPA (California)
- **Right to Erasure (Article 17)**: One-click workspace purge tools permanently erase all associated telemetry, logs, and agent metadata.
- **Data Minimization (Article 5)**: Inter-agent inspection extracts only required features (intent, tool arguments) without storing whole conversation contexts.

---

## 🗄️ Retention & Data Purge Controls

Enterprise administrators have full control over data retention windows via **Dashboard &rarr; Data Retention** (`/dashboard/retention`):

- **Payload Retention**: Configurable from `1` to `90` days (default: `7` days).
- **Telemetry Records**: Configurable from `7` to `180` days (default: `30` days).
- **Audit Logs**: Protected by compliance floor (minimum `365` days).
- **Automated Scrubbing**: Aging records have sensitive payload fields zeroed out prior to permanent deletion.

---

## ✉️ Privacy Contact

For privacy inquiries, Data Protection Officer (DPO) coordination, or regulatory audit requests:
- **Email**: `mananjpanchal11@gmail.com`
- **Published policy**: [`/privacy`](https://a2a-firewall.onrender.com/privacy)
- **Contact page**: [`/contact`](https://a2a-firewall.onrender.com/contact)
