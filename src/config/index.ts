import 'dotenv/config';

export interface AppConfig {
  appHost: string;
  appPort: number;
  logLevel: string;
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  validatorKeyId: string;
  callerPemPublicKeyPath: string;
  callerPemPublicKeySha256?: string;
  cexApiUrl: string;
  /** Existing Docker Basic Auth password, reused by Fastify admin routes. */
  adminBasicAuthPassword?: string;
  /**
   * Global relayer base URL used by the admin signing endpoint and admin
   * web proxy (e.g. http://relayer:3000). Optional — admin forwarding
   * returns 503 when unset.
   */
  relayerUrl?: string;
  chainConfigs: ChainRouteConfig[];
}

export interface ChainRouteConfig {
  chainId: number;
  rpcUrl: string;
}

const builtInRpcUrlsByChainId = new Map<number, string>([
  [
    42161,
    'https://solitary-empty-shard.arbitrum-mainnet.quiknode.pro/c3231ec35435fecf285eaa7e4b5010dc75881ec0/',
  ],
  [421614, 'https://arbitrum-sepolia-rpc.publicnode.com'],
  [11155111, 'https://ethereum-sepolia-rpc.publicnode.com'],
]);

function isHttpsUrl(value: string): boolean {
  return /^https:\/\//i.test(value);
}

function getOptionalString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return env[key]?.trim() || undefined;
}

function getRequiredString(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function validateSha256Hex(value: string, key: string): void {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${key} must be a 64-character hex string`);
  }
}

function validateUrl(value: string, field: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('protocol must be http or https');
    }
  } catch (error) {
    throw new Error(`${field} must be an http(s) URL: ${error instanceof Error ? error.message : String(error)}`);
  }

  return value;
}

function parseOptionalUrlField(item: Record<string, unknown>, index: number, key: keyof ChainRouteConfig): string | undefined {
  const value = item[key];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`CHAIN_CONFIGS[${index}].${key} must be a non-empty string`);
  }

  return validateUrl(value.trim(), `CHAIN_CONFIGS[${index}].${key}`);
}

function parseChainRouteConfigs(raw: string | undefined): ChainRouteConfig[] {
  if (!raw?.trim()) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`CHAIN_CONFIGS must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('CHAIN_CONFIGS must be a JSON array');
  }

  const seen = new Set<number>();
  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`CHAIN_CONFIGS[${index}] must be an object`);
    }

    const record = item as Record<string, unknown>;
    if (!Number.isInteger(record.chainId) || Number(record.chainId) <= 0) {
      throw new Error(`CHAIN_CONFIGS[${index}].chainId must be a positive integer`);
    }
    const chainId = Number(record.chainId);
    if (seen.has(chainId)) {
      throw new Error(`CHAIN_CONFIGS must not contain duplicate chainId ${chainId}`);
    }
    seen.add(chainId);

    const rpcUrl = parseOptionalUrlField(record, index, 'rpcUrl') ?? builtInRpcUrlsByChainId.get(chainId);
    if (!rpcUrl) {
      throw new Error(`CHAIN_CONFIGS[${index}].rpcUrl is required for custom chainId ${chainId}`);
    }

    return { chainId, rpcUrl };
  });
}

export function loadConfig(env = process.env): AppConfig {
  const callerPemPublicKeyPath = getRequiredString(env, 'CALLER_PEM_PUBLIC_KEY_PATH');
  const callerPemPublicKeySha256 = getOptionalString(env, 'CALLER_PEM_PUBLIC_KEY_SHA256');
  const awsAccessKeyId = getOptionalString(env, 'AWS_ACCESS_KEY_ID') || '';
  const awsSecretAccessKey = getOptionalString(env, 'AWS_SECRET_ACCESS_KEY') || '';
  const awsSessionToken = getOptionalString(env, 'AWS_SESSION_TOKEN');
  if (isHttpsUrl(callerPemPublicKeyPath) && !callerPemPublicKeySha256) {
    throw new Error('CALLER_PEM_PUBLIC_KEY_SHA256 is required when CALLER_PEM_PUBLIC_KEY_PATH is an HTTPS URL');
  }
  if (callerPemPublicKeySha256) {
    validateSha256Hex(callerPemPublicKeySha256, 'CALLER_PEM_PUBLIC_KEY_SHA256');
  }
  if (awsAccessKeyId && !awsSecretAccessKey) {
    throw new Error('AWS_SECRET_ACCESS_KEY is required when AWS_ACCESS_KEY_ID is set');
  }
  if (!awsAccessKeyId && awsSecretAccessKey) {
    throw new Error('AWS_ACCESS_KEY_ID is required when AWS_SECRET_ACCESS_KEY is set');
  }
  if (awsSessionToken && (!awsAccessKeyId || !awsSecretAccessKey)) {
    throw new Error('AWS_SESSION_TOKEN requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
  }

  return {
    appHost: env.APP_HOST || '127.0.0.1',
    appPort: Number(env.APP_PORT || '3001'),
    logLevel: env.LOG_LEVEL || 'info',
    awsRegion: env.AWS_REGION || 'ap-northeast-1',
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken,
    validatorKeyId: getRequiredString(env, 'KMS_KEY_ID_VALIDATOR'),
    callerPemPublicKeyPath,
    callerPemPublicKeySha256,
    cexApiUrl: getRequiredString(env, 'CEX_API_URL'),
    adminBasicAuthPassword: getOptionalString(env, 'ADMIN_BASIC_AUTH_PASSWORD'),
    relayerUrl: env.RELAYER_URL?.trim() || undefined,
    chainConfigs: parseChainRouteConfigs(env.CHAIN_CONFIGS),
  };
}
