import { createHash } from 'crypto';
import axios, { AxiosResponse, isAxiosError, Method } from 'axios';
import fastify, { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppConfig, ChainRouteConfig } from '../config';
import { createLogger } from '../logging';
import { SigningService } from '../services/signing/service';
import { signRequestSchema, SignRequest } from '../types/actions';
import {
  buildSignedMessage,
  readPemPublicKey,
  validateInlinePemPublicKey,
  verifySignatureWithPem,
} from '../services/http/signature';
import { RiskCheckError } from '../services/risk-check';
import {
  RelayerForwarder,
  signRebalanceRejectBodySchema,
  signWithdrawOperationBodySchema,
} from '../services/admin/relayer-forwarder';
import { createAdminAuthenticator } from './admin-auth';

function sha256Prefix(input: string, bytes = 8): string {
  return createHash('sha256').update(input).digest('hex').slice(0, bytes * 2);
}

function describeBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') {
    return { action: 'unknown' };
  }
  const b = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof b.action === 'string') out.action = b.action;
  if (typeof b.chainId === 'number') out.chainId = b.chainId;
  if (typeof b.withdrawalId === 'string') out.withdrawalId = b.withdrawalId;
  if (Array.isArray(b.withdrawalIds)) out.withdrawalIds = b.withdrawalIds;
  if (typeof b.nonce === 'string') out.nonce = b.nonce;
  return out;
}

function getChainIdFromParams(request: FastifyRequest): number {
  const value = (request.params as Record<string, unknown>).chainId;
  const chainId = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('invalid chainId');
  }
  return chainId;
}

function findChainRouteConfig(config: AppConfig, chainId: number): ChainRouteConfig | undefined {
  return config.chainConfigs.find(chain => chain.chainId === chainId);
}

function stripHopByHopHeaders(headers: Record<string, unknown>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.filter((item): item is string => typeof item === 'string');
    }
  }
  for (const key of [
    'connection',
    'authorization',
    'content-length',
    'host',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]) {
    delete out[key];
  }
  return out;
}

function copyProxyResponseHeaders(response: AxiosResponse, reply: FastifyReply): void {
  for (const [key, value] of Object.entries(response.headers)) {
    if ([
      'connection',
      'content-length',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
    ].includes(key.toLowerCase())) {
      continue;
    }
    reply.header(key, value as string | string[]);
  }
}

function joinBaseUrl(baseUrl: string, pathAndQuery: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`}`;
}

function stripChainProxyPrefix(rawUrl: string, chainId: number, prefix: 'api' | 'rpc'): string {
  const routePrefix = prefix === 'api' ? `/api/chain/${chainId}` : `/rpc/chain/${chainId}`;
  if (!rawUrl.startsWith(routePrefix)) {
    throw new Error('invalid proxy route');
  }
  const stripped = rawUrl.slice(routePrefix.length);
  return stripped || '/';
}

function isAllowedRelayerProxyRequest(method: string, pathAndQuery: string): boolean {
  if (method !== 'GET') {
    return false;
  }
  const path = pathAndQuery.split('?', 1)[0];
  return path === '/api/public/deposits'
    || path === '/api/public/withdraws'
    || path === '/api/signature-collections'
    || path === '/api/signature-collections/active'
    || /^\/api\/signature-collections\/[1-9][0-9]*$/.test(path);
}

// Same window the relayer uses on its own caller-signed endpoints
// (WITHDRAW_SIGNATURE_MAX_AGE_MS / VALIDATOR_VOTE_MAX_AGE_MS /
// VALIDATOR_ACTION_MAX_AGE_MS). Anchoring here closes the replay
// window for captured /sign requests — without it, a captured signed
// envelope is reusable forever.
const SIGN_REQUEST_MAX_AGE_MS = 5 * 60 * 1000;

export interface AppDeps {
  config: AppConfig;
  signingService: SigningService;
  relayerForwarder?: RelayerForwarder;
}

