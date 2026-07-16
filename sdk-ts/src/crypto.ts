/**
 * Cryptographic primitives for the TypeScript SDK.
 * Uses tweetnacl for Ed25519 and Node.js crypto for SHA-256/HMAC.
 *
 * These are self-contained — no backend dependency.
 */

import { createHash, createHmac, randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import type { DelegationToken, VerifyResult } from './types';

// ---------------------------------------------------------------------------
// SHA-256
// ---------------------------------------------------------------------------

export function sha256Hex(data: Uint8Array | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data);
  return createHash('sha256').update(buf).digest('hex');
}

// ---------------------------------------------------------------------------
// Ed25519 key management
// ---------------------------------------------------------------------------

export interface Ed25519Keypair {
  privateKey: string; // hex
  publicKey: string;  // hex
}

export function generateEd25519Keypair(): Ed25519Keypair {
  const keyPair = nacl.sign.keyPair();
  return {
    privateKey: Buffer.from(keyPair.secretKey).toString('hex'),
    publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
  };
}

export function hexToPublicKey(hex: string): Uint8Array {
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length !== 32) throw new Error(`Invalid Ed25519 public key: expected 32 bytes, got ${bytes.length}`);
  return new Uint8Array(bytes);
}

export function hexToPrivateKey(hex: string): Uint8Array {
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length !== 64) throw new Error(`Invalid Ed25519 private key: expected 64 bytes, got ${bytes.length}`);
  return new Uint8Array(bytes);
}

export function publicKeyToHex(key: Uint8Array): string {
  return Buffer.from(key).toString('hex');
}

// ---------------------------------------------------------------------------
// Signing & verification
// ---------------------------------------------------------------------------

export function signMessage(privateKeyHex: string, messageHash: string): string {
  const secretKey = hexToPrivateKey(privateKeyHex);
  const msgBytes = Buffer.from(messageHash, 'hex');
  const signed = nacl.sign.detached(msgBytes, secretKey);
  return Buffer.from(signed).toString('hex');
}

export function verifyEd25519(publicKeyHex: string, signatureHex: string, messageHash: string): boolean {
  try {
    const publicKey = hexToPublicKey(publicKeyHex);
    const signature = Buffer.from(signatureHex, 'hex');
    const msgBytes = Buffer.from(messageHash, 'hex');
    return nacl.sign.detached.verify(msgBytes, signature, publicKey);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Message hashing & chain
// ---------------------------------------------------------------------------

export function computeMessageHash(
  payload: Record<string, unknown>,
  senderId: string,
  receiverId: string,
  timestamp: number,
): string {
  const canonical = JSON.stringify({ payload, sender: senderId, receiver: receiverId, ts: timestamp });
  return sha256Hex(canonical);
}

export function computeChainHash(parentChainHash: string | null, messageHash: string): string {
  const parent = parentChainHash || sha256Hex(new Uint8Array(32));
  const parentBytes = Buffer.from(parent, 'hex');
  const msgBytes = Buffer.from(messageHash, 'hex');
  const combined = Buffer.concat([parentBytes, msgBytes]);
  return sha256Hex(combined);
}

// ---------------------------------------------------------------------------
// Macaroon delegation tokens
// ---------------------------------------------------------------------------

function hmacSha256(key: Buffer, data: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function computeTokenSignature(rootKey: Buffer, location: string, identifier: string, caveats: string[]): string {
  const msg = `${location}\n${identifier}\n${caveats.join('\n')}`;
  return hmacSha256(rootKey, Buffer.from(msg, 'utf-8')).toString('hex');
}

export function mintDelegationToken(
  rootKeyHex: string,
  location: string,
  agentId: string,
  initialCaveats: string[] = [],
): DelegationToken {
  const rootKey = Buffer.from(rootKeyHex.length === 64 ? rootKeyHex : rootKeyHex, rootKeyHex.length === 64 ? 'hex' : 'utf-8');
  const signature = computeTokenSignature(rootKey, location, agentId, initialCaveats);
  return { location, identifier: agentId, caveats: [...initialCaveats], signature };
}

export function attenuateToken(
  token: DelegationToken,
  rootKeyHex: string,
  newCaveats: string[],
): DelegationToken {
  const rootKey = Buffer.from(rootKeyHex.length === 64 ? rootKeyHex : rootKeyHex, rootKeyHex.length === 64 ? 'hex' : 'utf-8');
  const allCaveats = [...token.caveats, ...newCaveats];
  const signature = computeTokenSignature(rootKey, token.location, token.identifier, allCaveats);
  return { location: token.location, identifier: token.identifier, caveats: allCaveats, signature };
}

export function verifyDelegationToken(token: DelegationToken, rootKeyHex: string): VerifyResult {
  const rootKey = Buffer.from(rootKeyHex.length === 64 ? rootKeyHex : rootKeyHex, rootKeyHex.length === 64 ? 'hex' : 'utf-8');
  const expectedSig = computeTokenSignature(rootKey, token.location, token.identifier, token.caveats);

  if (token.signature !== expectedSig) {
    return { signatureValid: false, chainValid: false, reason: 'signature_mismatch' };
  }

  // Check expiry if present
  const parsed = parseCaveats(token.caveats);
  if (parsed.expires) {
    const expiry = parseFloat(parsed.expires);
    if (!isNaN(expiry) && Date.now() / 1000 > expiry) {
      return { signatureValid: true, chainValid: false, reason: 'token_expired' };
    }
  }

  return { signatureValid: true, chainValid: true };
}

export function tokenToCompact(token: DelegationToken): string {
  return JSON.stringify(token);
}

export function tokenFromCompact(data: string): DelegationToken {
  return JSON.parse(data) as DelegationToken;
}

function parseCaveats(caveats: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const c of caveats) {
    const idx = c.indexOf('=');
    if (idx > 0) {
      result[c.substring(0, idx)] = c.substring(idx + 1);
    }
  }
  return result;
}
