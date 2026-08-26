# Configuration Reference

Every environment variable the validator container reads, what it does, what the legal values look like, and where in the codebase enforces it.

## Validator service (fastify)

Read by `src/config/index.ts:loadConfig`. Missing required values cause the process to throw at startup.

| Variable | Required | Default | Used for |
|---|---|---|---|
| `APP_HOST` | optional | `127.0.0.1` | fastify bind host. Docker entrypoint pins this to `127.0.0.1` so only nginx talks to fastify. |
| `APP_PORT` | optional | `3001` | **Externally exposed** unprivileged port in single-image mode (must be >= 1024; nginx listens here). The internal fastify uses `INTERNAL_VALIDATOR_PORT` (default `3010`, also >= 1024). |
| `LOG_LEVEL` | optional | `info` | pino level (`trace` / `debug` / `info` / `warn` / `error`). |
| `AWS_REGION` | optional | `ap-northeast-1` | KMS region. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | optional | none | If unset, the AWS SDK falls back to IAM role / instance profile / SSO. Set explicitly only when running outside an AWS-trusted environment. |
| `AWS_SESSION_TOKEN` | optional | none | Required when using temporary credentials. |
| `KMS_KEY_ID_VALIDATOR` | **required** | — | KMS key the validator signs digests with. UUID-style key id, not the alias. |
| `CALLER_PEM_PUBLIC_KEY` | exactly one PEM source | none | Complete inline relayer public PEM. Mutually exclusive with path and pin. |
| `CALLER_PEM_PUBLIC_KEY_PATH` | exactly one PEM source | none | Path on disk **or** `https://` URL of the relayer's PEM public key. |
| `CALLER_PEM_PUBLIC_KEY_SHA256` | required for HTTPS PEM URLs | none | 64-character SHA-256 hex digest of the normalized relayer PEM content. Local files may also be pinned with this value. |
| `CEX_API_URL` | **required** | — | Base URL of the CEX risk service. `/sign` will call `${CEX_API_URL}/az/api/relayer/withdraw/verify?requestId=<id>` and refuse to sign if the response is `{"code":0,"data":false}` or anything other than `{"code":0,"data":true}`. |
| `RELAYER_URL` | legacy fallback | none | Used only for a `CHAIN_CONFIGS` item without `relayerUrl`. Prefer per-chain routing. |

## Docker single-image deploy (nginx + entrypoint)

Used only by `docker/entrypoint.sh` and `docker/nginx.conf.template`. Irrelevant when running `npm run dev` outside Docker.

| Variable | Required | Default | Used for |
|---|---|---|---|
| `ADMIN_BASIC_AUTH_PASSWORD` | **required when serving HTTP** | — | Single shared password protecting the admin SPA root and `/admin/*` endpoints (username hardcoded `admin`). Both nginx and Fastify enforce it; `npm run dev` also fails during app construction if unset. |
| `INTERNAL_VALIDATOR_PORT` | optional | `3010` | Loopback-only port fastify binds inside the container; nginx is the only thing that talks to it. Rarely needs override. |

The final image runs as the non-root `node` user. Build time grants that user write access only
to the Nginx runtime/config directories and generated SPA config location. The entrypoint writes
`/etc/nginx/.htpasswd` with mode `600`; Nginx master and workers share the same unprivileged user.

## Admin SPA — `CHAIN_CONFIGS`

`CHAIN_CONFIGS` is a JSON-encoded array consumed by the admin web at
startup. It carries only deployment-specific fields; the SPA merges it
with the built-in chain registry in `web/src/config/chain-registry.ts`.
Schema lives at `web/src/types/chain.ts:ChainConfigOverride`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `chainId` | number | yes | EVM chain id. Must exist in the built-in registry. Used to namespace the SPA's same-origin relayer and RPC proxy paths (`/api/chain/{chainId}/*`, `/rpc/chain/{chainId}`). Validator calls use direct same-origin `/validator` and `/admin/*` paths. |
| `graphUrl` | string | yes | Token and validator-set Graph URL. `""` selects relayer fallbacks; deposit/withdrawal history always uses relayer public APIs. |
| `vaultAddress` | string | yes | Deployed Vault contract used for live basics, token metadata context, and write payload validation. |
| `rpcUrl` | HTTP(S) URL | required only for custom chain ids | `/rpc/chain/{chainId}` upstream. Built-in chains use publicnode when omitted; production should set a managed archive-capable RPC explicitly. |
| `relayerUrl` | HTTP(S) URL | required unless legacy `RELAYER_URL` is set | Per-chain read proxy and Admin write-forward target. |
| `name`, `explorerUrl` | string | required only for custom chain ids | Optional built-in metadata overrides; both plus `rpcUrl` and `relayerUrl` are required for a custom chain. |

Concrete example for Arbitrum One:

```json
[
  {
    "chainId": 42161,
    "vaultAddress": "0x949556cb8634F9a4a8504665C3d0D9d326c600b2",
    "graphUrl": "",
    "rpcUrl": "https://your-arbitrum-rpc.example",
    "relayerUrl": "http://arbitrum-relayer:3000"
  }
]
```

Notes:
- Production single-image deploys read this through `docker/config.js.template` at container start and inject it into `window.__APP_CONFIG__.CHAIN_CONFIGS`. The SPA merges that runtime config in `web/src/config/chains.ts:getChains`.
- The validator service parses the same payload for per-chain `rpcUrl` and `relayerUrl`. It
  forwards `/admin/sign-*` and `/api/chain/{chainId}/*` to that chain's relayer and proxies
  `/rpc/chain/{chainId}` to its RPC. Legacy `RELAYER_URL` fills missing per-chain relayer URLs.
- Unknown `CHAIN_CONFIGS` fields fail both validator and Admin Web parsing so misspelled routing
  fields cannot silently fall back to another endpoint.
- A payload may also contain relayer-only `rpcUrls`, `startBlock`, and `scanBlockBatchSize` fields.
  Validator/Admin Web recognize but ignore them; set `rpcUrl` when their proxy must use an
  endpoint different from the built-in RPC.
- For local `npm run dev` in `web/`, set `CHAIN_CONFIGS` in `web/.env.local` or `web/.env.development`.
- If neither `window.__APP_CONFIG__.CHAIN_CONFIGS` nor `CHAIN_CONFIGS` is set, the SPA throws at startup instead of silently using a hard-coded vault address.
- Validator and Admin Web do not scan historical chain events and do not consume `startBlock`.
  The field is accepted only so deployments can share one `CHAIN_CONFIGS` payload with the
  relayer, which owns chain-log ingestion and its scan starting block.

## Reference: how the env vars flow into the running container

```
.env / docker compose env
   │
   ▼
docker/entrypoint.sh
   ├─ envsubst → /etc/nginx/http.d/default.conf       (APP_PORT, INTERNAL_VALIDATOR_PORT)
   ├─ envsubst → /usr/share/nginx/html/config.js      (CHAIN_CONFIGS)
   ├─ htpasswd  → /etc/nginx/.htpasswd                 (ADMIN_BASIC_AUTH_PASSWORD)
   └─ exec node dist/cli/index.js serve                (AWS_*, KMS_KEY_ID_VALIDATOR,
                                                        CALLER_PEM_PUBLIC_KEY_PATH,
                                                        CALLER_PEM_PUBLIC_KEY_SHA256,
                                                        CEX_API_URL, RELAYER_URL (legacy),
                                                        CHAIN_CONFIGS,
                                                        LOG_LEVEL, APP_HOST,
                                                        INTERNAL_VALIDATOR_PORT)
```
