from app.core.config import settings

async def preflight(request_data, sender, workspace, payload_size, db):
    if payload_size > settings.MAX_PAYLOAD_BYTES:
        return {"block": True, "reason": "payload_too_large", "risk_score": 1.0,
                "violations": [{"layer": "rule", "violation_type": "payload_too_large",
                                 "severity": "high", "details": {"size": payload_size}}]}
    if sender.status == "suspended":
        return {"block": True, "reason": "agent_suspended", "risk_score": 1.0,
                "violations": [{"layer": "rule", "violation_type": "agent_suspended",
                                 "severity": "critical", "details": {}}]}
    depth = request_data.get("depth", 0)
    if depth > 10:
        return {"block": True, "reason": "max_depth_exceeded", "risk_score": 1.0,
                "violations": [{"layer": "rule", "violation_type": "max_depth_exceeded",
                                 "severity": "high", "details": {"depth": depth}}]}
    if str(sender.id) == request_data.get("receiver_agent_id"):
        return {"block": True, "reason": "circular_reference", "risk_score": 1.0,
                "violations": [{"layer": "rule", "violation_type": "circular_reference",
                                 "severity": "high", "details": {}}]}
    return None
