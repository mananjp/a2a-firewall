/**
 * A2A Firewall TypeScript SDK — main client class.
 *
 * OpenTelemetry integration (optional):
 * Install @opentelemetry/api — SDK auto-creates CLIENT spans for each
 * firewall.inspect call with zero additional config.
 */

import type {
  FirewallConfig,
  FirewallResponse,
  SendOptions,
  InspectRequest,
  VerifyResult,
  DelegationToken,
  Violation,
} from './types';
import { FirewallBlockedError } from './types';
import {
  generateEd25519Keypair,
  signMessage,
  verifyEd25519,
  computeMessageHash,
  computeChainHash,
  sha256Hex,
  mintDelegationToken,
  attenuateToken,
  tokenToCompact,
  tokenFromCompact,
  verifyDelegationToken,
} from './crypto';

// Lazy-loaded OTel module — no-op when @opentelemetry/api is missing
let _otel: any;
try {
  _otel = require('@opentelemetry/api');
} catch { /* not installed */ }

export class A2AFirewall {
  private config: Required<Pick<FirewallConfig, 'timeoutMs' | 'failMode' | 'reviewPollIntervalMs' | 'reviewMaxWaitMs'>> & FirewallConfig;
  private ctx: Record<string, string | undefined> = {};
  private chainHash: string | null = null;
  private delegationToken: DelegationToken | null = null;
  private delegationChain: string[] = [];

  constructor(config: FirewallConfig) {
    this.config = {
      ...config,
      workspaceId: config.workspaceId ?? '',
      agentId: config.agentId ?? '',
      timeoutMs: config.timeoutMs ?? 5000,
      failMode: config.failMode ?? 'closed',
      reviewPollIntervalMs: config.reviewPollIntervalMs ?? 2000,
      reviewMaxWaitMs: config.reviewMaxWaitMs ?? 60000,
    };
  }

  // ---------------------------------------------------------------------------
  // Context management
  // ---------------------------------------------------------------------------

  setContext(opts: {
    taskId: string;
    rootTaskId: string;
    traceId?: string;
    spanId?: string;
    chainHash?: string;
    delegationToken?: string;
  }): void {
    this.ctx = {
      current_task_id: opts.taskId,
      root_task_id: opts.rootTaskId,
      trace_id: opts.traceId,
      span_id: opts.spanId,
    };
    if (opts.chainHash) this.chainHash = opts.chainHash;
    if (opts.delegationToken) this.delegationToken = tokenFromCompact(opts.delegationToken);
  }

  // ---------------------------------------------------------------------------
  // Signing
  // ---------------------------------------------------------------------------

  private signPayload(payload: Record<string, unknown>, receiverId: string): {
    messageHash: string;
    chainHash: string;
    signature: string;
  } {
    const now = Date.now() / 1000;
    const messageHash = computeMessageHash(payload, this.config.agentId!, receiverId, now);
    const chainHash = computeChainHash(this.chainHash, messageHash);

    let signature = '';
    if (this.config.agentPrivateKey) {
      signature = signMessage(this.config.agentPrivateKey, messageHash);
    }

    this.chainHash = chainHash;
    return { messageHash, chainHash, signature };
  }

  // ---------------------------------------------------------------------------
  // Delegation
  // ---------------------------------------------------------------------------

  createDelegationToken(
    rootKeyHex: string,
    receiverAgentId: string,
    opts?: { taskType?: string; maxRisk?: number },
  ): string {
    const caveats = [`receiver=${receiverAgentId}`];
    if (opts?.taskType) caveats.push(`task_type=${opts.taskType}`);
    if (opts?.maxRisk !== undefined) caveats.push(`max_risk=${opts.maxRisk}`);

    let token: DelegationToken;
    if (this.delegationToken) {
      token = attenuateToken(this.delegationToken, rootKeyHex, caveats);
    } else {
      token = mintDelegationToken(rootKeyHex, this.config.workspaceId!, this.config.agentId!, caveats);
    }

    this.delegationToken = token;
    this.delegationChain.push(receiverAgentId);
    return tokenToCompact(token);
  }

  // ---------------------------------------------------------------------------
  // Core send
  // ---------------------------------------------------------------------------

