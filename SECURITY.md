# Security Policy & Vulnerability Disclosure

A2A Firewall is designed as critical infrastructure for enterprise AI security. We take the security of our platform, SDKs, proxy, and kernel eBPF modules seriously and appreciate responsible security research.

---

## 🛡️ Supported Versions

Security updates are actively provided for the following versions:

| Component | Supported Versions | Security Support Status |
| :--- | :--- | :--- |
| **A2A Firewall Core / Backend** | `>= 1.1.0` | 🟢 Actively Supported |
| **Python SDK (`a2a-firewall-sdk`)** | `>= 0.3.0` | 🟢 Actively Supported |
| **TypeScript SDK (`a2a-firewall-sdk`)** | `>= 0.3.0` | 🟢 Actively Supported |
| **A2A Transparent Proxy (`a2a-proxy`)** | `>= 1.0.0` | 🟢 Actively Supported |
| **Older Releases** | `< 1.0.0` | 🔴 End of Life (Upgrade Recommended) |

---

## 🔒 Reporting a Vulnerability

If you discover a potential security vulnerability in A2A Firewall, **please do not open a public GitHub issue**. Instead, report it through one of the following confidential channels:

1. **GitHub Private Vulnerability Reporting (Preferred)**:
   - Go to [Security &rarr; Advisories &rarr; Report a vulnerability](https://github.com/mananjp/a2a-firewall/security/advisories/new).
2. **Email**:
   - Send details to **`security@a2a-firewall.io`** (or `mananjp@users.noreply.github.com`).
   - If sensitive, encrypt your email using our PGP public key (fingerprint available upon request).

### What to Include in Your Report:
- A clear description of the vulnerability (e.g. proxy bypass, caveat verification flaw, denial-of-service, remote code execution).
- Step-by-step proof-of-concept (PoC) or minimal reproduction script.
- The component and version affected.
- Any potential remediations or patches you have identified.

---

## ⏱️ Response Time & SLA Commitments

We adhere to the following response timeline:

| Milestone | Target SLA |
| :--- | :--- |
| **Initial Acknowledgment** | Within **24 hours** |
| **Triage & Severity Assessment** | Within **48 hours** |
| **Fix Development & Testing** | Within **7 days** (Critical: **72 hours**) |
| **Public Advisory & Release** | Coordinated with reporter (Standard: **30-day disclosure window**) |

---

## 🤝 Coordinated Vulnerability Disclosure (CVD)

We follow the principle of **Coordinated Vulnerability Disclosure**:
- We request that reporters give us reasonable time to remediate and deploy fixes before publicly disclosing vulnerability details.
- We will publicly credit reporters in our security release notes and CVE acknowledgments (unless requested to remain anonymous).
- We do not pursue legal action against researchers who act in good faith, avoid privacy violations, and adhere to responsible disclosure guidelines.

---

## 🔍 Security Architecture Highlights

For security researchers auditing A2A Firewall:
- **Zero-Trust Identity**: Every inter-agent hop is verified using Ed25519 asymmetric cryptography.
- **Macaroon Attenuation**: Sub-agent capabilities are cryptographically bound to parent delegations via HMAC-SHA256 caveat chains.
- **TLS Interception Sandbox**: The proxy generates dynamic ephemeral leaf certs signed by a local Root CA with sanitized SAN headers.
- **Kernel Bounds**: Egress guard enforces `cgroup/connect4` kernel socket filters with loopback subnet checks and anti-loop marks (`0xA2A1`).
