"""
Planner Agent — sends a research task through the A2A Firewall.
Set env vars: FIREWALL_URL, PLANNER_API_KEY, PLANNER_ID, RESEARCHER_ID, WORKSPACE_ID
"""
import os
from a2a_firewall import A2AFirewall, FirewallConfig, FirewallBlockedError

fw = A2AFirewall(FirewallConfig(
    firewall_url=os.environ["FIREWALL_URL"],
    agent_api_key=os.environ["PLANNER_API_KEY"],
    agent_id=os.environ["PLANNER_ID"],
    workspace_id=os.environ["WORKSPACE_ID"],
    fail_mode="closed"
))

def plan_and_delegate(user_request: str):
    print(f"[Planner] Received: {user_request}")
    try:
        fw_resp = fw.send(
            receiver_agent_id=os.environ["RESEARCHER_ID"],
            task_type="research",
            payload={"query": user_request, "max_results": 5}
        )
        print(f"[Planner] Task approved: {fw_resp.task_id}, risk: {fw_resp.risk_score}")
        return fw_resp.task_id
    except FirewallBlockedError as e:
        print(f"[Planner] BLOCKED: {e.reason} (risk={e.risk_score})")
        return None

if __name__ == "__main__":
    plan_and_delegate("Tell me about renewable energy sources.")
