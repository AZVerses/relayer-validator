import { Wallet, ethers } from 'ethers';
import { createSign, generateKeyPairSync } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { AppConfig } from '../src/config';
import { ValidatorSignerBackend } from '../src/services/kms/backend';
import { buildSignedMessage } from '../src/services/http/signature';

export class InMemorySignerBackend implements ValidatorSignerBackend {
  private readonly wallet: Wallet;

  constructor() {
    this.wallet = new Wallet(`0x${String(1).padStart(64, '0')}`);
  }

  async getValidatorAddress(): Promise<string> {
    return this.wallet.address;
  }

  async signDigest(digest: string): Promise<string> {
    return this.wallet.signMessage(ethers.getBytes(digest));
  }

  async signRaw(message: string | Uint8Array): Promise<string> {
    const content = typeof message === 'string' ? Buffer.from(message, 'utf8') : Buffer.from(message);
    return content.toString('base64');
  }
}

export function createTestConfig(): AppConfig {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const pemDirectory = mkdtempSync(path.join(tmpdir(), 'az-validator-test-'));
  const pemPath = path.join(pemDirectory, 'caller.pem');
  writeFileSync(
    pemPath,
    publicKey.export({
      type: 'spki',
      format: 'pem',
    }),
    'utf8',
  );

  return {
    appHost: '127.0.0.1',
    appPort: 3001,
    logLevel: 'silent',
    awsRegion: 'ap-northeast-1',
    awsAccessKeyId: 'test',
    awsSecretAccessKey: 'test',
    awsSessionToken: undefined,
    validatorKeyId: 'validator-1',
    callerPemPublicKeyPath: pemPath,
    cexApiUrl: '',
    chainConfigs: [],
  };
}

export function createCallerKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const pemDirectory = mkdtempSync(path.join(tmpdir(), 'az-validator-caller-'));
  const publicKeyPath = path.join(pemDirectory, 'caller.pem');
  const publicKeyPem = publicKey.export({
    type: 'spki',
    format: 'pem',
  }).toString();
  writeFileSync(publicKeyPath, publicKeyPem, 'utf8');

  return {
    privateKeyPem: privateKey.export({
      type: 'sec1',
      format: 'pem',
    }).toString(),
    publicKeyPem,
    publicKeyPath,
  };
}

export function createSignedHeaders(data: Record<string, unknown>, privateKeyPem: string) {
  const timestamp = Date.now();
  const nonce = 'test-nonce';
  const message = buildSignedMessage(data, timestamp, nonce);
  const signer = createSign('sha256');
  signer.update(message, 'utf8');
  signer.end();

  return {
    'x-signature': signer.sign(privateKeyPem).toString('base64'),
    'x-timestamp': String(timestamp),
    'x-nonce': nonce,
  };
}
