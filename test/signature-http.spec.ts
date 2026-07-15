import axios from 'axios';
import { createHash, generateKeyPairSync } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPemPublicKey, validateInlinePemPublicKey } from '../src/services/http/signature';

vi.mock('axios');

describe('readPemPublicKey', () => {
  const mockedAxios = vi.mocked(axios, true);
  const remotePem = '-----BEGIN PUBLIC KEY-----\nREMOTE\n-----END PUBLIC KEY-----\n';

  function pemSha256(pem: string): string {
    return createHash('sha256')
      .update(pem.replace(/\r\n/g, '\n').trim(), 'utf8')
      .digest('hex');
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads a local PEM file', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'az-validator-pem-'));
    const pemPath = path.join(tempDir, 'caller.pem');
    writeFileSync(pemPath, '-----BEGIN PUBLIC KEY-----\nLOCAL\n-----END PUBLIC KEY-----\n', 'utf8');

    await expect(readPemPublicKey(pemPath)).resolves.toContain('BEGIN PUBLIC KEY');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('loads a local PEM file with a matching SHA-256 pin', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'az-validator-pem-'));
    const pemPath = path.join(tempDir, 'caller.pem');
    const localPem = '-----BEGIN PUBLIC KEY-----\nLOCAL\n-----END PUBLIC KEY-----\n';
    writeFileSync(pemPath, localPem, 'utf8');

    await expect(readPemPublicKey(pemPath, pemSha256(localPem))).resolves.toContain(
      'BEGIN PUBLIC KEY',
    );
  });

  it('rejects a local PEM file when the SHA-256 pin does not match', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'az-validator-pem-'));
    const pemPath = path.join(tempDir, 'caller.pem');
    writeFileSync(pemPath, '-----BEGIN PUBLIC KEY-----\nLOCAL\n-----END PUBLIC KEY-----\n', 'utf8');

    await expect(readPemPublicKey(pemPath, '0'.repeat(64))).rejects.toThrow(
      'PEM public key SHA-256 mismatch',
    );
  });

  it('loads a PEM file from https with a SHA-256 pin', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: remotePem,
    } as any);

    await expect(
      readPemPublicKey('https://cdn.example.com/caller.pem', pemSha256(remotePem)),
    ).resolves.toContain('REMOTE');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://cdn.example.com/caller.pem',
      expect.objectContaining({
        maxRedirects: 0,
        proxy: false,
        responseType: 'text',
        timeout: 10000,
        validateStatus: expect.any(Function),
        httpsAgent: expect.objectContaining({
          options: expect.objectContaining({
            rejectUnauthorized: true,
          }),
        }),
      }),
    );
  });

  it('rejects https PEM loading without a SHA-256 pin', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: remotePem,
    } as any);

    await expect(readPemPublicKey('https://cdn.example.com/caller.pem')).rejects.toThrow(
      'HTTPS PEM public key requires CALLER_PEM_PUBLIC_KEY_SHA256 pinning',
    );
  });

  it('rejects https PEM loading when the SHA-256 pin does not match', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: remotePem,
    } as any);

    await expect(
      readPemPublicKey('https://cdn.example.com/caller.pem', 'f'.repeat(64)),
    ).rejects.toThrow('PEM public key SHA-256 mismatch');
  });

  it('does not follow PEM endpoint redirects', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 302,
      data: remotePem,
    } as any);

    await expect(readPemPublicKey('https://cdn.example.com/caller.pem', pemSha256(remotePem))).rejects.toThrow(
      'unexpected status 302',
    );
  });
});

describe('validateInlinePemPublicKey', () => {
  it('normalizes escaped newlines and validates a PEM public key', () => {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(validateInlinePemPublicKey(pem.replace(/\n/g, '\\n'))).toBe(pem.trim());
  });

  it('rejects malformed inline PEM content', () => {
    expect(() => validateInlinePemPublicKey('not-a-pem')).toThrow('Invalid CALLER_PEM_PUBLIC_KEY');
  });
});
