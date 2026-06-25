"""Seed a workspace + 3 demo agents + research schema for local development.

Usage:
    python scripts/seed.py [--base-url http://localhost:8000]

Outputs environment variable assignments to stdout that can be sourced:
    export WORKSPACE_ID=...
    export WORKSPACE_API_KEY=...
    export PLANNER_ID=...
    export PLANNER_API_KEY=...
    export RESEARCHER_ID=...
    export RESEARCHER_API_KEY=...
    export SUMMARIZER_ID=...
    export SUMMARIZER_API_KEY=...
"""
from __future__ import annotations

import argparse
import json
import sys
import time

import httpx

AGENT_NAMES = ["planner", "researcher", "summarizer"]
RESEARCH_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "query": {"type": "string", "minLength": 1, "maxLength": 1000},
        "context": {"type": "string", "maxLength": 10000},
        "max_results": {"type": "integer", "minimum": 1, "maximum": 50},
    },
    "required": ["query"],
    "additionalProperties": False,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed demo workspace + agents")
    parser.add_argument(
        "--base-url", default="http://localhost:8000", help="Backend base URL"
    )
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    # Wait for backend health
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            r = httpx.get(f"{base}/health", timeout=2.0)
            if r.status_code == 200:
                break
        except httpx.HTTPError:
            pass
        time.sleep(1)
    else:
        print("ERROR: backend not reachable", file=sys.stderr)
        return 1

    email = f"demo-{int(time.time())}@a2afirewall.local"
    r = httpx.post(
        f"{base}/v1/workspaces/register",
        json={"name": "demo", "admin_email": email},
        timeout=10.0,
    )
    r.raise_for_status()
    ws = r.json()
    workspace_id = ws["workspace_id"]
    workspace_key = ws["api_key"]
    ws_headers = {"Authorization": f"Bearer {workspace_key}"}

    print(f"export WORKSPACE_ID={workspace_id}")
    print(f"export WORKSPACE_API_KEY={workspace_key}")

    agents: dict[str, dict] = {}
    for name in AGENT_NAMES:
        r = httpx.post(
            f"{base}/v1/agents",
            headers=ws_headers,
            json={"name": name, "description": f"{name.title()} agent"},
            timeout=10.0,
        )
        r.raise_for_status()
        ag = r.json()
        agents[name] = ag
        env = name.upper()
        print(f"export {env}_ID={ag['agent_id']}")
        print(f"export {env}_API_KEY={ag['api_key']}")

    # Register research schema
    r = httpx.post(
        f"{base}/v1/schemas",
        headers=ws_headers,
        json={
            "task_type": "research",
            "version": "v1",
            "json_schema": RESEARCH_SCHEMA,
        },
        timeout=10.0,
    )
    r.raise_for_status()
    schema = r.json()
    print(f"# registered schema: {json.dumps(schema)}")

    # Default-allow planner→researcher→summarizer
    for sender, receiver in [("planner", "researcher"), ("researcher", "summarizer")]:
        r = httpx.post(
            f"{base}/v1/agents/{agents[sender]['agent_id']}/permissions",
            headers=ws_headers,
            json={
                "receiver_id": agents[receiver]["agent_id"],
                "task_type": "research",
                "allowed": True,
            },
            timeout=10.0,
        )
        if r.status_code >= 400:
            print(
                f"# WARN: could not set permission {sender}->{receiver}: {r.status_code} {r.text}",
                file=sys.stderr,
            )

    print("# seed complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())