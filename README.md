# A2A Firewall — Inter-Agent Governance Mesh

Intercepts, validates, and traces every agent-to-agent message in multi-agent AI systems.

## Quickstart

```bash
cp backend/.env.example backend/.env
# Add your GROQ_API_KEY to backend/.env
docker-compose up --build
```

Backend runs at: http://localhost:8000  
API docs: http://localhost:8000/docs

## Demo Attack

```bash
cd sdk
pip install -e .

# Register workspace + agents first via API, then:
export FIREWALL_URL=http://localhost:8000
export PLANNER_API_KEY=your_planner_key
export PLANNER_ID=your_planner_uuid
export RESEARCHER_ID=your_researcher_uuid
export WORKSPACE_ID=your_workspace_uuid

python examples/demo_attack.py
```

## Stack
- Backend: FastAPI + SQLAlchemy + PostgreSQL (Alpine Docker)
- LLM: Groq API (free tier, llama-3.1-8b-instant)
- Tracing: OpenTelemetry
- SDK: Python (`pip install a2a-firewall-sdk`)

## Folder Structure

```
a2a-firewall/
├── docker-compose.yml
├── backend/
│   ├── app/
│   │   ├── api/routes/     ← workspaces, agents, schemas, firewall, tasks, violations, review, policies, stats
│   │   ├── core/           ← config, security, telemetry
│   │   ├── db/             ← models, database session
│   │   └── detection/      ← 5-layer inspection pipeline
│   ├── db/init.sql
│   └── tests/
└── sdk/
    ├── a2a_firewall/
    └── examples/
```
