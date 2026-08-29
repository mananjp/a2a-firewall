# LangGraph Integration Guide — A2A Firewall

Integrate **A2A Firewall** with [LangGraph](https://github.com/langchain-ai/langgraph) to provide zero-trust governance, tamper-evident message lineage, spend limits, and real-time threat inspection across your multi-agent StateGraphs.

---

## 🎯 Architecture Options

You can integrate A2A Firewall with LangGraph in two ways:

1. **Tier A: Transparent Sidecar Proxy (Zero Code Changes)**: Run LangGraph with `HTTPS_PROXY` pointing to `a2a-proxy`. All OpenAI, Anthropic, and custom tool HTTP calls are intercepted automatically.
2. **SDK Node Interceptor (Granular Lineage & Delegation)**: Use the Python `a2a-firewall-sdk` inside LangGraph node transitions to sign payloads with Ed25519, attenuate delegation tokens, and track multi-hop parent/root task IDs.

```
┌──────────────────────────────────────────────────────────┐
│                   LangGraph StateGraph                   │
│                                                          │
│   ┌──────────────────┐           ┌──────────────────┐    │
│   │  Supervisor Node │──────────►│  Researcher Node │    │
│   └────────┬─────────┘           └────────┬─────────┘    │
│            │                              │              │
│            ▼                              ▼              │
│   ┌──────────────────────────────────────────────────┐   │
│   │           A2A Firewall Governance Layer          │   │
│   │   • Ed25519 Multi-Hop Signature Verification     │   │
│   │   • Macaroon-Style Capability Attenuation        │   │
│   │   • Prompt Injection & SQLi Real-Time Defense    │   │
│   │   • Token Budget & Spend Limit Enforcement       │   │
│   └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## 📦 Option 1: Transparent Proxy Sidecar (Recommended for Production)

### 1. Run the A2A Proxy Sidecar

```bash
# Start the proxy
python -m a2a_firewall.proxy start --port 8080
```

### 2. Run Your LangGraph App

No changes needed in your LangGraph code! Simply run with the proxy environment variables:

```bash
HTTPS_PROXY=http://127.0.0.1:8080 \
SSL_CERT_FILE=~/.a2a/ca/ca.crt \
REQUESTS_CA_BUNDLE=~/.a2a/ca/ca.crt \
python my_langgraph_app.py
```

Or using the A2A CLI runner:

```bash
python -m a2a_firewall.proxy run -- python my_langgraph_app.py
```

---

## 💻 Option 2: LangGraph Node-to-Node SDK Interceptor

For stateful multi-agent pipelines where you want cryptographic lineage, spend quotas per node, and Macaroon capability attenuation between subgraphs.

### 1. Install SDK

```bash
pip install "a2a-firewall-sdk[all]" langgraph langchain-openai
```

### 2. Implementation Example

```python
"""LangGraph Multi-Agent Workflow Governed by A2A Firewall."""

import os
from typing import Annotated, TypedDict
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from a2a_firewall import A2AFirewall, FirewallConfig, FirewallBlockedError

# ── 1. Initialize A2A Firewall Client ──
firewall = A2AFirewall(
    FirewallConfig(
        firewall_url=os.getenv("A2A_FIREWALL_URL", "http://localhost:8000"),
        agent_api_key=os.getenv("A2A_AGENT_API_KEY", "agt_live_key"),
        workspace_id=os.getenv("A2A_WORKSPACE_ID", "ws-prod-uuid"),
        agent_id="supervisor-agent-uuid",
        agent_private_key=os.getenv("A2A_AGENT_PRIVATE_KEY", ""),  # Ed25519 signing
        fail_mode="closed",  # Block if firewall is unreachable
    )
)


# ── 2. Define LangGraph State ──
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    delegation_token: str | None
    task_id: str | None
    root_task_id: str | None


# ── 3. Node: Supervisor / Planner ──
def supervisor_node(state: AgentState) -> dict:
    user_prompt = state["messages"][-1].content

    # Inspect the incoming request before delegating to worker
    try:
        response = firewall.send(
            receiver_agent_id="researcher-agent-uuid",
            task_type="research",
            payload={"prompt": user_prompt},
            declared_intent="Conduct market research on renewable energy",
        )
        print(f"✅ Supervisor dispatch allowed (Risk: {response.risk_score})")

        # Create an attenuated delegation token (caps worker risk at 0.5)
        worker_token = firewall.create_delegation_token(
            root_key_hex=os.getenv("A2A_ROOT_KEY_HEX", "0" * 64),
            receiver_agent_id="researcher-agent-uuid",
            task_type="research",
            max_risk=0.5,
        )

        return {
            "messages": [AIMessage(content=f"Delegating task to researcher: {user_prompt}")],
            "delegation_token": worker_token,
            "task_id": response.task_id,
            "root_task_id": response.task_id,
        }

    except FirewallBlockedError as e:
        print(f"⛔ Blocked at supervisor boundary: {e.reason}")
        return {
            "messages": [AIMessage(content=f"Security Policy Violation: {e.reason}")],
            "task_id": e.task_id,
        }


# ── 4. Node: Worker / Researcher ──
def researcher_node(state: AgentState) -> dict:
    # If previously blocked, do not execute
    if not state.get("delegation_token"):
        return {"messages": [AIMessage(content="Aborted due to security block.")]}

    # Set lineage context from supervisor
    firewall.set_context(
        task_id=state["task_id"],
        root_task_id=state["root_task_id"],
        delegation_token=state["delegation_token"],
    )

    # Worker calls downstream tool or database
    try:
        tool_query = "SELECT summary FROM reports WHERE topic = 'solar'"
        resp = firewall.send(
            receiver_agent_id="db-query-tool-uuid",
            task_type="sql_query",
            payload={"query": tool_query},
            action="SELECT",
            resource_type="database",
        )
        return {"messages": [AIMessage(content=f"Research complete: {resp.decision}")]}

    except FirewallBlockedError as e:
        return {"messages": [AIMessage(content=f"Worker tool blocked: {e.reason}")]}


# ── 5. Build and Compile Graph ──
workflow = StateGraph(AgentState)
workflow.add_node("supervisor", supervisor_node)
workflow.add_node("researcher", researcher_node)

workflow.set_entry_point("supervisor")
workflow.add_edge("supervisor", "researcher")
workflow.add_edge("researcher", END)

app = workflow.compile()

# ── 6. Execute ──
if __name__ == "__main__":
    result = app.invoke({
        "messages": [HumanMessage(content="Analyze solar market CAGR 2026-2030")],
        "delegation_token": None,
        "task_id": None,
        "root_task_id": None,
    })
    print("\nWorkflow output:", result["messages"][-1].content)
```

---

## 🛡️ Threats Automatically Mitigated in LangGraph

| Threat | How A2A Firewall Protects LangGraph |
| :--- | :--- |
| **Prompt Injection in State** | Ingress and node transitions scan state payloads for jailbreaks, system overrides, and canary honeypots. |
| **Privilege Escalation** | Macaroon tokens ensure subgraphs cannot widen permissions granted by the root supervisor. |
| **Tool Parameter Tampering** | Tool parameters (SQL, bash, file paths) are inspected deterministically in `< 1ms`. |
| **Runaway Agent Loops** | Spend manager tracks token costs across all graph iterations and halts infinite loops. |
| **PII Leakage in State** | Sensitive data (PAN, Aadhaar, SSN, Credit Cards) is detected and scrubbed from state history. |
