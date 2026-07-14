# Configuration Reference

Every environment variable the validator container reads, what it does, what the legal values look like, and where in the codebase enforces it.

## Validator service (fastify)

Read by `src/config/index.ts:loadConfig`. Missing required values cause the process to throw at startup.

| Variable | Required | Default | Used for |
|---|---|---|---|
| `APP_HOST` | optional | `127.0.0.1` | fastify bind host. Docker entrypoint pins this to `127.0.0.1` so only nginx talks to fastify. |
| `APP_PORT` | optional | `3001` | **Externally exposed** port in single-image mode (nginx listens here). The internal fastify uses `INTERNAL_VALIDATOR_PORT` (set by entrypoint, default `3010`). |
| `LOG_LEVEL` | optional | `info` | pino level (`trace` / `debug` / `info` / `warn` / `error`). |
| `AWS_REGION` | optional | `ap-northeast-1` | KMS region. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | optional | none | If unset, the AWS SDK falls back to IAM role / instance profile / SSO. Set explicitly only when running outside an AWS-trusted environment. |
| `AWS_SESSION_TOKEN` | optional | none | Required when using temporary credentials. |
| `KMS_KEY_ID_VALIDATOR` | **required** | — | KMS key the validator signs digests with. UUID-style key id, not the alias. |
| `CALLER_PEM_PUBLIC_KEY_PATH` | **required** | — | Path on disk **or** `https://` URL of the relayer's PEM public key. The validator uses this to verify the `x-signature` header on every `/sign` request. |
| `CALLER_PEM_PUBLIC_KEY_SHA256` | required for HTTPS PEM URLs | none | 64-character SHA-256 hex digest of the normalized relayer PEM content. Local files may also be pinned with this value. |
| `CEX_API_URL` | **required** | — | Base URL of the CEX risk service. `/sign` will call `${CEX_API_URL}/az/api/relayer/withdraw/verify?requestId=<id>` and refuse to sign if the response is `{"code":0,"data":false}` or anything other than `{"code":0,"data":true}`. |
| `RELAYER_URL` | required for `/admin/*` and `/api/chain/*` proxy | none | Global relayer base URL. Browser proxying is limited to the Basic-authenticated read-only route allowlist used by the SPA; admin writes use server-side forwarders. |

## Docker single-image deploy (nginx + entrypoint)

Used only by `docker/entrypoint.sh` and `docker/nginx.conf.template`. Irrelevant when running `npm run dev` outside Docker.

| Variable | Required | Default | Used for |
|---|---|---|---|
| `ADMIN_BASIC_AUTH_PASSWORD` | **required when serving HTTP** | — | Single shared password protecting the admin SPA root and `/admin/*` endpoints (username hardcoded `admin`). Both nginx and Fastify enforce it; the server fails to start if unset. |
| `INTERNAL_VALIDATOR_PORT` | optional | `3010` | Loopback-only port fastify binds inside the container; nginx is the only thing that talks to it. Rarely needs override. |

The entrypoint writes `/etc/nginx/.htpasswd` for basic auth and sets it
to `root:<nginx-worker-user>` with mode `640`. Do not tighten it to
`600`: Alpine nginx workers do not run as root, so they must be able to
read the file or valid logins return nginx `500`.

## Admin SPA — `CHAIN_CONFIGS`

`CHAIN_CONFIGS` is a JSON-encoded array consumed by the admin web at
startup. It carries only deployment-specific fields; the SPA merges it
with the built-in chain registry in `web/src/config/chain-registry.ts`.
Schema lives at `web/src/types/chain.ts:ChainConfigOverride`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `chainId` | number | yes | EVM chain id. Must exist in the built-in registry. Used to namespace the SPA's same-origin relayer and RPC proxy paths (`/api/chain/{chainId}/*`, `/rpc/chain/{chainId}`). Validator calls use direct same-origin `/validator` and `/admin/*` paths. |
| `graphUrl` | string | yes | Subgraph / indexer URL the admin web queries for vault history. Pass `""` to disable history views. |
| `vaultAddress` | string | yes | The deployed vault contract on this chain. The SPA fetches on-chain state (withdrawals, paused flags, validator set) by calling this address. |
| `rpcUrl` | string | required for Arbitrum One and custom chain ids | RPC URL for this chain. `/rpc/chain/{chainId}` routes here. Testnet built-ins may use public defaults; production mainnet has no credential-bearing source fallback. |
| `name`, `explorerUrl`, `startBlock` | string / number | required only for custom chain ids | Optional overrides for built-in chains. Full metadata is required when adding a chain id not in the built-in registry. |

Concrete example for Arbitrum One:

```json
[
  {
    "chainId": 42161,
    "vaultAddress": "0x949556cb8634F9a4a8504665C3d0D9d326c600b2",
    "graphUrl": "",
    "rpcUrl": "https://your-arbitrum-rpc.example"
  }
]
```

Notes:
- Production single-image deploys read this through `docker/config.js.template` at container start and inject it into `window.__APP_CONFIG__.CHAIN_CONFIGS`. The SPA merges that runtime config in `web/src/config/chains.ts:getChains`.
- The validator service also parses `CHAIN_CONFIGS` for per-chain `rpcUrl`. It forwards
  `/admin/sign-*` and `/api/chain/{chainId}/*` to the global `RELAYER_URL`; it proxies
  `/rpc/chain/{chainId}` to that chain's configured `rpcUrl`. Arbitrum One requires an
  explicit value; testnet built-ins may use public fallbacks.
- For local `npm run dev` in `web/`, set `CHAIN_CONFIGS` in `web/.env.local` or `web/.env.development`.
- If neither `window.__APP_CONFIG__.CHAIN_CONFIGS` nor `CHAIN_CONFIGS` is set, the SPA throws at startup instead of silently using a hard-coded vault address.
- Built-in chain metadata such as RPC proxy defaults, explorer URL, and
  event scan `startBlock` stays in `web/src/config/chain-registry.ts`.
  Arbitrum One role-event reads start at block `476067900`, not block
  `0`, to avoid oversized mainnet RPC log scans.

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
                                                        CEX_API_URL, RELAYER_URL,
                                                        CHAIN_CONFIGS,
                                                        LOG_LEVEL, APP_HOST,
                                                        INTERNAL_VALIDATOR_PORT)
```
