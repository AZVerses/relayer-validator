import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, Server } from 'http';
import { buildApp } from '../src/server/app';
import { SigningService } from '../src/services/signing/service';
import { createCallerKeyPair, createSignedHeaders, createTestConfig, InMemorySignerBackend } from './helpers';
import { FastifyInstance } from 'fastify';
import { RiskCheckError } from '../src/services/risk-check';
import { loadConfig } from '../src/config';

describe('validator HTTP API', () => {
  let app: FastifyInstance;
  let callerPrivateKeyPem: string;

  beforeEach(async () => {
    const config = createTestConfig();
    const callerKeys = createCallerKeyPair();
    config.callerPemPublicKeyPath = callerKeys.publicKeyPath;
    callerPrivateKeyPem = callerKeys.privateKeyPem;
    const signingService = new SigningService(config, new InMemorySignerBackend());
    app = await buildApp({ config, signingService });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('loads an inline caller PEM when the path mode is absent', async () => {
    const config = createTestConfig();
    const callerKeys = createCallerKeyPair();
    config.callerPemPublicKey = callerKeys.publicKeyPem;
    config.callerPemPublicKeyPath = undefined;
    const signingService = new SigningService(config, new InMemorySignerBackend());
    const inlineApp = await buildApp({ config, signingService });

    await inlineApp.ready();
    await inlineApp.close();
  });

  it('rejects missing signed headers on sign endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/sign',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a leading-space content type before any signing handler runs', async () => {
    const signSpy = vi.spyOn(SigningService.prototype, 'sign');
    const response = await app.inject({
      method: 'POST',
      url: '/admin/sign-withdraw-operation',
      headers: {
        authorization: `Basic ${Buffer.from('admin:test-admin-password').toString('base64')}`,
        'content-type': ' application/json',
      },
      payload: JSON.stringify({ request: {} }),
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(signSpy).not.toHaveBeenCalled();
    signSpy.mockRestore();
  });

  it('rejects unauthenticated withdraw admin requests before signing', async () => {
    const signSpy = vi.spyOn(SigningService.prototype, 'sign');
    const response = await app.inject({
      method: 'POST',
      url: '/admin/sign-withdraw-operation',
      payload: {
        request: {
          action: 'batch-flush-withdrawals',
          withdrawalIds: ['1'],
          chainId: 42161,
          vaultAddress: '0x1111111111111111111111111111111111111111',
          nonce: '1',
        },
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Basic');
    expect(signSpy).not.toHaveBeenCalled();
    signSpy.mockRestore();
  });

  it('accepts valid Basic auth on the withdraw admin route', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/sign-withdraw-operation',
      headers: {
        authorization: `Basic ${Buffer.from('admin:test-admin-password').toString('base64')}`,
      },
      payload: {
        request: {
          action: 'batch-flush-withdrawals',
          withdrawalIds: ['1'],
          chainId: 42161,
          vaultAddress: '0x1111111111111111111111111111111111111111',
          nonce: '1',
        },
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'relayerUrl not configured for chain 42161' });
  });

  it('rejects request-withdraw on the admin route before signing', async () => {
    const signSpy = vi.spyOn(SigningService.prototype, 'sign');
    const response = await app.inject({
      method: 'POST',
      url: '/admin/sign-withdraw-operation',
      headers: {
        authorization: `Basic ${Buffer.from('admin:test-admin-password').toString('base64')}`,
      },
      payload: {
        request: {
          action: 'request-withdraw',
          withdrawalId: '1',
          tokenAddress: '0x1111111111111111111111111111111111111111',
          amount: '10',
          fee: '1',
          receiver: '0x2222222222222222222222222222222222222222',
          isForcePending: false,
          chainId: 42161,
          vaultAddress: '0x3333333333333333333333333333333333333333',
          nonce: '1',
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'action request-withdraw is not allowed on admin routes' });
    expect(signSpy).not.toHaveBeenCalled();
    signSpy.mockRestore();
  });

  it('rejects unauthenticated rebalance reject requests before signing', async () => {
    const signSpy = vi.spyOn(SigningService.prototype, 'sign');
    const response = await app.inject({
      method: 'POST',
      url: '/admin/sign-rebalance-reject',
      payload: {
        collectionId: 1,
        chainId: 42161,
        vaultAddress: '0x1111111111111111111111111111111111111111',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toContain('Basic');
    expect(signSpy).not.toHaveBeenCalled();
    signSpy.mockRestore();
  });

  it('returns signed payload for rebalanceWithdraw', async () => {
    const payload = {
      action: 'rebalance-withdraw',
      tokenAddress: '0x1111111111111111111111111111111111111111',
      amount: '10',
      receiver: '0x3333333333333333333333333333333333333333',
      chainId: 11155111,
      vaultAddress: '0x2222222222222222222222222222222222222222',
      nonce: '12',
    };
    const response = await app.inject({
      method: 'POST',
      url: '/sign',
      headers: createSignedHeaders(payload, callerPrivateKeyPem),
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.validatorAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(body.signature).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(body.action).toBe('rebalance-withdraw');
  });

  it('loads the validator KMS address during startup', async () => {
    await app.close();
    const config = createTestConfig();
    const backend = new InMemorySignerBackend();
    const getValidatorAddress = vi.spyOn(backend, 'getValidatorAddress');

    app = await buildApp({
      config,
      signingService: new SigningService(config, backend),
    });
    await app.ready();

    expect(getValidatorAddress).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid caller signature', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/sign',
      headers: {
        'x-signature': 'invalid',
        'x-timestamp': String(Date.now()),
        'x-nonce': 'test-nonce',
      },
      payload: {
        action: 'rebalance-withdraw',
        tokenAddress: '0x1111111111111111111111111111111111111111',
        amount: '10',
        receiver: '0x3333333333333333333333333333333333333333',
        chainId: 11155111,
        vaultAddress: '0x2222222222222222222222222222222222222222',
        nonce: '12',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 when risk check fails', async () => {
    const payload = {
      action: 'rebalance-withdraw',
      tokenAddress: '0x1111111111111111111111111111111111111111',
      amount: '10',
      receiver: '0x3333333333333333333333333333333333333333',
      chainId: 11155111,
      vaultAddress: '0x2222222222222222222222222222222222222222',
      nonce: '12',
    };
    const headers = createSignedHeaders(payload, callerPrivateKeyPem);
    const signSpy = vi.spyOn(SigningService.prototype, 'sign').mockRejectedValueOnce(
      new RiskCheckError('Risk check failed: cex timeout'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/sign',
      headers,
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'Risk check rejected request',
    });

    signSpy.mockRestore();
  });

  it('does not return an unhandled internal error message to the caller', async () => {
    const payload = {
      action: 'rebalance-withdraw',
      tokenAddress: '0x1111111111111111111111111111111111111111',
      amount: '10',
      receiver: '0x3333333333333333333333333333333333333333',
      chainId: 11155111,
      vaultAddress: '0x2222222222222222222222222222222222222222',
      nonce: '12',
    };
    const signSpy = vi.spyOn(SigningService.prototype, 'sign').mockRejectedValueOnce(
      new Error('sensitive kms key arn and stack'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/sign',
      headers: createSignedHeaders(payload, callerPrivateKeyPem),
      payload,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'Internal server error' });
    expect(response.body).not.toContain('sensitive kms');
    signSpy.mockRestore();
  });

  it('does not return an upstream connection error message to the caller', async () => {
    await app.close();
    const config = createTestConfig();
    const callerKeys = createCallerKeyPair();
    config.callerPemPublicKeyPath = callerKeys.publicKeyPath;
    config.chainConfigs = [{
      chainId: 42161,
      rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
      relayerUrl: 'http://127.0.0.1:1',
    }];
    app = await buildApp({
      config,
      signingService: new SigningService(config, new InMemorySignerBackend()),
    });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/chain/42161/api/public/withdraws',
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: 'Upstream request failed' });
    expect(response.body).not.toContain('127.0.0.1');
  });

  it('proxies relayer and RPC requests by chainId', async () => {
    await app.close();
    const relayerA = await createJsonServer({ relayer: 'a' });
    const relayerB = await createJsonServer({ relayer: 'b' });
    const rpcA = await createJsonServer({ rpc: 'a' });
    const rpcB = await createJsonServer({ rpc: 'b' });
    try {
      const config = createTestConfig();
      const callerKeys = createCallerKeyPair();
      config.callerPemPublicKeyPath = callerKeys.publicKeyPath;
      config.chainConfigs = [
        {
          chainId: 42161,
          rpcUrl: rpcA.url,
          relayerUrl: relayerA.url,
        },
        {
          chainId: 421614,
          rpcUrl: rpcB.url,
          relayerUrl: relayerB.url,
        },
      ];
      app = await buildApp({
        config,
        signingService: new SigningService(config, new InMemorySignerBackend()),
      });
      await app.ready();

      const relayerResponse = await app.inject({
        method: 'GET',
        url: '/api/chain/421614/api/public/withdraws?x=1',
        headers: { authorization: 'Basic must-not-reach-relayer' },
      });
      expect(relayerResponse.statusCode).toBe(200);
      expect(relayerResponse.json()).toMatchObject({
        relayer: 'b',
        method: 'GET',
        url: '/api/public/withdraws?x=1',
        authorization: null,
      });

      const disallowedPathResponse = await app.inject({
        method: 'GET',
        url: '/api/chain/421614/api/admin/auth/me',
      });
      expect(disallowedPathResponse.statusCode).toBe(404);

      const disallowedMethodResponse = await app.inject({
        method: 'POST',
        url: '/api/chain/421614/api/public/withdraws',
        payload: {},
      });
      expect(disallowedMethodResponse.statusCode).toBe(404);

      const traversalResponse = await app.inject({
        method: 'GET',
        url: '/api/chain/421614/api/public/%2e%2e/withdraws',
      });
      expect(traversalResponse.statusCode).toBe(404);

      const rpcResponse = await app.inject({
        method: 'POST',
        url: '/rpc/chain/42161',
        payload: { jsonrpc: '2.0', method: 'eth_chainId', id: 1 },
      });
      expect(rpcResponse.statusCode).toBe(200);
      expect(rpcResponse.json()).toMatchObject({
        rpc: 'a',
        method: 'POST',
      });
    } finally {
      await Promise.all([
        closeServer(relayerA.server),
        closeServer(relayerB.server),
        closeServer(rpcA.server),
        closeServer(rpcB.server),
      ]);
    }
  });

  it('accepts Arbitrum One config when rpcUrl is omitted', async () => {
    const callerKeys = createCallerKeyPair();
    const config = loadConfig({
      KMS_KEY_ID_VALIDATOR: 'validator-key',
      CALLER_PEM_PUBLIC_KEY_PATH: callerKeys.publicKeyPath,
      CEX_API_URL: 'https://cex.example.com',
      ADMIN_BASIC_AUTH_PASSWORD: 'test-admin-password',
      CHAIN_CONFIGS: JSON.stringify([{ chainId: 42161 }]),
    });

    expect(config.chainConfigs).toEqual([
      {
        chainId: 42161,
        rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
      },
    ]);
  });

  it('rejects custom chain RPC proxy at config load when rpcUrl is omitted', () => {
    expect(() => loadConfig({
      KMS_KEY_ID_VALIDATOR: 'validator-key',
      CALLER_PEM_PUBLIC_KEY_PATH: 'resources/relayer.pem',
      CEX_API_URL: 'https://cex.example.com',
      CHAIN_CONFIGS: JSON.stringify([{ chainId: 999999 }]),
    })).toThrow('CHAIN_CONFIGS[0].rpcUrl is required for chainId 999999');
  });
});

async function createJsonServer(extra: Record<string, unknown>): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        ...extra,
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization ?? null,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('test server did not bind to a TCP port');
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}
