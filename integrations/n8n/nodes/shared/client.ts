import { createHash, randomUUID } from 'crypto';
import type { IDataObject, IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';

export type Decision = 'allow' | 'block' | 'review';

export interface FirewallConfig {
	baseUrl: string;
	workspaceId: string;
	agentId: string;
	allowUnauthorizedCerts: boolean;
}

export interface FirewallVerdict {
	decision: Decision;
	allowedToProceed: boolean;
	riskScore: number | null;
	violations: unknown[];
	taskId?: string;
	evidenceId?: string;
	sanitized?: string;
	raw: IDataObject;
}

export const CLIENT_ID = 'n8n-a2a-firewall/0.1.0';

// ---------------------------------------------------------------------------
// Canonicalization & Hashing
// ---------------------------------------------------------------------------

/** Sorted-key, no-whitespace JSON. undefined values are dropped. */
export function canonicalize(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((v) => (v === undefined ? 'null' : canonicalize(v))).join(',')}]`;
	}
	if (value !== null && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		const parts = Object.keys(obj)
			.filter((k) => obj[k] !== undefined)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
		return `{${parts.join(',')}}`;
	}
	return JSON.stringify(value);
}

export function sha256Hex(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

// ---------------------------------------------------------------------------
// Verdict parsing: fail closed on anything unexpected
// ---------------------------------------------------------------------------

export function parseVerdict(res: IDataObject): FirewallVerdict {
	const d = String(res?.decision ?? '').toLowerCase();
	let decision: Decision = 'block'; // unknown or missing => block
	if (d === 'allow' || d === 'allowed') decision = 'allow';
	else if (d === 'review' || d === 'needs_review') decision = 'review';

	const risk = res?.risk_score;
	const sanitized = res?.redacted_body ?? res?.sanitized_content ?? res?.sanitized;
	const allowedToProceed =
		typeof res?.allowed_to_proceed === 'boolean'
			? res.allowed_to_proceed
			: decision === 'allow' || decision === 'review';

	const violations = Array.isArray(res?.violations)
		? (res.violations as unknown[])
		: Array.isArray(res?.findings)
			? (res.findings as unknown[])
			: [];

	return {
		decision,
		allowedToProceed,
		riskScore: typeof risk === 'number' ? risk : null,
		violations,
		taskId: res?.task_id ? String(res.task_id) : undefined,
		evidenceId: res?.evidence_id ? String(res.evidence_id) : undefined,
		sanitized: typeof sanitized === 'string' ? sanitized : undefined,
		raw: res ?? {},
	};
}

export function failVerdict(decision: Decision, error: string): FirewallVerdict {
	return {
		decision,
		allowedToProceed: decision !== 'block',
		riskScore: null,
		violations: [{ type: 'firewall_unavailable', detail: error }],
		raw: {},
	};
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export async function getConfig(ctx: IExecuteFunctions): Promise<FirewallConfig> {
	const c = await ctx.getCredentials('a2aFirewallApi');
	return {
		baseUrl: String(c.baseUrl).replace(/\/+$/, ''),
		workspaceId: String(c.workspaceId ?? ''),
		agentId: String(c.agentId ?? ''),
		allowUnauthorizedCerts: Boolean(c.allowUnauthorizedCerts),
	};
}

export async function postJson(
	ctx: IExecuteFunctions,
	cfg: FirewallConfig,
	path: string,
	body: IDataObject,
	idempotencyKeyVal: string,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method: 'POST',
		url: `${cfg.baseUrl}${path}`,
		body,
		json: true,
		headers: {
			'Idempotency-Key': idempotencyKeyVal,
			'X-A2A-Client': CLIENT_ID,
		},
		timeout: 10_000,
		skipSslCertificateValidation: cfg.allowUnauthorizedCerts,
	};
	return (await ctx.helpers.httpRequestWithAuthentication.call(
		ctx,
		'a2aFirewallApi',
		options,
	)) as IDataObject;
}

export function idempotencyKey(
	executionId: string,
	nodeName: string,
	itemIndex: number,
	payload: unknown,
): string {
	return `${executionId}:${nodeName}:${itemIndex}:${sha256Hex(canonicalize(payload)).slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// Request body builders & response mappers
// ---------------------------------------------------------------------------

export interface DlpParams {
	operation: 'tokenize' | 'detokenize';
	text: string;
	destination?: string;
	purpose?: string;
}

export function buildDlpBody(params: DlpParams): IDataObject {
	const body: IDataObject = { text: params.text };
	if (params.operation === 'tokenize') {
		body.destination = params.destination ?? '';
		body.entity_type = 'pii';
	} else {
		body.purpose = params.purpose || 'workflow_processing';
	}
	return body;
}

export function buildInspectResponseBody(
	content: string,
	sourceType: string,
	redactPii: boolean = true,
): IDataObject {
	return {
		response_body: content,
		context: sourceType,
		redact_pii: redactPii,
	};
}

export interface MapInspectResponseOptions {
	attachVerdict?: boolean;
	sanitizedField?: string;
}

export function mapInspectResponseOutput(
	inputJson: IDataObject,
	verdict: FirewallVerdict,
	options: MapInspectResponseOptions = {},
	error?: string,
): IDataObject {
	const json: IDataObject = { ...inputJson };
	if (verdict.sanitized !== undefined) {
		json[options.sanitizedField || 'sanitizedContent'] = verdict.sanitized;
	}
	if (options.attachVerdict !== false) {
		json._a2aFirewall = {
			decision: verdict.decision,
			allowedToProceed: verdict.allowedToProceed,
			riskScore: verdict.riskScore,
			violations: verdict.violations,
			evidenceId: verdict.evidenceId,
			...(error ? { error } : {}),
		} as IDataObject;
	}
	return json;
}

export interface GuardInspectParams {
	taskId: string;
	rootTaskId: string;
	receiverAgentId: string;
	taskType: string;
	payload: unknown;
	reviewCallbackUrl?: string;
	workflowId?: string;
	workflowName?: string;
	executionId?: string;
	nodeName?: string;
	nonce?: string;
	timestamp?: string;
}

export function buildGuardInspectBody(params: GuardInspectParams): IDataObject {
	return {
		task_id: params.taskId,
		root_task_id: params.rootTaskId,
		receiver_agent_id: params.receiverAgentId,
		task_type: params.taskType,
		payload: params.payload as IDataObject,
		sdk_version: 'n8n-0.1.0',
		review_callback_url: params.reviewCallbackUrl || undefined,
		nonce: params.nonce || randomUUID(),
		timestamp: params.timestamp || new Date().toISOString(),
		metadata: {
			source: 'n8n',
			workflow_id: params.workflowId,
			workflow_name: params.workflowName,
			execution_id: params.executionId,
			node_name: params.nodeName,
			review_callback_url: params.reviewCallbackUrl || undefined,
		},
	};
}

export function mapGuardOutput(
	inputJson: IDataObject,
	verdict: FirewallVerdict,
	attachVerdict: boolean = true,
	error?: string,
): IDataObject {
	if (!attachVerdict) {
		return inputJson;
	}
	return {
		...inputJson,
		_a2aFirewall: {
			decision: verdict.decision,
			allowedToProceed: verdict.allowedToProceed,
			riskScore: verdict.riskScore,
			violations: verdict.violations,
			taskId: verdict.taskId,
			evidenceId: verdict.evidenceId,
			...(error ? { error } : {}),
		} as IDataObject,
	};
}
