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

    @pytest.mark.asyncio
    async def test_review_callback_ssrf_blocked_on_decision(self):
        """decide_review must refuse to POST to internal / loopback / metadata URLs."""
        from a2a_firewall.api.routes.review import DecideBody, decide_review
        from a2a_firewall.db.models import ReviewItem, Workspace

        ws_id = uuid.uuid4()
        ws = MagicMock(spec=Workspace)
        ws.id = ws_id

        unsafe_urls = [
            "http://127.0.0.1:8000/internal",
            "http://localhost:8000/admin",
            "http://169.254.169.254/latest/meta-data",
            "https://10.0.0.1/sensitive",
            "https://192.168.1.1/router",
            "https://user:pass@evil.com/webhook",
            "file:///etc/passwd",
        ]

        for unsafe_url in unsafe_urls:
            review_item = MagicMock(spec=ReviewItem)
            review_item.workspace_id = ws_id
            review_item.status = "pending"
            review_item.task_id = uuid.uuid4()
            review_item.review_token = "tok-review-ssrf"
            review_item.review_callback_url = unsafe_url

            db = AsyncMock()
            mock_result = MagicMock()
            mock_result.scalar_one_or_none.return_value = review_item
            db.execute.return_value = mock_result

            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                body = DecideBody(action="approve", notes="Test approve")
                result = await decide_review("tok-review-ssrf", body, ws, db)

                assert result["status"] == "approved"
                # Webhook POST must NOT be called for unsafe URLs!
                mock_post.assert_not_called()

    def test_validate_callback_url_matrix(self):
        """Test validate_callback_url rejects SSRF targets and accepts valid public HTTPS URLs."""
        from a2a_firewall.core.network_security import validate_callback_url

        # Unsafe URLs
        blocked = [
            "http://127.0.0.1",
            "http://127.0.0.1:8000/api",
            "https://127.0.0.1:8443/",
            "http://localhost/",
            "https://localhost:3000/webhook",
            "http://169.254.169.254/latest/meta-data",
            "http://metadata.google.internal/computeMetadata/v1/",
            "https://10.0.0.5/api",
            "https://172.16.0.10/api",
            "https://192.168.1.100/admin",
            "https://[::1]:8080/callback",
            "https://[fe80::1]/callback",
            "https://admin:secret@attacker.com/webhook",
            "ftp://example.com/file",
            "file:///etc/hosts",
            "gopher://127.0.0.1:6379/",
            "http://internal.corp.local/",
            "http://service.internal/",
        ]
        for url in blocked:
            is_valid, reason = validate_callback_url(url)
            assert is_valid is False, f"Expected {url} to be blocked, but passed. Reason: {reason}"
            assert reason is not None

        # Allowed URLs
        allowed = [
            "https://n8n.example.com/webhook/resume",
            "https://hooks.slack.com/services/T00/B00/XXXX",
            "https://api.github.com/webhook",
        ]
        for url in allowed:
            is_valid, reason = validate_callback_url(url)
            assert is_valid is True, f"Expected {url} to be allowed, but failed: {reason}"

    def test_inspect_request_ssrf_callback_url_rejected(self):
        """InspectRequest must raise ValidationError when given an SSRF callback URL."""
        from pydantic import ValidationError

        from a2a_firewall.api.routes.firewall import InspectRequest

        base_data = {
            "task_id": str(uuid.uuid4()),
            "receiver_agent_id": str(uuid.uuid4()),
            "task_type": "research",
            "payload": {"query": "test"},
        }

        # Direct review_callback_url with SSRF target
        with pytest.raises(ValidationError):
            InspectRequest(**base_data, review_callback_url="http://127.0.0.1:8000/internal")

        with pytest.raises(ValidationError):
            InspectRequest(**base_data, review_callback_url="http://169.254.169.254/latest")

        # In metadata dictionary
        with pytest.raises(ValidationError):
            InspectRequest(**base_data, metadata={"review_callback_url": "http://127.0.0.1:8000"})

        # Valid public https URL should succeed
        req = InspectRequest(**base_data, review_callback_url="https://n8n.example.com/webhook")
        assert req.review_callback_url == "https://n8n.example.com/webhook"

    @pytest.mark.asyncio
    async def test_orchestrator_drops_unsafe_review_callback_url(self):
        """Orchestrator must drop unsafe callback URL and persist None on ReviewItem."""
        from a2a_firewall.db.models import Agent, ReviewItem, Workspace
        from a2a_firewall.detection.orchestrator import run_inspection

        ws_id = uuid.uuid4()
        ws = MagicMock(spec=Workspace)
        ws.id = ws_id
        ws.block_threshold = 0.8
        ws.review_threshold = 0.5
        ws.default_deny = False

        sender = MagicMock(spec=Agent)
        sender.id = uuid.uuid4()

        db = AsyncMock()
        mock_res = MagicMock()
        mock_res.scalar_one_or_none.return_value = None
        mock_res.scalars.return_value.all.return_value = []
        db.execute.return_value = mock_res
        added_items = []
        db.add = MagicMock(side_effect=lambda item: added_items.append(item))
        db.commit = AsyncMock()

        req = {
            "task_id": str(uuid.uuid4()),
            "receiver_agent_id": str(uuid.uuid4()),
            "task_type": "research",
            "schema_version": "v1",
            "payload": {"query": "needs review"},
            "review_callback_url": "http://127.0.0.1:8000/ssrf",
        }

        with (
            patch(
                "a2a_firewall.detection.orchestrator.check_tier_quota",
                new_callable=AsyncMock,
                return_value=(True, {"tier": "enterprise"}),
            ),
            patch(
                "a2a_firewall.core.spend_manager.check_spend_limits",
                new_callable=AsyncMock,
                return_value={"allowed": True},
            ),
            patch("a2a_firewall.detection.orchestrator.check_agent", return_value=(True, 1)),
            patch("a2a_firewall.detection.orchestrator.preflight", return_value=None),
            patch(
                "a2a_firewall.detection.orchestrator.validate_schema",
                return_value={"violations": []},
            ),
            patch(
                "a2a_firewall.detection.orchestrator.check_permissions",
                return_value={"allowed": True, "check": "default_deny"},
            ),
            patch(
                "a2a_firewall.detection.orchestrator.run_rules",
                return_value={
                    "violations": [],
                    "risk_delta": 0.0,
                    "matched_rule_id": None,
                    "matched_rule_action": None,
                },
            ),
            patch(
                "a2a_firewall.detection.orchestrator.groq_inspect",
                new_callable=AsyncMock,
                return_value={
                    "injection_detected": False,
                    "injection_type": "none",
                    "hallucination_flags": [],
                    "risk_score_delta": 0.0,
                    "rationale": "clean",
                },
            ),
            patch("a2a_firewall.detection.orchestrator.make_decision", return_value="review"),
        ):
            res = await run_inspection(req, sender, ws, db)
            assert res["decision"] == "review"

            review_items = [item for item in added_items if isinstance(item, ReviewItem)]
            assert len(review_items) == 1
            # Unsafe URL was dropped!
            assert review_items[0].review_callback_url is None
