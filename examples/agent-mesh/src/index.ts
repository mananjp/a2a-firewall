/**
 * Minimal A2A Firewall + OpenTelemetry demo with resource/action abstraction.
 *
 * Instead of hardcoded task types and payloads, requests now declare
 * WHAT resource they target and WHAT action they intend — the firewall
 * evaluates risk based on resource sensitivity + action danger.
 *
 * Run: npx tsx src/index.ts
 */

const BASE = process.env.FIREWALL_URL ?? 'http://localhost:8000';

// ── 1. OTel (one-time setup) ──────────────────────────────────────────────
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const provider = new NodeTracerProvider({
  resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: 'a2a-firewall-demo' }),
});
provider.addSpanProcessor(new SimpleSpanProcessor(
  new OTLPTraceExporter({ url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'}/v1/traces` }),
));
provider.register();

// ── 2. Get an API key (auto-login) ────────────────────────────────────────
const { api_key: apiKey } = process.env.API_KEY
  ? { api_key: process.env.API_KEY }
  : await (await fetch(`${BASE}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `demo-${Date.now()}@test.com` }),
    })).json();

// ── 3. SDK — now uses resource + action ──────────────────────────────────
import { A2AFirewall } from '@a2a-firewall/sdk';

const fw = new A2AFirewall({ firewallUrl: BASE, agentApiKey: apiKey });

// Request #1: low-risk — read account balance
const r1 = await fw.send({
  receiverAgentId: 'fraud-investigation',
  taskType: 'investigation',
  resourceType: 'account',
  resourceId: 'ACC-42',
  action: 'read',
  payload: { query: 'Check account ACC-42' },
});
console.log(`read account:${r1.decision} risk=${r1.riskScore}`);

// Request #2: higher-risk — transfer money from account
const r2 = await fw.send({
  receiverAgentId: 'payments-agent',
  taskType: 'payment_processing',
  resourceType: 'payment',
  resourceId: 'PAY-100',
  action: 'transfer',
  payload: { amount: 50000, currency: 'USD', to: 'offshore-acc-123' },
});
console.log(`transfer payment:${r2.decision} risk=${r2.riskScore} violations=${r2.violations.length}`);

// Request #3: critical — delete customer data
const r3 = await fw.send({
  receiverAgentId: 'fraud-investigation',
  taskType: 'investigation',
  resourceType: 'customer_data',
  resourceId: 'CUST-99',
  action: 'delete',
  payload: { reason: 'GDPR erasure request' },
});
console.log(`delete customer_data:${r3.decision} risk=${r3.riskScore} violations=${r3.violations.length}`);
