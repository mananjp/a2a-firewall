# Microsoft AutoGen (AG2) Integration Guide — A2A Firewall

Integrate **A2A Firewall** with [Microsoft AutoGen](https://github.com/microsoft/autogen) (AG2) to govern multi-agent conversations, code execution safety, and agent-to-agent message passing.

---

## 🎯 Integration Patterns

1. **Proxy Sidecar Mode**: Route all AutoGen LLM traffic through `a2a-proxy` for zero-code-change prompt injection, PII, and spend governance.
2. **AutoGen Message Hook / Middleware**: Intercept messages in `ConversableAgent` or `UserProxyAgent` using `a2a-firewall-sdk` before dispatching to the target agent.

```
┌────────────────────────────────────────────────────────┐
│                   AutoGen GroupChat                    │
│                                                        │
│   ┌─────────────────────┐        ┌─────────────────┐   │
│   │ UserProxyAgent      │───────►│ AssistantAgent  │   │
│   └──────────┬──────────┘        └────────┬────────┘   │
│              │                            │            │
│              ▼                            ▼            │
│   ┌────────────────────────────────────────────────┐   │
│   │         A2A Firewall Governance Layer          │   │
│   │   • Code Execution Command Boundary Guard      │   │
│   │   • Inter-Agent Prompt Injection Gate          │   │
│   │   • Multi-Agent Chat Turn Spend Ceiling        │   │
│   └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

---

## 💻 Python Hook Implementation Example

```python
"""AutoGen GroupChat Governed by A2A Firewall."""

import os
from autogen import AssistantAgent, UserProxyAgent
from a2a_firewall import A2AFirewall, FirewallConfig, FirewallBlockedError

# ── 1. Configure A2A Firewall ──
firewall = A2AFirewall(
    FirewallConfig(
        firewall_url=os.getenv("A2A_FIREWALL_URL", "http://localhost:8000"),
        agent_api_key=os.getenv("A2A_AGENT_API_KEY", "agt_autogen_key"),
        agent_id="autogen-coordinator-uuid",
        fail_mode="closed",
    )
)


# ── 2. Define AutoGen Message Filter Hook ──
def a2a_message_hook(recipient, messages, sender, config):
    """Intercept inter-agent messages and inspect with A2A Firewall."""
    latest_msg = messages[-1].get("content", "")

    try:
        response = firewall.send(
            receiver_agent_id=recipient.name,
            task_type="chat_message",
            payload={"content": latest_msg},
            declared_intent=f"Conversation turn from {sender.name} to {recipient.name}",
        )
        print(f"✅ Inter-agent message approved: {sender.name} -> {recipient.name} (Risk: {response.risk_score})")
        return messages

    except FirewallBlockedError as e:
        print(f"⛔ Message blocked by A2A Firewall: {e.reason}")
        # Sanitize or block the message
        messages[-1]["content"] = f"[SECURITY POLICY VIOLATION: {e.reason}]"
        return messages


# ── 3. Initialize AutoGen Agents ──
assistant = AssistantAgent(
    name="Assistant",
    llm_config={"model": "gpt-4o", "temperature": 0.2},
)

user_proxy = UserProxyAgent(
    name="UserProxy",
    code_execution_config={"work_dir": "workspace", "use_docker": False},
    human_input_mode="NEVER",
)

# Register A2A Firewall Hook on both agents
user_proxy.register_hook(hookable_method="process_all_messages_before_reply", hook=a2a_message_hook)
assistant.register_hook(hookable_method="process_all_messages_before_reply", hook=a2a_message_hook)

# ── 4. Initiate Governed Conversation ──
if __name__ == "__main__":
    user_proxy.initiate_chat(
        assistant,
        message="Calculate the 30-day moving average of stock prices from financial_data.csv.",
    )
```