  async send(options: SendOptions): Promise<FirewallResponse> {
    const taskId = crypto.randomUUID();
    const { messageHash, chainHash, signature } = this.signPayload(options.payload, options.receiverAgentId);

    // Get public key from private key
    let senderPublicKey = '';
    if (this.config.agentPrivateKey) {
      // Derive public key — in real impl use nacl; simplified here
      senderPublicKey = ''; // populated by backend verification
    }

    const body: InspectRequest & Record<string, any> = {
      task_id: taskId,
      parent_task_id: options.parentTaskId || this.ctx.current_task_id,
      root_task_id: options.rootTaskId || this.ctx.root_task_id || taskId,
      receiver_agent_id: options.receiverAgentId,
      task_type: options.taskType,
      schema_version: options.schemaVersion ?? 'v1',
      resource_type: options.resourceType,
      resource_id: options.resourceId,
      action: options.action,
      payload: options.payload,
      trace_id: this.ctx.trace_id,
      parent_span_id: this.ctx.span_id,
      sdk_version: '0.2.0-ts',
      depth: options.depth ?? 0,
      sender_signature: signature,
      sender_public_key: senderPublicKey,
    };

    if (this.delegationToken) {
      body.delegation_token = tokenToCompact(this.delegationToken);
    }

    // ── OTel (auto when @opentelemetry/api installed) ──
    let span: any;
    if (_otel) {
      const tracer = _otel.trace.getTracer('a2a-firewall-sdk', '0.2.0');
      span = tracer.startSpan('firewall.inspect', {
        kind: _otel.SpanKind.CLIENT,
        attributes: { task_type: options.taskType, receiver_agent_id: options.receiverAgentId },
      });
      const sc = span.spanContext();
      if (_otel.trace.isSpanContextValid(sc)) {
        body.trace_id = sc.traceId;
        body.parent_span_id = sc.spanId;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(`${this.config.firewallUrl}/v1/firewall/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.agentApiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text();
        if (span) span.setStatus({ code: 2, message: `HTTP ${res.status}` });
        throw new Error(`Firewall HTTP ${res.status}: ${errBody}`);
      }

      const data: any = await res.json();
      const fw: FirewallResponse = {
        taskId: data.task_id,
        decision: data.decision,
        allowed: data.allowed_to_proceed,
        riskScore: data.risk_score,
        violations: data.violations ?? [],
        reviewToken: data.review_token,
        blockReason: data.block_reason,
        latencyMs: data.latency_ms ?? 0,
        traceId: data.trace_id,
      };

      if (span) {
        span.setAttribute('decision', data.decision);
        span.setAttribute('risk_score', data.risk_score);
        span.setStatus({ code: 1 });
      }

      if (fw.decision === 'review') { span?.end(); return this.waitForReview(fw); }

      if (!fw.allowed && (options.raiseOnBlock ?? true)) {
        if (span) span.setStatus({ code: 2, message: fw.blockReason ?? 'blocked' });
        throw new FirewallBlockedError(fw.taskId, fw.blockReason ?? 'unknown', fw.riskScore, fw.violations);
      }

      return fw;
    } catch (err: any) {
      clearTimeout(timeout);
      if (span) { span.recordException(err); span.setStatus({ code: 2, message: err.message ?? String(err) }); }
      if (err.name === 'AbortError') {
        if (this.config.failMode === 'closed') throw new FirewallBlockedError(taskId, 'firewall_unreachable', 1.0, []);
        return { taskId, decision: 'allow', allowed: true, riskScore: 0.0, violations: [], latencyMs: -1 };
      }
      throw err;
    } finally {
      span?.end();
    }
  }

  // ---------------------------------------------------------------------------
  // Review polling
  // ---------------------------------------------------------------------------

  private async waitForReview(fw: FirewallResponse): Promise<FirewallResponse> {
    const deadline = Date.now() + this.config.reviewMaxWaitMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, this.config.reviewPollIntervalMs));
      try {
        const res = await fetch(
          `${this.config.firewallUrl}/v1/review/${fw.reviewToken}/status`,
          { headers: { Authorization: `Bearer ${this.config.agentApiKey}` } },
        );
        const s: any = await res.json();
        if (s.status === 'approved') {
          fw.decision = 'allow';
          fw.allowed = true;
          return fw;
        }
        if (s.status === 'rejected') {
          fw.decision = 'block';
          fw.allowed = false;
          fw.blockReason = `Rejected: ${s.reviewer_notes ?? ''}`;
          return fw;
        }
      } catch {
        // transient errors during polling
      }
    }
    fw.decision = 'block';
    fw.allowed = false;
    fw.blockReason = 'review_timeout';
    return fw;
  }

  // ---------------------------------------------------------------------------
  // Verify incoming
  // ---------------------------------------------------------------------------

  verifyMessage(
    senderPublicKey: string,
    messageHash: string,
    signature: string,
    expectedParentChainHash?: string,
  ): VerifyResult {
    const sigValid = verifyEd25519(senderPublicKey, signature, messageHash);

    let chainValid = true;
    if (expectedParentChainHash && this.chainHash) {
      const expected = computeChainHash(expectedParentChainHash, messageHash);
      chainValid = expected === this.chainHash;
    }

    return { signatureValid: sigValid, chainValid, reason: sigValid && chainValid ? undefined : 'verification_failed' };
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  getDelegationChain(): string[] {
    return [...this.delegationChain];
  }

  getChainHash(): string | null {
    return this.chainHash;
  }

  static generateKeypair = generateEd25519Keypair;
}
