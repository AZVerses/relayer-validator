import { createHash, createPublicKey, createVerify } from 'crypto';
import { readFile } from 'fs/promises';
import { Agent as HttpsAgent } from 'https';
import axios from 'axios';

// Mirror of az-vault-relayer's http-signature.buildValue / buildSignedMessage.
// Internal convention: data is flat (scalars and arrays of scalars only) —
// nested objects would collapse to `[object Object]` and collide.
function buildValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(buildValue).join('|')}]`;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

/**
 * Canonical signed message: `<timestamp>|<sorted-body>|x-nonce=<nonce>`.
 * The trailing token uses `x-nonce=` (matches the HTTP header name)
 * so this stays byte-for-byte compatible with the parent repo's
 * buildSignedMessage and with AZX's verifier.
 */
export function buildSignedMessage(data: Record<string, unknown>, timestamp: number, nonce: string): string {
  const keys = Object.keys(data).sort();
  const body = keys.map(key => `${key}=${buildValue(data[key])}`).join('|');
  return `${timestamp}|${body}|x-nonce=${nonce}`;
}

function isHttpsUrl(source: string): boolean {
  return /^https:\/\//i.test(source);
}

function requirePemContent(source: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`PEM public key at ${source} is empty`);
  }

  return value;
}

function normalizeFingerprint(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('PEM public key SHA-256 fingerprint must be a 64-character hex string');
  }
  return normalized;
}

function pemFingerprint(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function verifyFingerprint(source: string, pem: string, expectedSha256: string | undefined): void {
  const expected = normalizeFingerprint(expectedSha256);
  if (!expected) {
    if (isHttpsUrl(source)) {
      throw new Error('HTTPS PEM public key requires CALLER_PEM_PUBLIC_KEY_SHA256 pinning');
    }
    return;
  }

  const actual = pemFingerprint(pem);
  if (actual !== expected) {
    throw new Error(`PEM public key SHA-256 mismatch for ${source}: expected ${expected}, got ${actual}`);
  }
}

export async function readPemPublicKey(source: string, expectedSha256?: string): Promise<string> {
  try {
    if (isHttpsUrl(source)) {
      const response = await axios.get<string>(source, {
        timeout: 10000,
        proxy: false,
        responseType: 'text',
        maxRedirects: 0,
        httpsAgent: new HttpsAgent({ rejectUnauthorized: true }),
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`unexpected status ${response.status}`);
      }
      const pem = requirePemContent(source, response.data);
      verifyFingerprint(source, pem, expectedSha256);
      return pem;
    }

    const pem = requirePemContent(source, await readFile(source, 'utf8'));
    verifyFingerprint(source, pem, expectedSha256);
    return pem;
  } catch (error) {
    throw new Error(`Failed to read PEM public key from ${source}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateInlinePemPublicKey(value: string): string {
  const pem = value.replace(/\\n/g, '\n').trim();
  const content = requirePemContent('CALLER_PEM_PUBLIC_KEY', pem);
  try {
    createPublicKey({
      key: content,
      format: 'pem',
    });
  } catch (error) {
    throw new Error(`Invalid CALLER_PEM_PUBLIC_KEY: ${error instanceof Error ? error.message : String(error)}`);
  }
  return content;
}

export function verifySignatureWithPem(message: string, signature: string, pemPublicKey: string): boolean {
  try {
    const publicKey = createPublicKey({
      key: pemPublicKey,
      format: 'pem',
    });
    const verifier = createVerify('sha256');
    verifier.update(message, 'utf8');
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, 'base64'));
  } catch (error) {
    throw new Error(`Failed to verify PEM signature: ${error instanceof Error ? error.message : String(error)}`);
  }
}
