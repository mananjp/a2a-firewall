-- Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workspaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    admin_email     TEXT NOT NULL UNIQUE,
    api_key_hash    TEXT NOT NULL,
    fail_mode       TEXT NOT NULL DEFAULT 'closed' CHECK (fail_mode IN ('open','closed')),
    groq_threshold  FLOAT NOT NULL DEFAULT 0.3,
    block_threshold FLOAT NOT NULL DEFAULT 0.8,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    api_key_hash    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
    capabilities    JSONB NOT NULL DEFAULT '[]',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS task_schemas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    task_type       TEXT NOT NULL,
    version         TEXT NOT NULL DEFAULT 'v1',
    json_schema     JSONB NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, task_type, version)
);

CREATE TABLE IF NOT EXISTS agent_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sender_id       UUID REFERENCES agents(id) ON DELETE CASCADE,
    receiver_id     UUID REFERENCES agents(id) ON DELETE CASCADE,
    task_type       TEXT,
    allowed         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    priority        INT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    sender_id       UUID REFERENCES agents(id),
    receiver_id     UUID REFERENCES agents(id),
    task_type       TEXT,
    condition_expr  JSONB,
    action          TEXT NOT NULL CHECK (action IN ('allow','block','review','flag')),
    block_reason    TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_policy_rules_workspace_priority ON policy_rules(workspace_id, priority);

CREATE TABLE IF NOT EXISTS tasks (
    id                       UUID PRIMARY KEY,
    workspace_id             UUID NOT NULL REFERENCES workspaces(id),
    root_task_id             UUID NOT NULL,
    parent_task_id           UUID REFERENCES tasks(id),
    depth                    INT NOT NULL DEFAULT 0,
    sender_id                UUID NOT NULL REFERENCES agents(id),
    receiver_id              UUID NOT NULL REFERENCES agents(id),
    task_type                TEXT NOT NULL,
    schema_version           TEXT NOT NULL DEFAULT 'v1',
    payload                  JSONB NOT NULL,
    payload_hash             TEXT NOT NULL,
    payload_size_bytes       INT NOT NULL,
    risk_score               FLOAT NOT NULL DEFAULT 0.0,
    decision                 TEXT NOT NULL CHECK (decision IN ('allow','block','review','error')),
    decision_reason          TEXT,
    matched_rule_id          UUID REFERENCES policy_rules(id),
    groq_called              BOOLEAN DEFAULT FALSE,
    groq_model               TEXT,
    groq_injection_detected  BOOLEAN,
    groq_hallucination_flags JSONB,
    groq_risk_delta          FLOAT,
    groq_rationale           TEXT,
    groq_latency_ms          INT,
    total_latency_ms         INT,
    trace_id                 TEXT,
    span_id                  TEXT,
    created_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_root      ON tasks(root_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent    ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_decision  ON tasks(workspace_id, decision);

CREATE TABLE IF NOT EXISTS violations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id),
    task_id         UUID NOT NULL REFERENCES tasks(id),
    layer           TEXT NOT NULL CHECK (layer IN ('schema','rule','semantic','policy')),
    violation_type  TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    details         JSONB NOT NULL,
    resolved        BOOLEAN DEFAULT FALSE,
    resolved_by     TEXT,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_violations_task      ON violations(task_id);
CREATE INDEX IF NOT EXISTS idx_violations_workspace ON violations(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS review_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id),
    task_id         UUID NOT NULL REFERENCES tasks(id) UNIQUE,
    review_token    TEXT NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
    reviewer_notes  TEXT,
    decided_at      TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    on_expire       TEXT NOT NULL DEFAULT 'block' CHECK (on_expire IN ('allow','block')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trace_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id),
    task_id         UUID REFERENCES tasks(id),
    trace_id        TEXT NOT NULL,
    span_id         TEXT NOT NULL,
    parent_span_id  TEXT,
    event_name      TEXT NOT NULL,
    attributes      JSONB NOT NULL DEFAULT '{}',
    duration_ms     INT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trace_events_trace_id ON trace_events(trace_id);
