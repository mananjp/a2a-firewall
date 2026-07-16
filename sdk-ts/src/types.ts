/** Core types for the A2A Firewall TypeScript SDK. */

export interface FirewallConfig {
  firewallUrl: string;
  agentApiKey: string;
  workspaceId?: string;
  agentId?: string;
  /** Hex-encoded Ed25519 private key for signing messages. */
  agentPrivateKey?: string;
  /** Hex-encoded Ed25519 public key for verifying agent cards. */
  workspaceRootPubkey?: string;
  timeoutMs?: number;
  failMode?: 'open' | 'closed';
  reviewPollIntervalMs?: number;
  reviewMaxWaitMs?: number;
}

export interface FirewallResponse {
  taskId: string;
  decision: 'allow' | 'block' | 'review';
  allowed: boolean;
  riskScore: number;
  violations: Violation[];
  reviewToken?: string;
  blockReason?: string;
  latencyMs: number;
  traceId?: string;
}

export interface Violation {
  layer: string;
  violation_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown>;
}

export class FirewallBlockedError extends Error {
  taskId: string;
  reason: string;
  riskScore: number;
  violations: Violation[];

  constructor(taskId: string, reason: string, riskScore: number, violations: Violation[]) {
    super(`Task ${taskId} blocked: ${reason}`);
    this.name = 'FirewallBlockedError';
    this.taskId = taskId;
    this.reason = reason;
    this.riskScore = riskScore;
    this.violations = violations;
  }
}

export interface DelegationToken {
  location: string;
  identifier: string;
  caveats: string[];
  signature: string;
}

export interface SendOptions {
  receiverAgentId: string;
  taskType: string;
  payload: Record<string, unknown>;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  parentTaskId?: string;
  rootTaskId?: string;
  raiseOnBlock?: boolean;
  schemaVersion?: string;
  depth?: number;
}

export interface InspectRequest {
  task_id: string;
  parent_task_id?: string;
  root_task_id?: string;
  receiver_agent_id: string;
  task_type: string;
  schema_version: string;
  payload: Record<string, unknown>;
  trace_id?: string;
  parent_span_id?: string;
  sdk_version: string;
  depth: number;
  sender_signature?: string;
  sender_public_key?: string;
  delegation_token?: string;
}

export interface VerifyResult {
  signatureValid: boolean;
  chainValid: boolean;
  reason?: string;
}
