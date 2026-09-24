import {
	buildDlpBody,
	buildGuardInspectBody,
	buildInspectResponseBody,
	canonicalize,
	failVerdict,
	idempotencyKey,
	mapGuardOutput,
	mapInspectResponseOutput,
	parseVerdict,
	sha256Hex,
	type FirewallVerdict,
} from '../nodes/shared/client';

describe('canonicalize', () => {
	it('sorts keys recursively and drops undefined', () => {
		expect(canonicalize({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } })).toBe(
			'{"a":{"c":[2,{"y":2,"z":1}]},"b":1}',
		);
	});

	it('handles primitives and arrays', () => {
		expect(canonicalize('hello')).toBe('"hello"');
		expect(canonicalize(123)).toBe('123');
		expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
		expect(canonicalize([undefined, 'a'])).toBe('[null,"a"]');
	});
});

describe('idempotencyKey and sha256Hex', () => {
	it('generates consistent sha256Hex hashes', () => {
		expect(sha256Hex('test')).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
	});

	it('constructs deterministic idempotency keys', () => {
		const key1 = idempotencyKey('exec-1', 'guardNode', 0, { prompt: 'hi' });
		const key2 = idempotencyKey('exec-1', 'guardNode', 0, { prompt: 'hi' });
		expect(key1).toBe(key2);
		expect(key1.startsWith('exec-1:guardNode:0:')).toBe(true);
	});
});

describe('parseVerdict', () => {
	it('maps known decisions', () => {
		expect(parseVerdict({ decision: 'allow' }).decision).toBe('allow');
		expect(parseVerdict({ decision: 'ALLOWED' }).decision).toBe('allow');
		expect(parseVerdict({ decision: 'review' }).decision).toBe('review');
		expect(parseVerdict({ decision: 'needs_review' }).decision).toBe('review');
		expect(parseVerdict({ decision: 'block' }).decision).toBe('block');
	});

	it('fails closed on unknown or missing decisions', () => {
		expect(parseVerdict({ decision: 'maybe' }).decision).toBe('block');
		expect(parseVerdict({}).decision).toBe('block');
		expect(parseVerdict({ decision: 'ALLOW', allowed_to_proceed: false }).allowedToProceed).toBe(false);
	});

	it('extracts risk, evidence and sanitised/redacted content', () => {
		const v = parseVerdict({
			decision: 'allow',
			risk_score: 0.2,
			evidence_id: 'ev_1',
			redacted_body: 'clean text',
			violations: [{ type: 'pii' }],
		});
		expect(v.riskScore).toBe(0.2);
		expect(v.evidenceId).toBe('ev_1');
		expect(v.sanitized).toBe('clean text');
		expect(v.violations).toHaveLength(1);
	});

	it('supports findings in place of violations', () => {
		const v = parseVerdict({
			decision: 'allow',
			findings: [{ type: 'pii_redacted' }],
		});
		expect(v.violations).toHaveLength(1);
	});
});

describe('failVerdict', () => {
	it('returns fail-closed verdict with error details', () => {
		const v = failVerdict('block', 'timeout connecting to firewall');
		expect(v.decision).toBe('block');
		expect(v.allowedToProceed).toBe(false);
		expect(v.violations[0]).toEqual({
			type: 'firewall_unavailable',
			detail: 'timeout connecting to firewall',
		});
	});

	it('returns fail-open verdict when requested', () => {
		const v = failVerdict('allow', 'connection refused');
		expect(v.decision).toBe('allow');
		expect(v.allowedToProceed).toBe(true);
	});
});

describe('DLP body construction', () => {
	it('constructs tokenize request body according to backend contract', () => {
		const body = buildDlpBody({
			operation: 'tokenize',
			text: 'Contact user at test@example.com',
			destination: 'openai',
		});

		expect(body).toEqual({
			text: 'Contact user at test@example.com',
			destination: 'openai',
			entity_type: 'pii',
		});
	});

	it('constructs tokenize body with default empty destination', () => {
		const body = buildDlpBody({
			operation: 'tokenize',
			text: 'SSN: 000-00-0000',
		});

		expect(body).toEqual({
			text: 'SSN: 000-00-0000',
			destination: '',
			entity_type: 'pii',
		});
	});

	it('constructs detokenize request body according to backend contract', () => {
		const body = buildDlpBody({
			operation: 'detokenize',
			text: 'Contact user at tok_email_123',
			purpose: 'customer_support',
		});

		expect(body).toEqual({
			text: 'Contact user at tok_email_123',
			purpose: 'customer_support',
		});
	});

	it('defaults detokenize purpose to workflow_processing if omitted', () => {
		const body = buildDlpBody({
			operation: 'detokenize',
			text: 'tok_phone_456',
		});

		expect(body).toEqual({
			text: 'tok_phone_456',
			purpose: 'workflow_processing',
		});
	});
});

