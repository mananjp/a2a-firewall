# CrewAI Integration Guide — A2A Firewall

Integrate **A2A Firewall** with [CrewAI](https://github.com/crewAIInc/crewAI) to protect multi-agent crews, hierarchical delegation chains, and tool invocations from prompt injections, confused-deputy attacks, data leaks, and spend overruns.

---

## 🎯 Architecture Options

1. **Zero-Touch Container / Sidecar Mode (Recommended)**: Run your entire CrewAI crew in a container with `HTTPS_PROXY` pointing to `a2a-proxy`. All LLM calls and tool API requests are transparently governed without touching agent code.
2. **CrewAI Custom Tool & Delegation Guard**: Wrap CrewAI custom tools and task callbacks with the `a2a-firewall-sdk` to enforce deterministic security checks and cryptographic audit trails.

```
┌────────────────────────────────────────────────────────┐
│                      CrewAI Crew                       │
│                                                        │
│   ┌─────────────────────┐        ┌─────────────────┐   │
│   │ Manager Agent       │───────►│ Worker Agent    │   │
│   └──────────┬──────────┘        └────────┬────────┘   │
│              │                            │            │
│              ▼                            ▼            │
│   ┌────────────────────────────────────────────────┐   │
│   │         A2A Firewall Governance Layer          │   │
│   │   • Anti-Injection & Jailbreak Gate            │   │
│   │   • Monthly Spend & Token Quota Manager        │   │
│   │   • Non-Amplification Macaroon Attenuation     │   │
│   │   • PII Sanitization & Compliance Audit        │   │
│   └────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

---

## 📦 Option 1: Zero-Touch Container / Sidecar Mode

### 1. In Your `docker-compose.yml`

```yaml
services:
  a2a-proxy:
    image: ghcr.io/mananjp/a2a-proxy:latest
    ports: ["8080:8080"]
    volumes:
      - ca-certs:/data/ca

  crewai-agents:
    build: .
    depends_on:
      a2a-proxy: { condition: service_healthy }
    environment:
      HTTPS_PROXY: "http://a2a-proxy:8080"
      SSL_CERT_FILE: "/certs/ca.crt"
      REQUESTS_CA_BUNDLE: "/certs/ca.crt"
      OPENAI_API_KEY: "${OPENAI_API_KEY}"
    volumes:
      - ca-certs:/certs:ro

volumes:
  ca-certs:
```

All CrewAI agent-to-LLM requests and external HTTP tools are now transparently protected.

---

## 💻 Option 2: CrewAI Custom Tool Security Wrapper

Protect specific sensitive tools (SQL query, bash execution, file system) with deterministic sub-millisecond inspection.

### 1. Install Dependencies

```bash
pip install crewai "a2a-firewall-sdk[all]"
```

### 2. Implementation Example

```python
"""CrewAI Multi-Agent Pipeline Governed by A2A Firewall."""

import os
from crewai import Agent, Crew, Process, Task
from crewai.tools import tool
from a2a_firewall import A2AFirewall, FirewallConfig, FirewallBlockedError

# ── 1. Configure A2A Firewall ──
firewall = A2AFirewall(
    FirewallConfig(
        firewall_url=os.getenv("A2A_FIREWALL_URL", "http://localhost:8000"),
        agent_api_key=os.getenv("A2A_AGENT_API_KEY", "agt_crew_key"),
        agent_id="crewai-worker-uuid",
        workspace_id=os.getenv("A2A_WORKSPACE_ID", "ws-crew-uuid"),
        fail_mode="closed",
    )
)


# ── 2. Define Governed Custom Tools ──
@tool("Governed Database Search")
def governed_sql_tool(query: str) -> str:
    """Execute a database query safely through the A2A Firewall."""
    try:
        # Preflight inspection of the query
        response = firewall.send(
            receiver_agent_id="db-executor-uuid",
            task_type="database_query",
            payload={"sql": query},
            resource_type="database",
            action="SELECT",
        )
        # Proceed with execution if allowed
        return f"[SUCCESS] Query allowed (Risk: {response.risk_score}). Results: 142 records found."

    except FirewallBlockedError as e:
        return f"[SECURITY BLOCK] Query rejected by A2A Firewall: {e.reason} (Violations: {len(e.violations)})"


# ── 3. Define CrewAI Agents ──
researcher = Agent(
    role="Senior Market Analyst",
    goal="Extract actionable fintech insights from internal databases",
    backstory="You are an expert analyst who queries structured data to produce intelligence reports.",
    tools=[governed_sql_tool],
    verbose=True,
)

writer = Agent(
    role="Executive Briefing Specialist",
    goal="Synthesize research data into high-level executive summaries",
    backstory="You turn complex technical and financial findings into crisp board-level memos.",
    verbose=True,
)


# ── 4. Define Tasks ──
research_task = Task(
    description="Query customer growth metrics using the SQL tool. Query: 'SELECT region, sum(revenue) FROM sales GROUP BY region'",
    expected_output="A structured summary of revenue by region.",
    agent=researcher,
)

write_task = Task(
    description="Create a 3-bullet executive summary from the researcher's findings.",
    expected_output="A board-ready executive memo.",
    agent=writer,
)


# ── 5. Run the Crew ──
fintech_crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    process=Process.sequential,
    verbose=True,
)

if __name__ == "__main__":
    result = fintech_crew.kickoff()
    print("\n\n########################")
    print("## CREW RUN COMPLETED ##")
    print("########################\n")
    print(result)
```

---

## 🛡️ Enterprise Benefits for CrewAI Teams

- **Hierarchical Delegation Safety**: Protects manager agents from being hijacked when delegating tasks to dynamic sub-agents.
- **Budgetary Caps**: Set hard limits on monthly inference spend per crew, preventing infinite tool calling loops.
- **Audit-Ready Evidence**: Every task handoff produces an immutable cryptographic ledger entry for SOC 2 / HIPAA compliance.
