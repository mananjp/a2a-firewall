"""Unit tests verifying the n8n API contract and review callback behavior."""

from __future__ import annotations

import time
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from a2a_firewall.api.routes.dlp import DetokenizeRequest, TokenizeRequest
from a2a_firewall.api.routes.firewall import InspectRequest, InspectResponseRequest
from a2a_firewall.detection.layer0_preflight import preflight
from a2a_firewall.detection.orchestrator import _replay_response


class TestN8nSchemaContract:
    """Ensure the Pydantic request models accept the exact bodies emitted by the n8n node."""

    def test_inspect_request_accepts_n8n_body(self):
        task_id = str(uuid.uuid4())
        receiver_id = str(uuid.uuid4())
        root_task_id = str(uuid.uuid4())
        body = {
            "task_id": task_id,
            "receiver_agent_id": receiver_id,
            "task_type": "workflow_step",
            "payload": {"prompt": "Analyze this data", "count": 5},
            "root_task_id": root_task_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "nonce": str(uuid.uuid4()),
            "review_callback_url": "https://n8n.example.com/webhook/resume",
            "metadata": {
                "source": "n8n",
                "workflow_id": "wf-101",
                "workflow_name": "Customer Support Agent",
                "execution_id": "exec-456",
                "node_name": "A2A Firewall Guard",
                "review_callback_url": "https://n8n.example.com/webhook/resume",
            },
            "sdk_version": "n8n-0.1.0",
        }
        req = InspectRequest.model_validate(body)
        assert req.task_id == task_id
        assert req.receiver_agent_id == receiver_id
        assert req.review_callback_url == "https://n8n.example.com/webhook/resume"
        assert req.metadata["workflow_id"] == "wf-101"

    def test_inspect_response_request_accepts_n8n_body(self):
        body = {
            "response_body": "User sensitive data here",
            "context": "tool_result",
            "redact_pii": True,
        }
        req = InspectResponseRequest.model_validate(body)
        assert req.response_body == "User sensitive data here"
        assert req.context == "tool_result"
        assert req.redact_pii is True

    def test_dlp_tokenize_request_accepts_n8n_body(self):
        body = {
            "text": "Call me at 415-555-0199 or email alice@example.com",
            "destination": "external",
            "entity_type": "pii",
        }
        req = TokenizeRequest.model_validate(body)
        assert req.text == "Call me at 415-555-0199 or email alice@example.com"
        assert req.destination == "external"

    def test_dlp_detokenize_request_accepts_n8n_body(self):
        body = {
            "text": "Call me at tok_phone_0001",
            "purpose": "customer_support",
        }
        req = DetokenizeRequest.model_validate(body)
        assert req.text == "Call me at tok_phone_0001"
        assert req.purpose == "customer_support"


class TestReplayAndSecurityChecks:
    @pytest.mark.asyncio
    async def test_stale_timestamp_rejected(self):
        sender = MagicMock(id=uuid.uuid4(), status="active")
        workspace = MagicMock(id=uuid.uuid4())
        db = AsyncMock()

        # Timestamp 10 minutes ago (> 300s)
        stale_ts = time.time() - 600
        req_data = {
            "task_id": str(uuid.uuid4()),
            "receiver_agent_id": str(uuid.uuid4()),
            "task_type": "workflow_step",
            "payload": {"hello": "world"},
            "timestamp": stale_ts,
        }

        # Mock db execute returning no existing cached task
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        result = await preflight(req_data, sender, workspace, 100, db)
        assert result is not None
        assert result.get("block") is True
        assert result.get("reason") == "stale_request"

    @pytest.mark.asyncio
    async def test_nonce_replay_rejected(self):
        sender_id = str(uuid.uuid4())
        sender = MagicMock(id=sender_id, status="active")
        workspace = MagicMock(id=uuid.uuid4())
        db = AsyncMock()

        nonce = str(uuid.uuid4())
        req_data_1 = {
            "task_id": str(uuid.uuid4()),
            "receiver_agent_id": str(uuid.uuid4()),
            "task_type": "workflow_step",
            "payload": {"hello": "world"},
            "nonce": nonce,
            "timestamp": time.time(),
        }

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute.return_value = mock_result

        # First request with this nonce passes preflight
        res1 = await preflight(req_data_1, sender, workspace, 100, db)
        assert res1 is None

        # Second request from same sender with same nonce but new task_id is blocked
        req_data_2 = {
            "task_id": str(uuid.uuid4()),
            "receiver_agent_id": str(uuid.uuid4()),
            "task_type": "workflow_step",
            "payload": {"hello": "world"},
            "nonce": nonce,
            "timestamp": time.time(),
        }
        res2 = await preflight(req_data_2, sender, workspace, 100, db)
        assert res2 is not None
        assert res2.get("block") is True
        assert res2.get("reason") == "nonce_replayed"

    @pytest.mark.asyncio
    async def test_replay_response_shape_matches(self):
        task_id = uuid.uuid4()
        cached = MagicMock()
        cached.id = task_id
        cached.decision = "allow"
        cached.risk_score = 0.1
        cached.decision_reason = "rule_passed"

        db = AsyncMock()
        resp = await _replay_response(cached, db, "trace-123", "span-456", [])

        # Assert all fields expected by the n8n node client are present
        assert resp["task_id"] == str(task_id)
        assert resp["decision"] == "allow"
        assert resp["allowed_to_proceed"] is True
        assert resp["risk_score"] == 0.1
        assert "violations" in resp
        assert "evidence_id" in resp
        assert resp["evidence_id"] == f"decision-{task_id}"
        assert resp["idempotent_replay"] is True


class TestReviewCallback:
    @pytest.mark.asyncio
    async def test_review_callback_triggered_on_decision(self):
        from a2a_firewall.api.routes.review import DecideBody, decide_review
        from a2a_firewall.db.models import ReviewItem, Workspace

        ws_id = uuid.uuid4()
        ws = MagicMock(spec=Workspace)
        ws.id = ws_id

        review_item = MagicMock(spec=ReviewItem)
        review_item.workspace_id = ws_id
        review_item.status = "pending"
        review_item.task_id = uuid.uuid4()
        review_item.review_token = "tok-review-123"
        review_item.review_callback_url = "https://n8n.example.com/webhook/review"

        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = review_item
        db.execute.return_value = mock_result

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            body = DecideBody(action="approve", notes="LGTM by analyst")
            result = await decide_review("tok-review-123", body, ws, db)

            assert result["status"] == "approved"
            assert review_item.status == "approved"
            assert review_item.reviewer_notes == "LGTM by analyst"
            assert db.commit.called

            # Check webhook callback was dispatched
            mock_post.assert_called_once()
            call_url = mock_post.call_args[0][0]
            call_json = mock_post.call_args[1]["json"]
            assert call_url == "https://n8n.example.com/webhook/review"
            assert call_json["decision"] == "approve"
            assert call_json["reason"] == "LGTM by analyst"
            assert call_json["review_token"] == "tok-review-123"
            assert call_json["task_id"] == str(review_item.task_id)
