import { describe, it, expect } from 'vitest';
import {
  generateEd25519Keypair,
  signMessage,
  verifyEd25519,
  computeMessageHash,
  computeChainHash,
  mintDelegationToken,
  attenuateToken,
  verifyDelegationToken,
  tokenToCompact,
  tokenFromCompact,
  A2AFirewall,
} from './index';

describe('Ed25519 Signing & Verification', () => {
  it('generates keypair and signs/verifies message', () => {
    const { publicKey, privateKey } = generateEd25519Keypair();
    const msg = 'hello world test message';
    const msgHex = Buffer.from(msg).toString('hex');

    const signature = signMessage(privateKey, msgHex);
    expect(signature).toBeDefined();
    expect(signature.length).toBe(128); // 64 bytes hex

    const valid = verifyEd25519(publicKey, signature, msgHex);
    expect(valid).toBe(true);

    const wrongKey = generateEd25519Keypair().publicKey;
    const invalid = verifyEd25519(wrongKey, signature, msgHex);
    expect(invalid).toBe(false);
  });

  it('computes deterministic message hash and chain hash', () => {
    const payload = { query: 'test query', count: 5 };
    const sender = 'agent-1';
    const receiver = 'agent-2';
    const ts = 1700000000;

    const hash1 = computeMessageHash(payload, sender, receiver, ts);
    const hash2 = computeMessageHash(payload, sender, receiver, ts);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);

    const chain1 = computeChainHash(null, hash1);
    const chain2 = computeChainHash(chain1, hash2);
    expect(chain1.length).toBe(64);
    expect(chain2.length).toBe(64);
    expect(chain1).not.toBe(chain2);
  });
});

describe('Delegation Token Lifecycle', () => {
  const rootKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('mints and verifies delegation token', () => {
    const token = mintDelegationToken(
      rootKeyHex,
      'ws-123',
      'agent-root',
      ['task_type=research', 'max_risk=0.8']
    );

    expect(token.location).toBe('ws-123');
    expect(token.identifier).toBe('agent-root');
    expect(token.caveats).toHaveLength(2);
    expect(token.signature).toBeDefined();

    const verification = verifyDelegationToken(token, rootKeyHex);
    expect(verification.signatureValid).toBe(true);
    expect(verification.chainValid).toBe(true);
  });

  it('attenuates token and verifies new caveats', () => {
    const rootToken = mintDelegationToken(
      rootKeyHex,
      'ws-123',
      'agent-root',
      ['task_type=research', 'max_risk=0.8']
    );

    const childToken = attenuateToken(rootToken, rootKeyHex, ['max_risk=0.4', 'receiver=agent-child']);
    expect(childToken.caveats).toHaveLength(4);

    const verification = verifyDelegationToken(childToken, rootKeyHex);
    expect(verification.signatureValid).toBe(true);
    expect(verification.chainValid).toBe(true);

    const wrongKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
    const failedVerification = verifyDelegationToken(childToken, wrongKey);
    expect(failedVerification.signatureValid).toBe(false);
  });

  it('compact serialization roundtrip', () => {
    const token = mintDelegationToken(
      rootKeyHex,
      'ws-123',
      'agent-root',
      ['task_type=research']
    );

    const compact = tokenToCompact(token);
    expect(typeof compact).toBe('string');

    const recovered = tokenFromCompact(compact);
    expect(recovered).toEqual(token);
  });
});

describe('A2AFirewall Client', () => {
  it('manages context and delegation chain', () => {
    const fw = new A2AFirewall({
      firewallUrl: 'http://localhost:8000',
      workspaceId: 'ws-123',
      agentId: 'agent-1',
      agentApiKey: 'agt_key',
    });

    fw.setContext({
      taskId: 'task-1',
      rootTaskId: 'root-1',
      traceId: 'trace-1',
      spanId: 'span-1',
      chainHash: 'chain-hash-1',
    });

    expect(fw.getChainHash()).toBe('chain-hash-1');
  });

  it('creates delegation tokens through client', () => {
    const fw = new A2AFirewall({
      firewallUrl: 'http://localhost:8000',
      workspaceId: 'ws-123',
      agentId: 'agent-1',
      agentApiKey: 'agt_key',
    });

    const rootKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const compact = fw.createDelegationToken(
      rootKeyHex,
      'agent-2',
      { taskType: 'research', maxRisk: 0.5 },
    );

    expect(compact).toBeDefined();
    expect(fw.getDelegationChain()).toEqual(['agent-2']);
  });

  it('auto-detects proxy from environment variables', () => {
    const origProxy = process.env.HTTPS_PROXY;
    process.env.HTTPS_PROXY = 'http://127.0.0.1:8080';

    const fw = new A2AFirewall({
      firewallUrl: 'http://localhost:8000',
      agentApiKey: 'agt_key',
    });

    expect(fw.proxyDetected).toBe(true);

    if (origProxy !== undefined) {
      process.env.HTTPS_PROXY = origProxy;
    } else {
      delete process.env.HTTPS_PROXY;
    }
  });

  it('reports proxyDetected as false when no proxy env is set', () => {
    const origProxy = process.env.HTTPS_PROXY;
    const origA2A = process.env.A2A_PROXY_URL;
    delete process.env.HTTPS_PROXY;
    delete process.env.A2A_PROXY_URL;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;

    const fw = new A2AFirewall({
      firewallUrl: 'http://localhost:8000',
      agentApiKey: 'agt_key',
    });

    expect(fw.proxyDetected).toBe(false);

    if (origProxy) process.env.HTTPS_PROXY = origProxy;
    if (origA2A) process.env.A2A_PROXY_URL = origA2A;
  });
});

