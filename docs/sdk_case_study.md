Name's free. Let me check the client's config requirements and the npm side too, since that affects what "deploy the SDK" actually means step by step.Two separable things here: **publishing the SDK packages** so they're installable, and **where to actually run the agents** for the case study itself. I checked both SDKs directly — they're real (397-line Python client, TS client with tweetnacl-based signing), not stubs, so this is genuinely close to shippable.

## 1. Fix package metadata first (both have one issue each)

**Python SDK** (`sdk/pyproject.toml`): the version is out of sync — `pyproject.toml` says `0.1.0`, but `__init__.py` says `__version__ = "0.2.0"`. Fix that, and add a few fields PyPI wants for a real listing:

```toml
[project]
name = "a2a-firewall-sdk"
version = "0.2.0"
description = "SDK for the A2A Firewall inter-agent governance mesh"
readme = "README.md"
license = "MIT"
requires-python = ">=3.10"
dependencies = ["httpx>=0.27.0"]
classifiers = [
    "Programming Language :: Python :: 3",
    "License :: OSI Approved :: MIT License",
    "Operating System :: OS Independent",
]
```
Add a short `sdk/README.md` (PyPI renders this as the package page) — the usage example already in `client.py`'s docstring is most of the content you need.

**TypeScript SDK** (`sdk-ts/package.json`): it's scoped as `@a2a-firewall/sdk`, which means it publishes under an npm *organization* called `a2a-firewall` that doesn't exist yet. Either create that org on npmjs.com (free for public packages) before publishing, or drop the scope to a plain name like `a2a-firewall-sdk` if you don't want the org-management overhead yet.

I confirmed `a2a-firewall-sdk` is unclaimed on PyPI, so you're clear to take it.

## 2. Publish the Python SDK

```bash
cd sdk
python -m pip install --upgrade build twine
python -m build                    # produces dist/*.whl and dist/*.tar.gz

# Test on TestPyPI first — catches metadata problems before they're permanent
python -m twine upload --repository testpypi dist/*
pip install --index-url https://test.pypi.org/simple/ a2a-firewall-sdk
# run examples/planner_agent.py against it to sanity check the install

# Then the real thing
python -m twine upload dist/*
```
You'll need a PyPI account and an API token (Account Settings → API tokens, scoped to this project once it exists). Never commit the token — pass it via `TWINE_PASSWORD` env var or a `.pypirc` that's gitignored.

## 3. Publish the TypeScript SDK

```bash
cd sdk-ts
npm install
npm run build     # tsc → dist/
npm login
npm publish --access public   # --access public required for scoped packages on the free tier
```

## 4. Automate it (worth doing once, not per-release)

Add `.github/workflows/release.yml` triggered on version tags (`v*`), building and publishing both packages. For PyPI specifically, set up [Trusted Publishing](https://docs.pypi.org/trusted-publishers/) (PyPI project settings → configure GitHub Actions as a trusted publisher) instead of storing a long-lived token as a repo secret — it's the current recommended approach and one less credential to leak. For npm, a classic automation token as a repo secret is still the standard path.

## 5. Where to actually *run* the case-study agents — the more important half

This is not the same question as "where does the backend live." Your Render backend is already deployed and that's fine to point at. What you're missing is a place to run the **demo agent processes** (`planner_agent.py`, `researcher_agent.py`, `demo_attack.py`) that generate the traffic for the case study.

A few things to get right:

- **Use a dedicated demo workspace, not your main one.** Register a fresh workspace specifically for this (via the dev login flow for now) so the injected-attack traffic and any messy test data doesn't pollute whatever "real" workspace you later show a design partner. Call it something like `case-study-demo`.
- **You don't need a persistent server for this.** The demo agents are a one-shot script, not a long-running service — running them from your own machine, or as a manual/scheduled GitHub Actions job that hits your live Render backend URL, is enough. Don't spin up a Render worker service for this; it's unnecessary cost and complexity for a scripted demo run.
- **Run it against the real deployed backend, not localhost**, for the case study specifically — a case study run entirely on docker-compose reads as "works on my machine," while one hitting `a2a-firewall.onrender.com` is a stronger claim.
- **Sequence for the actual case-study run:**
  1. Register the demo workspace, register 3 agents (planner/researcher/summarizer), generate their API keys + Ed25519 keypairs.
  2. Run the clean pipeline once — capture the terminal output and the dashboard tree showing all-allow.
  3. Run `demo_attack.py` — capture the block, and specifically capture *which layer* caught it (per the case-study structure from the roadmap — lead with whichever deterministic layer fires, not just Groq).
  4. Pull the hash-chained lineage for that trace from `/v1/tasks/{id}/lineage` and show it in the write-up as the tamper-evidence artifact — that's your strongest differentiator to actually show, not just describe.

## 6. Recording it

Screen-record the terminal (`asciinema` gives you a clean, copyable terminal recording rather than a video if you want it embeddable as text) alongside the dashboard tree view showing the block happen. That combination — real backend, real signed traffic, visible block with cryptographic lineage — is the artifact from Section 3 of the roadmap.

Want me to draft the `release.yml` workflow, or the demo-workspace setup script that registers the three agents and generates their keys in one shot?