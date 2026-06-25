import httpx, time, uuid
from typing import Optional
from dataclasses import dataclass

@dataclass
class FirewallConfig:
    firewall_url: str
    agent_api_key: str
    agent_id: str
    workspace_id: str
    timeout_seconds: float = 5.0
    fail_mode: str = "closed"
    review_poll_interval: float = 2.0
    review_max_wait: float = 60.0

@dataclass
class FirewallResponse:
    task_id: str
    decision: str
    allowed: bool
    risk_score: float
    violations: list
    review_token: Optional[str] = None
    block_reason: Optional[str] = None
    latency_ms: int = 0

class FirewallBlockedError(Exception):
    def __init__(self, task_id, reason, risk_score, violations):
        self.task_id = task_id
        self.reason = reason
        self.risk_score = risk_score
        self.violations = violations
        super().__init__(f"Task {task_id} blocked: {reason}")

class A2AFirewall:
    def __init__(self, config: FirewallConfig):
        self.config = config
        self._ctx = {}
        self._http = httpx.Client(
            base_url=config.firewall_url,
            headers={"Authorization": f"Bearer {config.agent_api_key}"},
            timeout=config.timeout_seconds
        )

    def send(
        self,
        receiver_agent_id: str,
        task_type: str,
        payload: dict,
        parent_task_id: Optional[str] = None,
        root_task_id: Optional[str] = None,
        raise_on_block: bool = True,
        schema_version: str = "v1",
        depth: int = 0
    ) -> FirewallResponse:
        task_id = str(uuid.uuid4())
        body = {
            "task_id": task_id,
            "parent_task_id": parent_task_id or self._ctx.get("current_task_id"),
            "root_task_id": root_task_id or self._ctx.get("root_task_id") or task_id,
            "receiver_agent_id": receiver_agent_id,
            "task_type": task_type,
            "schema_version": schema_version,
            "payload": payload,
            "trace_id": self._ctx.get("trace_id"),
            "parent_span_id": self._ctx.get("span_id"),
            "sdk_version": "0.1.0",
            "depth": depth
        }
        try:
            resp = self._http.post("/v1/firewall/inspect", json=body)
            resp.raise_for_status()
            data = resp.json()
            fw = FirewallResponse(
                task_id=data["task_id"],
                decision=data["decision"],
                allowed=data["allowed_to_proceed"],
                risk_score=data["risk_score"],
                violations=data.get("violations", []),
                review_token=data.get("review_token"),
                block_reason=data.get("block_reason"),
                latency_ms=data.get("latency_ms", 0)
            )
        except httpx.TimeoutException:
            if self.config.fail_mode == "closed":
                raise FirewallBlockedError(task_id, "firewall_unreachable", 1.0, [])
            return FirewallResponse(task_id=task_id, decision="allow", allowed=True,
                                    risk_score=0.0, violations=[], latency_ms=-1)
        except httpx.HTTPStatusError as e:
            raise RuntimeError(f"Firewall HTTP error: {e.response.status_code}") from e

        if fw.decision == "review":
            fw = self._wait_for_review(fw)

        if not fw.allowed and raise_on_block:
            raise FirewallBlockedError(fw.task_id, fw.block_reason, fw.risk_score, fw.violations)

        return fw

    def _wait_for_review(self, fw: FirewallResponse) -> FirewallResponse:
        deadline = time.monotonic() + self.config.review_max_wait
        while time.monotonic() < deadline:
            time.sleep(self.config.review_poll_interval)
            try:
                r = self._http.get(f"/v1/review/{fw.review_token}/status")
                s = r.json()
                if s["status"] == "approved":
                    fw.decision = "allow"; fw.allowed = True; return fw
                if s["status"] == "rejected":
                    fw.decision = "block"; fw.allowed = False
                    fw.block_reason = f"Rejected: {s.get('reviewer_notes', '')}"; return fw
            except Exception:
                pass
        fw.decision = "block"; fw.allowed = False; fw.block_reason = "review_timeout"
        return fw

    def set_context(self, task_id: str, root_task_id: str, trace_id: str = None, span_id: str = None):
        self._ctx = {"current_task_id": task_id, "root_task_id": root_task_id,
                     "trace_id": trace_id, "span_id": span_id}