export async function buildApp({ config, signingService, relayerForwarder }: AppDeps): Promise<FastifyInstance> {
  const authenticateAdmin = createAdminAuthenticator(config.adminBasicAuthPassword ?? '');
  const logger = createLogger(config);
  const app = fastify({ logger: logger.options });
  app.addHook('onClose', () => logger.close());
  const callerPemPublicKey = config.callerPemPublicKey
    ? validateInlinePemPublicKey(config.callerPemPublicKey)
    : await readPemPublicKey(config.callerPemPublicKeyPath!, config.callerPemPublicKeySha256);
  const pemFingerprint = sha256Prefix(callerPemPublicKey, 6);
  app.log.info({ pemFingerprint }, 'caller PEM loaded');

  const validator = await signingService.getValidator();
  app.log.info({ validatorAddress: validator.address }, 'validator KMS address loaded');

  const forwardersByRelayerUrl = new Map<string, RelayerForwarder>();
  function getForwarder(chainId: number): RelayerForwarder | null {
    if (relayerForwarder) {
      return relayerForwarder;
    }
    const relayerUrl = findChainRouteConfig(config, chainId)?.relayerUrl;
    if (!relayerUrl) {
      return null;
    }
    const existing = forwardersByRelayerUrl.get(relayerUrl);
    if (existing) {
      return existing;
    }
    const forwarder = new RelayerForwarder(relayerUrl);
    forwardersByRelayerUrl.set(relayerUrl, forwarder);
    return forwarder;
  }

  async function proxyToRelayer(request: FastifyRequest, reply: FastifyReply) {
    const chainId = getChainIdFromParams(request);
    const relayerUrl = findChainRouteConfig(config, chainId)?.relayerUrl;
    if (!relayerUrl) {
      return reply.status(502).send({ error: `relayerUrl not configured for chain ${chainId}` });
    }
    const pathAndQuery = stripChainProxyPrefix(request.raw.url ?? request.url, chainId, 'api');
    if (!isAllowedRelayerProxyRequest(request.method, pathAndQuery)) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const response = await axios.request({
      url: joinBaseUrl(relayerUrl, pathAndQuery),
      method: request.method as Method,
      data: request.body,
      headers: stripHopByHopHeaders(request.headers as Record<string, unknown>),
      proxy: false,
      timeout: 60000,
      validateStatus: () => true,
    });
    copyProxyResponseHeaders(response, reply);
    return reply.status(response.status).send(response.data);
  }

  async function proxyToRpc(request: FastifyRequest, reply: FastifyReply) {
    const chainId = getChainIdFromParams(request);
    const rpcUrl = findChainRouteConfig(config, chainId)?.rpcUrl;
    if (!rpcUrl) {
      return reply.status(502).send({ error: `rpcUrl not configured for chain ${chainId}` });
    }
    const response = await axios.request({
      url: rpcUrl,
      method: request.method as Method,
      data: request.body,
      headers: stripHopByHopHeaders(request.headers as Record<string, unknown>),
      proxy: false,
      timeout: 30000,
      validateStatus: () => true,
    });
    copyProxyResponseHeaders(response, reply);
    return reply.status(response.status).send(response.data);
  }

  app.get('/health', async () => ({
    status: 'ok',
  }));

  app.get('/validator', async () => {
    const validator = await signingService.getValidator();
    return {
      validatorAddress: validator.address,
    };
  });

  app.all('/api/chain/:chainId/*', proxyToRelayer);
  app.all('/rpc/chain/:chainId', proxyToRpc);

  app.post('/sign', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = signRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      request.log.warn(
        { reason: 'body-schema', issues: parsed.error.flatten() },
        '/sign rejected: invalid body schema',
      );
      return reply.status(400).send({
        error: 'Invalid request',
        details: parsed.error.flatten(),
      });
    }

    const ctx = describeBody(parsed.data);
    const timestampHeader = request.headers['x-timestamp'];
    const signatureHeader = request.headers['x-signature'];
    const nonceHeader = request.headers['x-nonce'];

    if (typeof timestampHeader !== 'string' || typeof signatureHeader !== 'string' || typeof nonceHeader !== 'string') {
      request.log.warn(
        {
          reason: 'missing-signed-headers',
          ...ctx,
          has_signature: typeof signatureHeader === 'string',
          has_timestamp: typeof timestampHeader === 'string',
          has_nonce: typeof nonceHeader === 'string',
        },
        '/sign rejected: missing signed headers',
      );
      return reply.status(400).send({
        error: 'missing signed headers',
      });
    }

    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) {
      request.log.warn(
        { reason: 'non-finite-timestamp', ...ctx, x_timestamp: timestampHeader },
        '/sign rejected: non-finite timestamp',
      );
      return reply.status(400).send({
        error: 'invalid x-timestamp',
      });
    }
    const now = Date.now();
    const driftMs = now - timestamp;
    if (Math.abs(driftMs) > SIGN_REQUEST_MAX_AGE_MS) {
      request.log.warn(
        {
          reason: 'stale-timestamp',
          ...ctx,
          timestamp_iso: new Date(timestamp).toISOString(),
          now_iso: new Date(now).toISOString(),
          drift_ms: driftMs,
          max_age_ms: SIGN_REQUEST_MAX_AGE_MS,
        },
        `/sign rejected: timestamp drift ${driftMs}ms exceeds ${SIGN_REQUEST_MAX_AGE_MS}ms`,
      );
      return reply.status(400).send({
        error: 'stale x-timestamp',
      });
    }

    const message = buildSignedMessage(parsed.data as Record<string, unknown>, timestamp, nonceHeader);
    const verified = verifySignatureWithPem(message, signatureHeader, callerPemPublicKey);
    if (!verified) {
      request.log.warn(
        {
          reason: 'signature-mismatch',
          ...ctx,
          signed_msg_len: message.length,
          signed_msg_sha256: sha256Prefix(message, 8),
          signature_len: signatureHeader.length,
          signature_prefix: signatureHeader.slice(0, 16),
          nonce: nonceHeader,
          timestamp_iso: new Date(timestamp).toISOString(),
          pem_fingerprint: pemFingerprint,
        },
        '/sign rejected: signature does not verify against caller PEM',
      );
      return reply.status(401).send({
        error: 'signature verification failed',
      });
    }

    request.log.info(
      { ...ctx, timestamp_iso: new Date(timestamp).toISOString() },
      '/sign accepted; producing signature',
    );
    const result = await signingService.sign(parsed.data);
    return reply.send(result);
  });

  app.post('/admin/sign-withdraw-operation', { preHandler: authenticateAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const envelope = signWithdrawOperationBodySchema.safeParse(request.body);
    if (!envelope.success) {
      return reply.status(400).send({ error: 'Invalid request', details: envelope.error.flatten() });
    }

    const parsed = signRequestSchema.safeParse(envelope.data.request);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body', details: parsed.error.flatten() });
    }
    if (![
      'batch-flush-withdrawals',
      'batch-toggle-pending-withdrawal',
      'execute-pending-withdrawal',
      'batch-reset-withdraw-hot-amount',
      'rebalance-withdraw',
    ].includes(parsed.data.action)) {
      return reply.status(400).send({ error: `action ${parsed.data.action} is not allowed on admin routes` });
    }

    const signRequest = parsed.data as Exclude<SignRequest, { action: 'reject-rebalance-collection' }>;
    const forwarder = getForwarder(signRequest.chainId);
    if (!forwarder) {
      return reply.status(503).send({ error: `relayerUrl not configured for chain ${signRequest.chainId}` });
    }
    const collectionId = envelope.data.collectionId;
    if (collectionId !== undefined && signRequest.action !== 'rebalance-withdraw') {
      return reply.status(400).send({ error: 'collectionId is only valid for rebalance-withdraw requests' });
    }

    const signed = await signingService.sign(signRequest);
    const timestamp = Date.now();

    let result;
    if (signRequest.action !== 'rebalance-withdraw') {
      result = await forwarder.submitValidatorAction(signed, signRequest, timestamp);
    } else if (collectionId === undefined) {
      result = await forwarder.submitRebalanceCreate(signed, signRequest, timestamp);
    } else {
      result = await forwarder.submitRebalanceCollect(collectionId, signed, timestamp);
    }

    return reply.status(result.status).send(result.data);
  });

  app.post('/admin/sign-rebalance-reject', { preHandler: authenticateAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const envelope = signRebalanceRejectBodySchema.safeParse(request.body);
    if (!envelope.success) {
      return reply.status(400).send({ error: 'Invalid request', details: envelope.error.flatten() });
    }
    const forwarder = getForwarder(envelope.data.chainId);
    if (!forwarder) {
      return reply.status(503).send({ error: `relayerUrl not configured for chain ${envelope.data.chainId}` });
    }

    const signed = await signingService.sign({
      action: 'reject-rebalance-collection',
      chainId: envelope.data.chainId,
      vaultAddress: envelope.data.vaultAddress,
      collectionId: String(envelope.data.collectionId),
    });

    const timestamp = Date.now();
    const result = await forwarder.submitRebalanceReject(envelope.data.collectionId, signed, timestamp);
    return reply.status(result.status).send(result.data);
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof RiskCheckError) {
      request.log.warn(
        { reason: 'risk-check-denied', ...describeBody(request.body), err: error },
        `request rejected by risk check: ${error.message}`,
      );
      void reply.status(400).send({ error: 'Risk check rejected request' });
      return;
    }

    if (isAxiosError(error)) {
      request.log.error(
        { reason: 'proxy-error', err: error },
        'proxied request failed',
      );
      void reply.status(502).send({
        error: 'Upstream request failed',
      });
      return;
    }

    request.log.error(
      { reason: 'unhandled-error', ...describeBody(request.body), err: error },
      'request failed with unhandled error',
    );
    void reply.status(500).send({
      error: 'Internal server error',
    });
  });

  return app;
}
