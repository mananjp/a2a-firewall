/**
 * A2A Firewall — Agent Mesh Demo
 *
 * Demonstrates end-to-end OpenTelemetry tracing through the SDK + backend.
 *
 * Flow:
 *   1. Set up OpenTelemetry SDK (exports spans to OTLP endpoint)
 *   2. Create two agents (CustomerService, FraudInvestigation)
 *   3. CustomerService sends a fraud investigation task
 *   4. FraudInvestigation picks it up and sends a payment hold request
 *   5. All spans are linked in a single distributed trace
 *
 * Prerequisites:
 *   - Backend running on http://localhost:8000
 *   - An OTLP-compatible collector on http://localhost:4318 (optional — traces
 *     are still viewable via the backend's /dashboard/telemetry)
 */

import { A2AFirewall } from '@a2a-firewall/sdk';
import { diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';

// ── Step 0: Bootstrap agents & workspace ──────────────────────────────────

interface Bootstrapped {
  firewallUrl: string;
  workspaceId: string;
  agents: { id: string; key: string; name: string }[];
}

async function bootstrap(): Promise<Bootstrapped> {
  const BASE = process.env.FIREWALL_URL ?? 'http://localhost:8000';

  // Login creates/rotates a workspace key
  const loginResp = await fetch(`${BASE}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `mesh-${Date.now()}@demo.local` }),
  });
  if (!loginResp.ok) throw new Error(`Login failed: ${await loginResp.text()}`);
  const { workspace_id: workspaceId, api_key: wsKey } = await loginResp.json();
  const authHeader = `Bearer ${wsKey}`;

  // Create two agents
  const agentDefs = [
    {
      name: 'CustomerService',
      description: 'First point of contact for customer queries',
      capabilities: ['customer_interaction', 'ticket_creation'],
    },
    {
      name: 'FraudInvestigation',
      description: 'Investigates suspicious activity and fraud alerts',
      capabilities: ['investigation', 'fraud_detection', 'case_management'],
    },
    {
      name: 'PaymentsAgent',
      description: 'Processes payments, holds, and wire transfers',
      capabilities: ['payment_processing', 'wire_transfer', 'hold_management'],
    },
  ];

  const agents: Bootstrapped['agents'] = [];
  for (const def of agentDefs) {
    const resp = await fetch(`${BASE}/v1/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(def),
    });
    if (!resp.ok) throw new Error(`Agent create failed: ${await resp.text()}`);
    const { agent_id, api_key } = await resp.json();
    agents.push({ id: agent_id, key: api_key, name: def.name });
  }

  // Grant permissions for the workflow
  const permissionRules: { sender: string; receiver: string; taskType: string }[] = [
    { sender: 'CustomerService', receiver: 'FraudInvestigation', taskType: 'investigation' },
    { sender: 'FraudInvestigation', receiver: 'PaymentsAgent', taskType: 'payment_hold' },
  ];
  const byName = Object.fromEntries(agents.map((a) => [a.name, a.id]));
  for (const rule of permissionRules) {
    const resp = await fetch(`${BASE}/v1/agents/${byName[rule.sender]}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ receiver_id: byName[rule.receiver], task_type: rule.taskType, allowed: true }),
    });
    if (!resp.ok) console.warn(`  ⚠ Permission grant failed: ${rule.sender}→${rule.receiver} (${await resp.text()})`);
    else console.log(`  ✓ Permission: ${rule.sender} → ${rule.receiver} [${rule.taskType}]`);
  }

  return { firewallUrl: BASE, workspaceId, agents };
}

// ── Step 1: Set up OpenTelemetry ──────────────────────────────────────────

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

function setupTelemetry() {
  // Enable debug logging in dev
  if (process.env.OTEL_DEBUG) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'a2a-firewall-agent-mesh',
    }),
  });

  const otlpEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

  const exporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
    headers: {},
  });
  provider.addSpanProcessor(new BatchSpanProcessor(exporter));

  provider.register();
  console.log(`  OTel exporter: ${otlpEndpoint}/v1/traces`);
}

// ── Step 2: Run the agent workflow ────────────────────────────────────────

async function runWorkflow(boot: Bootstrapped) {
  // Create SDK clients for each agent
  const cs = new A2AFirewall({
    firewallUrl: boot.firewallUrl,
    workspaceId: boot.workspaceId,
    agentId: boot.agents[0].id,
    agentApiKey: boot.agents[0].key,
    agentPrivateKey: '',
    timeoutMs: 10000,
    failMode: 'closed',
  });

  const fi = new A2AFirewall({
    firewallUrl: boot.firewallUrl,
    workspaceId: boot.workspaceId,
    agentId: boot.agents[1].id,
    agentApiKey: boot.agents[1].key,
    agentPrivateKey: '',
    timeoutMs: 10000,
    failMode: 'closed',
  });

  // ── Workflow ──────────────────────────────────────────────────────
  // 1. CustomerService flags suspicious activity to FraudInvestigation
  const tracer = trace.getTracer('agent-mesh-workflow', '0.1.0');

  await tracer.startActiveSpan('workflow.flag_suspicious', async (span) => {
    span.setAttribute('agent.name', 'CustomerService');

    try {
      console.log('\n[1/2] CustomerService → FraudInvestigation: flag_suspicious');
      const step1 = await cs.send({
        receiverAgentId: boot.agents[1].id,
        taskType: 'investigation',
        payload: { action: 'flag_suspicious', account_id: 'ACC-0042', reason: 'unusual_large_transfer' },
        depth: 0,
      });
      console.log(`      → decision=${step1.decision} risk=${step1.riskScore}`);
      span.setAttribute('step1.decision', step1.decision);
      span.setAttribute('step1.task_id', step1.taskId);

      // 2. FraudInvestigation picks it up and places a payment hold
      //    Set the trace context so the outgoing request is a child of this span
      fi.setContext({
        taskId: step1.taskId,
        rootTaskId: step1.taskId,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });

      console.log('[2/2] FraudInvestigation → PaymentsAgent: payment_hold');
      const step2 = await fi.send({
        receiverAgentId: boot.agents[2].id,
        taskType: 'payment_hold',
        payload: {
          action: 'place_hold',
          account_id: 'ACC-0042',
          amount: 25000,
          currency: 'USD',
          reason: 'flagged_suspicious',
        },
        depth: 1,
      });
      console.log(`      → decision=${step2.decision} risk=${step2.riskScore}`);
      span.setAttribute('step2.decision', step2.decision);
      span.setAttribute('step2.task_id', step2.taskId);

      // Summary
      const bothAllowed = step1.allowed && step2.allowed;
      const msg = bothAllowed
        ? '\n✓ Both steps allowed — workflow completed.'
        : '\n✗ One or both steps blocked — review the firewall decisions above.';
      console.log(msg);
    } catch (err: any) {
      span.recordException(err);
      span.setStatus({ code: 2, message: err.message });
      console.error('\n✗ Workflow failed:', err.message);
    } finally {
      span.end();
    }
  });
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('A2A Firewall — Agent Mesh Demo');
  console.log('─'.repeat(40));

  console.log('\nBootstrapping workspace and agents...');
  const boot = await bootstrap();
  console.log(`  Firewall:   ${boot.firewallUrl}`);
  console.log(`  Workspace:  ${boot.workspaceId}`);
  for (const a of boot.agents) {
    console.log(`  Agent:      ${a.name} (${a.id.slice(0, 8)}…)`);
  }

  console.log('\nSetting up OpenTelemetry...');
  setupTelemetry();

  console.log('\nRunning agent workflow...');
  await runWorkflow(boot);

  // Give the batch span processor time to export
  console.log('\nWaiting for span export…');
  await new Promise((r) => setTimeout(r, 2000));

  console.log('\nDone. Check your OTel collector or backend telemetry dashboard.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
