import { ethers } from 'ethers';
import {
  GetPublicKeyCommand,
  KMSClient,
  MessageType,
  SignCommand,
  SigningAlgorithmSpec,
} from '@aws-sdk/client-kms';
import { AppConfig } from '../../config';

export interface ValidatorSignerBackend {
  getValidatorAddress(): Promise<string>;
  signDigest(digest: string): Promise<string>;
  signRaw(message: string | Uint8Array): Promise<string>;
}

type EcdsaRsSignature = {
  r: string;
  s: string;
};

function readDerLength(input: Buffer, offset: number): { length: number; nextOffset: number } {
  const firstByte = input[offset];
  if (firstByte === undefined) {
    throw new Error('Invalid DER signature length');
  }
  if (firstByte < 0x80) {
    return { length: firstByte, nextOffset: offset + 1 };
  }

  const lengthByteCount = firstByte & 0x7f;
  if (lengthByteCount === 0 || lengthByteCount > 4) {
    throw new Error('Invalid DER signature length');
  }
  if (offset + 1 + lengthByteCount > input.length) {
    throw new Error('Invalid DER signature length');
  }

  let length = 0;
  for (let i = 0; i < lengthByteCount; i++) {
    length = (length << 8) + input[offset + 1 + i];
  }
  return { length, nextOffset: offset + 1 + lengthByteCount };
}

function readDerInteger(input: Buffer, offset: number): { value: bigint; nextOffset: number } {
  if (input[offset] !== 0x02) {
    throw new Error('Invalid DER ECDSA signature');
  }
  const { length, nextOffset } = readDerLength(input, offset + 1);
  const valueStart = nextOffset;
  const valueEnd = valueStart + length;
  if (length === 0 || valueEnd > input.length) {
    throw new Error('Invalid DER ECDSA signature');
  }

  const valueHex = input.subarray(valueStart, valueEnd).toString('hex');
  return {
    value: BigInt(`0x${valueHex}`),
    nextOffset: valueEnd,
  };
}

function toPaddedSignatureHex(value: bigint): string {
  const hex = value.toString(16);
  if (hex.length > 64) {
    throw new Error('Invalid DER ECDSA signature');
  }
  return `0x${hex.padStart(64, '0')}`;
}

function parseKmsEcdsaSignature(signature: Uint8Array): EcdsaRsSignature {
  const input = Buffer.from(signature);
  if (input[0] !== 0x30) {
    throw new Error('Invalid DER ECDSA signature');
  }

  const { length, nextOffset } = readDerLength(input, 1);
  if (nextOffset + length !== input.length) {
    throw new Error('Invalid DER ECDSA signature');
  }

  const r = readDerInteger(input, nextOffset);
  const s = readDerInteger(input, r.nextOffset);
  if (s.nextOffset !== input.length) {
    throw new Error('Invalid DER ECDSA signature');
  }

  const secp256k1N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
  const secp256k1HalfN = secp256k1N / 2n;
  return {
    r: toPaddedSignatureHex(r.value),
    s: toPaddedSignatureHex(s.value > secp256k1HalfN ? secp256k1N - s.value : s.value),
  };
}

function extractUncompressedPublicKey(publicKey: Uint8Array | undefined, keyId: string): Buffer {
  if (!publicKey) {
    throw new Error(`KMS public key missing for ${keyId}`);
  }

  const keyBuf = Buffer.from(publicKey);
  const uncompressed = keyBuf.slice(-65);
  if (uncompressed[0] !== 0x04) {
    throw new Error(`Invalid KMS public key for ${keyId}`);
  }
  return uncompressed;
}

export class AwsKmsValidatorSignerBackend implements ValidatorSignerBackend {
  private kmsClient: KMSClient | null = null;
  private addressCache: string | null = null;

  constructor(private readonly config: AppConfig) {}

  private getKmsClient(): KMSClient {
    if (!this.kmsClient) {
      this.kmsClient = new KMSClient({
        region: this.config.awsRegion,
        credentials: this.config.awsAccessKeyId
          ? {
              accessKeyId: this.config.awsAccessKeyId,
              secretAccessKey: this.config.awsSecretAccessKey,
              sessionToken: this.config.awsSessionToken,
            }
          : undefined,
      });
    }

    return this.kmsClient;
  }

  async getValidatorAddress(): Promise<string> {
    if (this.addressCache) {
      return this.addressCache;
    }

    const client = this.getKmsClient();
    const response = await client.send(new GetPublicKeyCommand({ KeyId: this.config.validatorKeyId }));
    const uncompressed = extractUncompressedPublicKey(response.PublicKey, this.config.validatorKeyId);

    const hash = ethers.keccak256(uncompressed.slice(1));
    const address = ethers.getAddress(`0x${hash.slice(-40)}`);
    this.addressCache = address;
    return address;
  }

  async signDigest(digest: string): Promise<string> {
    const messageDigest = ethers.hashMessage(ethers.getBytes(digest));
    const response = await this.getKmsClient().send(
      new SignCommand({
        KeyId: this.config.validatorKeyId,
        Message: Buffer.from(ethers.getBytes(messageDigest)),
        MessageType: MessageType.DIGEST,
        SigningAlgorithm: SigningAlgorithmSpec.ECDSA_SHA_256,
      }),
    );

    if (!response.Signature) {
      throw new Error(`KMS digest signature missing for ${this.config.validatorKeyId}`);
    }

    const { r, s } = parseKmsEcdsaSignature(response.Signature);
    const validatorAddress = await this.getValidatorAddress();
    for (const v of [27, 28] as const) {
      const recoveredAddress = ethers.recoverAddress(messageDigest, { r, s, v });
      if (recoveredAddress.toLowerCase() === validatorAddress.toLowerCase()) {
        return ethers.Signature.from({ r, s, v }).serialized;
      }
    }

    throw new Error('Could not recover KMS validator address from signature');
  }

  async signRaw(message: string | Uint8Array): Promise<string> {
    const client = this.getKmsClient();
    const payload = typeof message === 'string' ? Buffer.from(message, 'utf8') : Buffer.from(message);
    const response = await client.send(
      new SignCommand({
        KeyId: this.config.validatorKeyId,
        Message: payload,
        MessageType: MessageType.RAW,
        SigningAlgorithm: SigningAlgorithmSpec.ECDSA_SHA_256,
      }),
    );

    if (!response.Signature) {
      throw new Error(`KMS raw signature missing for ${this.config.validatorKeyId}`);
    }

    return Buffer.from(response.Signature).toString('base64');
  }
}
