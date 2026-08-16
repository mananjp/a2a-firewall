"""Integration tests for the non-amplification enforcement through the orchestrator.

These tests require a running Postgres + backend. Set TEST_DATABASE_URL and
TEST_BACKEND_URL to enable them. Skipped otherwise.

Scenarios:
1. **Widening blocked**: parent token with ``max_risk=0.3, task_type=research``;
   child request asks for ``risk_threshold=0.8`` -> expect ``decision="block"``
   and violation ``non_amplification_violation``.
2. **Narrowing allowed**: same parent; child request asks for
   ``risk_threshold=0.2`` -> expect ``decision="allow"`` (no scope violation).
3. **Unparented capability rejected**: parent token grants only research;
   child asks for a different task_type -> blocked.
4. **Plain request (no token) still allowed**: back-compat — non-amplification
   is only enforced when a delegation token is supplied.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import time
import uuid
from typing import Any

import httpx
import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
TEST_BACKEND_URL = os.environ.get("TEST_BACKEND_URL", "http://localhost:8000")

pytestmark = pytest.mark.integration


# ---------------------------------------------------------------------------
# Fixtures (mirrors test_firewall_endpoint.py)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module", autouse=True)
def require_db() -> None:
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set; integration tests skipped")


@pytest.fixture(scope="module", autouse=True)
def alembic_upgrade(require_db: None) -> None:
    assert TEST_DATABASE_URL is not None
    env = os.environ.copy()
    env["DATABASE_URL"] = TEST_DATABASE_URL
    venv_bin = "Scripts" if os.name == "nt" else "bin"
    venv_python_name = "python.exe" if os.name == "nt" else "python"
    venv_python = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        ".venv",
        venv_bin,
        venv_python_name,
    )
    subprocess.run(
        [venv_python, "-m", "alembic", "upgrade", "head"],
        check=True,
        env=env,
        cwd=os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        capture_output=True,
        text=True,
    )


@pytest.fixture(scope="module")
def backend_url() -> str:
    return TEST_BACKEND_URL


@pytest.fixture(scope="module")
def registered_workspace(backend_url: str) -> dict[str, Any]:
    email = f"namp-{int(time.time())}-{uuid.uuid4().hex[:8]}@test.local"
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        r = c.post("/v1/workspaces/register", json={"name": "namp-test", "admin_email": email})
        r.raise_for_status()
        return r.json()


@pytest.fixture(scope="module")
def registered_agents(
    backend_url: str, registered_workspace: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    headers = {"Authorization": f"Bearer {registered_workspace['api_key']}"}
    agents: dict[str, dict[str, Any]] = {}
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        for name in ("planner", "researcher"):
            r = c.post(
                "/v1/agents",
                headers=headers,
                json={"name": name, "description": f"{name} for non-amplification test"},
            )
            r.raise_for_status()
            agents[name] = r.json()
        # Register research schema
        r = c.post(
            "/v1/schemas",
            headers=headers,
            json={
                "task_type": "research",
                "version": "v1",
                "json_schema": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            },
        )
        r.raise_for_status()
        # Planner -> Researcher permission
        r = c.post(
            f"/v1/agents/{agents['planner']['agent_id']}/permissions",
            headers=headers,
            json={"receiver_id": agents["researcher"]["agent_id"], "task_type": "research"},
        )
        r.raise_for_status()
    return agents


def _mint_parent_token(workspace_id: str, caveats: list[str]) -> str:
    """Mint a delegation token with the same root key the orchestrator derives.

    The orchestrator at ``detection/orchestrator.py`` derives
    ``root_key = hash_api_key(str(workspace.id)).encode()[:32]``. We mirror
    that here so the token verifies.
    """
    from a2a_firewall.core.delegation import mint_token, token_to_compact
    from a2a_firewall.core.security import hash_api_key

    root_key = hash_api_key(workspace_id).encode()[:32]
    assert len(root_key) == 32
    token = mint_token(root_key, workspace_id, "delegated-agent", caveats)
    return token_to_compact(token)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_non_amplification_widening_blocked(
    backend_url: str,
    registered_workspace: dict[str, Any],
    registered_agents: dict[str, dict[str, Any]],
) -> None:
    """Parent allows max_risk=0.3; child asks for 0.8 → must be blocked."""
    planner = registered_agents["planner"]
    researcher = registered_agents["researcher"]
    token = _mint_parent_token(
        registered_workspace["workspace_id"],
        ["task_type=research", "max_risk=0.3"],
    )
    headers = {"Authorization": f"Bearer {planner['api_key']}"}
    body = {
        "task_id": str(uuid.uuid4()),
        "receiver_agent_id": researcher["agent_id"],
        "task_type": "research",
        "payload": {"query": "narrow me", "risk_threshold": 0.8},
        "depth": 0,
        "delegation_token": token,
    }
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        r = c.post("/v1/firewall/inspect", headers=headers, json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["decision"] == "block"
    assert data["allowed_to_proceed"] is False
    violation_types = [v["violation_type"] for v in data["violations"]]
    assert "non_amplification_violation" in violation_types
    # The violation should surface the requested + parent caveats for audit
    nav = next(
        v for v in data["violations"] if v["violation_type"] == "non_amplification_violation"
    )
    assert "max_risk=0.8" in nav["details"]["requested"]
    assert "max_risk=0.3" in nav["details"]["parent_caveats"]


def test_non_amplification_narrowing_allowed(
    backend_url: str,
    registered_workspace: dict[str, Any],
    registered_agents: dict[str, dict[str, Any]],
) -> None:
    """Parent allows max_risk=0.8; child asks for 0.2 → must pass Layer 2."""
    planner = registered_agents["planner"]
    researcher = registered_agents["researcher"]
    token = _mint_parent_token(
        registered_workspace["workspace_id"],
        ["task_type=research", "max_risk=0.8"],
    )
    headers = {"Authorization": f"Bearer {planner['api_key']}"}
    body = {
        "task_id": str(uuid.uuid4()),
        "receiver_agent_id": researcher["agent_id"],
        "task_type": "research",
        "payload": {"query": "narrowed fine", "risk_threshold": 0.2},
        "depth": 0,
        "delegation_token": token,
    }
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        r = c.post("/v1/firewall/inspect", headers=headers, json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    # No non-amplification violation expected
    violation_types = [v["violation_type"] for v in data["violations"]]
    assert "non_amplification_violation" not in violation_types
    # Should pass through to the rest of the pipeline (allow on clean payload)
    assert data["decision"] in ("allow", "review")


def test_non_amplification_unparented_task_type_rejected(
    backend_url: str,
    registered_workspace: dict[str, Any],
    registered_agents: dict[str, dict[str, Any]],
) -> None:
    """Parent token scopes to research; child requests 'payments' → blocked."""
    planner = registered_agents["planner"]
    researcher = registered_agents["researcher"]
    token = _mint_parent_token(
        registered_workspace["workspace_id"],
        ["task_type=research"],
    )
    headers = {"Authorization": f"Bearer {planner['api_key']}"}
    body = {
        "task_id": str(uuid.uuid4()),
        "receiver_agent_id": researcher["agent_id"],
        # The token does not grant 'payments' — even though schema would
        # accept it, the non-amplification check must reject it.
        "task_type": "payments",
        "payload": {"amount": 100},
        "depth": 0,
        "delegation_token": token,
    }
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        r = c.post("/v1/firewall/inspect", headers=headers, json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["decision"] == "block"
    violation_types = [v["violation_type"] for v in data["violations"]]
    assert "non_amplification_violation" in violation_types


def test_no_token_skips_non_amplification(
    backend_url: str,
    registered_workspace: dict[str, Any],
    registered_agents: dict[str, dict[str, Any]],
) -> None:
    """Back-compat: a request without a delegation_token is not subject to
    the non-amplification check. Plain AgentPermission rules still apply.
    """
    planner = registered_agents["planner"]
    researcher = registered_agents["researcher"]
    headers = {"Authorization": f"Bearer {planner['api_key']}"}
    body = {
        "task_id": str(uuid.uuid4()),
        "receiver_agent_id": researcher["agent_id"],
        "task_type": "research",
        "payload": {"query": "plain request, no token"},
        "depth": 0,
    }
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        r = c.post("/v1/firewall/inspect", headers=headers, json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    violation_types = [v["violation_type"] for v in data["violations"]]
    assert "non_amplification_violation" not in violation_types
