import { createPublicKey, generateKeyPairSync, verify } from 'crypto';
import { canonicalize, failVerdict, loadPrivateKey, parseVerdict, signBody } from '../nodes/shared/client';

describe('canonicalize', () => {
	it('sorts keys recursively and drops undefined', () => {
		expect(canonicalize({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } })).toBe(
			'{"a":{"c":[2,{"y":2,"z":1}]},"b":1}',
		);
	});
});

describe('signing', () => {
	it('produces a signature that verifies with the matching public key', () => {
		const { privateKey } = generateKeyPairSync('ed25519');
		const der = privateKey.export({ format: 'der', type: 'pkcs8' });
		const seedHex = der.subarray(der.length - 32).toString('hex');

		const key = loadPrivateKey(seedHex);
		const body = { b: 1, a: 'x' };
		const sig = signBody(body, key);

		expect(
			verify(null, Buffer.from(canonicalize(body)), createPublicKey(key), Buffer.from(sig, 'hex')),
		).toBe(true);
	});

	it('ignores an existing signature field', () => {
		const { privateKey } = generateKeyPairSync('ed25519');
		const der = privateKey.export({ format: 'der', type: 'pkcs8' });
		const key = loadPrivateKey(der.subarray(der.length - 32).toString('hex'));
		expect(signBody({ a: 1 }, key)).toBe(signBody({ a: 1, signature: 'old' }, key));
	});

	it('rejects malformed keys', () => {
		expect(() => loadPrivateKey('nothex')).toThrow();
		expect(() => loadPrivateKey('abcd')).toThrow();
	});
});

describe('parseVerdict', () => {
	it('maps known decisions', () => {
		expect(parseVerdict({ decision: 'allow' }).decision).toBe('allow');
		expect(parseVerdict({ decision: 'ALLOWED' }).decision).toBe('allow');
		expect(parseVerdict({ decision: 'review' }).decision).toBe('review');
		expect(parseVerdict({ decision: 'block' }).decision).toBe('block');
	});

	it('fails closed on unknown or missing decisions', () => {
		expect(parseVerdict({ decision: 'maybe' }).decision).toBe('block');
		expect(parseVerdict({}).decision).toBe('block');
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
});
