"""Integration tests locking the API contract between A2A Firewall and the n8n community node.

Posts the exact payloads built by A2aFirewallGuard, A2aFirewallInspectResponse, and
A2aFirewallDlp and asserts the response format.
"""

from __future__ import annotations

import os
import uuid

import httpx
import pytest

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.integration


@pytest.fixture(scope="module", autouse=True)
def require_db() -> None:
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL not set; integration tests skipped")


@pytest.fixture(scope="module")
def backend_url() -> str:
    return os.environ.get("TEST_BACKEND_URL", "http://localhost:8000")


@pytest.fixture(scope="module")
def registered_workspace(backend_url: str) -> dict[str, str]:
    import time

    email = f"contract-{int(time.time())}-{uuid.uuid4().hex[:8]}@test.local"
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        r = c.post("/v1/workspaces/register", json={"name": "contract-test", "admin_email": email})
        r.raise_for_status()
        return r.json()


@pytest.fixture(scope="module")
def registered_agent(backend_url: str, registered_workspace: dict[str, str]) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {registered_workspace['api_key']}"}
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        r = c.post(
            "/v1/agents",
            headers=headers,
            json={"name": "n8n-agent", "description": "Agent representing n8n workflow steps"},
        )
        r.raise_for_status()
        return r.json()


def test_contract_inspect_endpoint(
    backend_url: str,
    registered_workspace: dict[str, str],
    registered_agent: dict[str, str],
) -> None:
    """A2aFirewallGuard node inspect contract."""
    headers = {"Authorization": f"Bearer {registered_agent['api_key']}"}
    task_id = str(uuid.uuid4())
    req_body = {
        "task_id": task_id,
        "receiver_agent_id": registered_agent["agent_id"],
        "task_type": "llm_call",
        "payload": {"prompt": "Analyze this data for risks"},
        "root_task_id": str(uuid.uuid4()),
        "review_callback_url": "https://n8n.example.com/webhook/resume",
        "metadata": {
            "source": "n8n",
            "workflow_id": "wf-100",
            "execution_id": "exec-200",
            "review_callback_url": "https://n8n.example.com/webhook/resume",
        },
        "sdk_version": "n8n-0.1.0",
    }
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        r = c.post("/v1/firewall/inspect", headers=headers, json=req_body)
        assert r.status_code == 200
        data = r.json()
        assert data["task_id"] == task_id
        assert data["decision"] in ("allow", "block", "review")
        assert isinstance(data["allowed_to_proceed"], bool)
        assert isinstance(data["risk_score"], (int, float))
        assert isinstance(data["violations"], list)
        assert "evidence_id" in data


def test_contract_inspect_response_endpoint(
    backend_url: str,
    registered_agent: dict[str, str],
) -> None:
    """A2aFirewallInspectResponse node contract."""
    headers = {"Authorization": f"Bearer {registered_agent['api_key']}"}
    req_body = {
        "response_body": "This contains SSN 123-45-6789 and safe text.",
        "context": "tool_result",
        "redact_pii": True,
    }
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        r = c.post("/v1/firewall/inspect-response", headers=headers, json=req_body)
        assert r.status_code == 200
        data = r.json()
        assert data["decision"] in ("allow", "block", "review")
        assert isinstance(data["allowed_to_proceed"], bool)
        assert isinstance(data["findings"], list)
        assert "redacted_body" in data
        assert "123-45-6789" not in str(data["redacted_body"])


def test_contract_dlp_endpoints(
    backend_url: str,
    registered_workspace: dict[str, str],
) -> None:
    """A2aFirewallDlp tokenize and detokenize contract."""
    headers = {"Authorization": f"Bearer {registered_workspace['api_key']}"}

    # 1. Tokenize
    with httpx.Client(base_url=backend_url, timeout=10.0) as c:
        tok_resp = c.post(
            "/v1/dlp/tokenize",
            headers=headers,
            json={"text": "User email is test@company.com", "destination": "external"},
        )
        assert tok_resp.status_code == 200
        tok_data = tok_resp.json()
        assert "tokenized_text" in tok_data
        tokenized = tok_data["tokenized_text"]

        # 2. Detokenize
        detok_resp = c.post(
            "/v1/dlp/detokenize",
            headers=headers,
            json={"text": tokenized, "purpose": "audit_investigation"},
        )
        assert detok_resp.status_code == 200
        detok_data = detok_resp.json()
        assert "text" in detok_data
        assert "test@company.com" in detok_data["text"]
