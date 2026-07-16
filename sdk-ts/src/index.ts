/**
 * A2A Firewall TypeScript SDK — Ed25519 identity, macaroon delegation, message signing.
 *
 * Install:
 *   npm install @a2a-firewall/sdk
 *
 * Usage:
 *   import { A2AFirewall, FirewallConfig } from '@a2a-firewall/sdk';
 *
 *   const firewall = new A2AFirewall({
 *     firewallUrl: 'http://localhost:8000',
 *     workspaceId: 'ws-uuid',
 *     agentId: 'agent-uuid',
 *     agentApiKey: 'agt_xxx',
 *     agentPrivateKey: 'ed25519-hex',
 *     workspaceRootPubkey: 'ed25519-hex',
 *     failMode: 'closed',
 *   });
 *
 *   const response = await firewall.send({
 *     receiverAgentId: 'target-uuid',
 *     taskType: 'research',
 *     payload: { query: 'What is fraud?' },
 *   });
 */

export { A2AFirewall } from './client';
export { FirewallConfig, FirewallResponse, FirewallBlockedError, DelegationToken } from './types';
export {
  generateEd25519Keypair,
  hexToPublicKey,
  publicKeyToHex,
  sha256Hex,
  computeMessageHash,
  computeChainHash,
  signMessage,
  verifyEd25519,
  mintDelegationToken,
  attenuateToken,
  verifyDelegationToken,
  tokenToCompact,
  tokenFromCompact,
} from './crypto';