describe('InspectResponse body construction & field mapping', () => {
	it('constructs inspect-response request body according to backend contract', () => {
		const body = buildInspectResponseBody('Tool output with secret', 'tool_result', true);
		expect(body).toEqual({
			response_body: 'Tool output with secret',
			context: 'tool_result',
			redact_pii: true,
		});
	});

	it('maps redacted_body to default sanitizedContent field and attaches verdict', () => {
		const inputJson = { id: 101, rawOutput: 'Hello SSN 123-45-6789' };
		const verdict: FirewallVerdict = {
			decision: 'allow',
			allowedToProceed: true,
			riskScore: 0.1,
			violations: [],
			evidenceId: 'ev-999',
			sanitized: 'Hello SSN [REDACTED]',
			raw: {},
		};

		const output = mapInspectResponseOutput(inputJson, verdict, {
			attachVerdict: true,
			sanitizedField: 'sanitizedContent',
		});

		expect(output.id).toBe(101);
		expect(output.rawOutput).toBe('Hello SSN 123-45-6789');
		expect(output.sanitizedContent).toBe('Hello SSN [REDACTED]');
		expect(output._a2aFirewall).toEqual({
			decision: 'allow',
			allowedToProceed: true,
			riskScore: 0.1,
			violations: [],
			evidenceId: 'ev-999',
		});
	});

	it('maps to custom sanitized field name and records error if present', () => {
		const inputJson = { query: 'test' };
		const verdict: FirewallVerdict = {
			decision: 'block',
			allowedToProceed: false,
			riskScore: null,
			violations: [{ type: 'firewall_unavailable', detail: 'ECONNREFUSED' }],
			raw: {},
		};

		const output = mapInspectResponseOutput(
			inputJson,
			verdict,
			{ attachVerdict: true, sanitizedField: 'cleanedResult' },
			'ECONNREFUSED',
		);

		expect(output.query).toBe('test');
		expect(output.cleanedResult).toBeUndefined();
		expect(output._a2aFirewall).toEqual({
			decision: 'block',
			allowedToProceed: false,
			riskScore: null,
			violations: [{ type: 'firewall_unavailable', detail: 'ECONNREFUSED' }],
			evidenceId: undefined,
			error: 'ECONNREFUSED',
		});
	});

	it('omits _a2aFirewall when attachVerdict is false', () => {
		const inputJson = { query: 'test' };
		const verdict: FirewallVerdict = {
			decision: 'allow',
			allowedToProceed: true,
			riskScore: 0,
			violations: [],
			sanitized: 'cleaned',
			raw: {},
		};

		const output = mapInspectResponseOutput(inputJson, verdict, { attachVerdict: false });
		expect(output.sanitizedContent).toBe('cleaned');
		expect(output._a2aFirewall).toBeUndefined();
	});
});

describe('Guard inspect body construction and mapping', () => {
	it('constructs guard inspect request body matching backend schema', () => {
		const body = buildGuardInspectBody({
			taskId: 'task-123',
			rootTaskId: 'root-456',
			receiverAgentId: 'agent-789',
			taskType: 'llm_call',
			payload: { prompt: 'summarize report' },
			reviewCallbackUrl: 'https://n8n.example.com/webhook/resume',
			workflowId: 'wf-1',
			workflowName: 'Customer Bot',
			executionId: 'exec-1',
			nodeName: 'Firewall Guard',
			nonce: 'nonce-abc',
			timestamp: '2026-09-24T12:00:00.000Z',
		});

		expect(body).toEqual({
			task_id: 'task-123',
			root_task_id: 'root-456',
			receiver_agent_id: 'agent-789',
			task_type: 'llm_call',
			payload: { prompt: 'summarize report' },
			sdk_version: 'n8n-0.1.0',
			review_callback_url: 'https://n8n.example.com/webhook/resume',
			nonce: 'nonce-abc',
			timestamp: '2026-09-24T12:00:00.000Z',
			metadata: {
				source: 'n8n',
				workflow_id: 'wf-1',
				workflow_name: 'Customer Bot',
				execution_id: 'exec-1',
				node_name: 'Firewall Guard',
				review_callback_url: 'https://n8n.example.com/webhook/resume',
			},
		});
	});

	it('maps guard verdict and error to output json', () => {
		const inputJson = { step: 1 };
		const verdict: FirewallVerdict = {
			decision: 'allow',
			allowedToProceed: true,
			riskScore: 0.15,
			violations: [],
			taskId: 'task-123',
			evidenceId: 'ev-456',
			raw: {},
		};

		const output = mapGuardOutput(inputJson, verdict, true);
		expect(output.step).toBe(1);
		expect(output._a2aFirewall).toEqual({
			decision: 'allow',
			allowedToProceed: true,
			riskScore: 0.15,
			violations: [],
			taskId: 'task-123',
			evidenceId: 'ev-456',
		});
	});
});
