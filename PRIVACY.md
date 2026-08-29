# Privacy & Data Processing Policy — A2A Firewall

A2A Firewall is built from the ground up on the principles of **Privacy-by-Design**, **Zero-Trust**, and **Data Minimization**. This policy outlines how data is handled across self-hosted and cloud-managed deployments.

---

## 🏛️ Guiding Privacy Principles

1. **Zero-Knowledge Core**: By default, A2A Firewall operates in-memory for deterministic security checks. Payload contents are inspected in volatile memory and never retained longer than necessary.
2. **Automated PII Scrubbing**: Built-in regex and Luhn algorithms automatically detect, mask, or scrub Personally Identifiable Information (PII) — including Aadhaar numbers, PAN, SSNs, Credit Cards, and emails — before logs are persisted.
3. **Tenant Data Isolation**: Multi-tenant workspaces are strictly isolated via UUID namespaces, dedicated cryptographic keys, and database foreign-key constraints.

---

## 📋 Data Handling Across Deployment Models

| Data Category | Self-Hosted / On-Premise (Docker/K8s) | Cloud-Managed (Render/AWS) |
| :--- | :--- | :--- |
| **Inter-Agent Payloads** | Stored entirely within customer database according to customer retention rules. | Volatile memory only. Payloads are discarded immediately after inspection unless review queue is enabled. |
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
- **Email**: `privacy@a2a-firewall.io` (or `mananjp@users.noreply.github.com`)
