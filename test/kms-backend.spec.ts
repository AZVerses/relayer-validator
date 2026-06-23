import { Wallet, ethers } from 'ethers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppConfig } from '../src/config';

const kmsMock = vi.hoisted(() => ({
  send: vi.fn(),
  KMSClient: vi.fn(),
  GetPublicKeyCommand: vi.fn(),
  SignCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-kms', () => {
  kmsMock.KMSClient.mockImplementation((config) => ({
    config,
    send: kmsMock.send,
  }));
  kmsMock.GetPublicKeyCommand.mockImplementation((input) => ({ command: 'GetPublicKey', input }));
  kmsMock.SignCommand.mockImplementation((input) => ({ command: 'Sign', input }));

  return {
    KMSClient: kmsMock.KMSClient,
    GetPublicKeyCommand: kmsMock.GetPublicKeyCommand,
    SignCommand: kmsMock.SignCommand,
    MessageType: {
      RAW: 'RAW',
      DIGEST: 'DIGEST',
    },
    SigningAlgorithmSpec: {
      ECDSA_SHA_256: 'ECDSA_SHA_256',
    },
  };
});

import { AwsKmsValidatorSignerBackend } from '../src/services/kms/backend';

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    appHost: '127.0.0.1',
    appPort: 3001,
    logLevel: 'silent',
    awsRegion: 'ap-northeast-1',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsSessionToken: undefined,
    validatorKeyId: 'validator-key',
    callerPemPublicKeyPath: 'resources/relayer.pem',
    cexApiUrl: 'https://cex.example.com',
    chainConfigs: [],
    ...overrides,
  };
}

function encodeDerLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encodeDerInteger(hex: string): Buffer {
  let value = Buffer.from(hex.replace(/^0x/, ''), 'hex');
  while (value.length > 1 && value[0] === 0 && (value[1] & 0x80) === 0) {
    value = value.subarray(1);
  }
  if ((value[0] & 0x80) !== 0) {
    value = Buffer.concat([Buffer.from([0]), value]);
  }
  return Buffer.concat([Buffer.from([0x02]), encodeDerLength(value.length), value]);
}

function encodeDerSignature(signature: ethers.Signature): Buffer {
  const r = encodeDerInteger(signature.r);
  const s = encodeDerInteger(signature.s);
  const body = Buffer.concat([r, s]);
  return Buffer.concat([Buffer.from([0x30]), encodeDerLength(body.length), body]);
}

describe('AwsKmsValidatorSignerBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses AWS default credentials when static credentials are absent', () => {
    const backend = new AwsKmsValidatorSignerBackend(createConfig());

    (backend as any).getKmsClient();

    expect(kmsMock.KMSClient).toHaveBeenCalledWith({
      region: 'ap-northeast-1',
      credentials: undefined,
    });
  });

  it('passes explicit AWS credentials when configured', () => {
    const backend = new AwsKmsValidatorSignerBackend(createConfig({
      awsAccessKeyId: 'access-key',
      awsSecretAccessKey: 'secret-key',
      awsSessionToken: 'session-token',
    }));

    (backend as any).getKmsClient();

    expect(kmsMock.KMSClient).toHaveBeenCalledWith({
      region: 'ap-northeast-1',
      credentials: {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
        sessionToken: 'session-token',
      },
    });
  });

  it('signs validator digests with the same semantics as ethers signMessage', async () => {
    const wallet = new Wallet(`0x${String(1).padStart(64, '0')}`);
    const digest = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const messageDigest = ethers.hashMessage(ethers.getBytes(digest));
    const signature = wallet.signingKey.sign(messageDigest);
    const publicKey = Buffer.from(wallet.signingKey.publicKey.slice(2), 'hex');

    kmsMock.send.mockImplementation(async (command) => {
      if (command.command === 'GetPublicKey') {
        return { PublicKey: Buffer.concat([Buffer.from([0x30, 0]), publicKey]) };
      }
      if (command.command === 'Sign') {
        return { Signature: encodeDerSignature(signature) };
      }
      throw new Error(`Unexpected command ${command.command}`);
    });

    const backend = new AwsKmsValidatorSignerBackend(createConfig());
    const result = await backend.signDigest(digest);

    expect(result).toBe(await wallet.signMessage(ethers.getBytes(digest)));
    expect(kmsMock.SignCommand).toHaveBeenCalledWith({
      KeyId: 'validator-key',
      Message: Buffer.from(ethers.getBytes(messageDigest)),
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    });
  });
});
