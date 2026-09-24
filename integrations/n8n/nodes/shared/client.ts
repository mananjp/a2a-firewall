import { createHash, createPrivateKey, sign, type KeyObject } from 'crypto';
import type { IDataObject, IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';

export type Decision = 'allow' | 'block' | 'review';

export interface FirewallConfig {
	baseUrl: string;
	workspaceId: string;
	agentId: string;
	agentPrivateKey?: string;
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

export const CLIENT_ID = 'n8n-nodes-a2a-firewall/0.1.0';

// ---------------------------------------------------------------------------
// Signing & Key Management
// ---------------------------------------------------------------------------

/** PKCS#8 DER prefix for an Ed25519 private key; append the 32-byte seed. */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export function loadPrivateKey(hex: string): KeyObject {
	const clean = hex.trim().replace(/^0x/, '');
	if (!/^[0-9a-fA-F]+$/.test(clean) || (clean.length !== 64 && clean.length !== 128)) {
		throw new Error(
			'Agent private key must be a 32-byte seed (64 hex chars) or a 64-byte expanded key (128 hex chars)',
		);
	}
	const seed = Buffer.from(clean.slice(0, 64), 'hex');
	return createPrivateKey({
		key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
		format: 'der',
		type: 'pkcs8',
	});
}

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

export function signBody(body: IDataObject, key: KeyObject): string {
	const unsigned: IDataObject = { ...body };
	delete unsigned.signature;
	return sign(null, Buffer.from(canonicalize(unsigned)), key).toString('hex');
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
		agentPrivateKey: c.agentPrivateKey ? String(c.agentPrivateKey) : undefined,
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
