# Secrets Management Guide

## Overview

A2A Firewall uses several secrets for authentication, encryption, and external
service access. This document inventories all secrets, their storage locations,
and rotation procedures.

## Secret Inventory

| Secret | Purpose | Where Stored | Rotation Frequency |
|---|---|---|---|
| `DATABASE_URL` | Neon Postgres connection string | Render env var | On credential rotation |
| `GROQ_API_KEY` | LLM inference for Layer 4 semantic analysis | Render env var | Quarterly or on compromise |
| `SECRET_KEY` | JWT/session signing, PBKDF2 seed for workspace Ed25519 keys | Render env var | On compromise only (rotating invalidates all signing keys) |
| `API_KEY_SALT` | Salt for API key hashing (SHA-256) | Render env var | On compromise only (rotating invalidates all existing API keys) |
| `OTEL_EXPORTER_OTLP_HEADERS` | Grafana Cloud OTLP auth token | Render env var | Annually or on compromise |
| `NVD_API_KEY` | NIST NVD API rate limit increase (optional) | Render env var | Annually |
| `RENDER_BACKEND_HOOK` | Deploy webhook URL | GitHub repo secret | On regeneration |
| `RENDER_FRONTEND_HOOK` | Deploy webhook URL | GitHub repo secret | On regeneration |

## Storage Rules

### ✅ DO
- Store all secrets in **Render environment variables** (production)
- Use **GitHub repository secrets** for CI/CD tokens
- Use `.env` files **only** for local development
- Generate secrets with cryptographically secure random generators

### ❌ DON'T
- Never commit `.env` files to git (`.gitignore` already covers this)
- Never hardcode secrets in source code
- Never log secret values (even partially)
- Never share secrets via chat, email, or unencrypted channels

## Rotation Procedures

### Rotating `GROQ_API_KEY`

1. Generate a new key in the [Groq Console](https://console.groq.com)
2. Update in Render dashboard → Backend service → Environment
3. Trigger a redeploy (or wait for next push)
4. Revoke the old key in Groq Console

### Rotating `DATABASE_URL`

1. In Neon Console, go to **Settings → Reset password**
2. Copy the new connection string
3. Update in Render dashboard → Backend service → Environment
4. Trigger a redeploy
5. Old connections will be terminated automatically

### Rotating `SECRET_KEY`

> [!CAUTION]
> Rotating `SECRET_KEY` invalidates all workspace Ed25519 signing keys derived
> via `derive_workspace_signing_seed()`. Existing signed delegation tokens will
> fail verification. Only rotate on confirmed compromise.

1. Generate a new 256-bit random string: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
2. Update in Render dashboard
3. Trigger a redeploy
4. All workspaces will need to re-mint delegation tokens

### Rotating `API_KEY_SALT`

> [!CAUTION]
> Rotating `API_KEY_SALT` invalidates **all existing API key hashes**. Every
> workspace and agent will need a new API key. Only rotate on confirmed compromise.

1. Generate a new salt: `python -c "import secrets; print(secrets.token_urlsafe(24))"`
2. Update in Render dashboard
3. Trigger a redeploy
4. All users must re-login to get new API keys

## Recommended Improvements (Pre-Design-Partner)

1. **Adopt a secrets manager**: Consider [Doppler](https://www.doppler.com/) or
   [Infisical](https://infisical.com/) (both have free tiers). This provides:
   - Audit trail for secret access
   - Automatic rotation capabilities
   - Environment-aware secret injection
   - Team access controls

2. **Set up secret scanning**: Enable GitHub's secret scanning to catch
   accidental commits of API keys or tokens.

3. **Use Render's secret files**: For multi-line secrets (like TLS certificates),
   use Render's secret files feature instead of env vars.

## Audit Checklist

- [ ] All secrets in `.env.example` use placeholder values (not real credentials)
- [ ] `.env` is in `.gitignore` and not tracked by git
- [ ] No secrets appear in git history (`git log -p --all -S "gsk_"`)
- [ ] Render env vars are set with `sync: false` for sensitive values
- [ ] GitHub repo secrets are configured for CI/CD
- [ ] Secret rotation dates are tracked
