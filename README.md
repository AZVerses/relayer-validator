# az-validator

External signer service used by `az-vault-relayer` for withdraw-related vault actions. Ships together with the admin web SPA in a single container that serves both on one port.

## What it does

- Validates incoming signing requests from the relayer and the admin web.
- Runs the configured risk-check hook.
- Builds the canonical vault digest and signs it with the validator's AWS KMS key.
- Returns the validator address, signature, and digest. Never submits on-chain.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`  | `/health` | Liveness. |
| `GET`  | `/validator` | Returns `{ validatorAddress }`. |
| `POST` | `/sign` | Sign a relayer-issued vault action. Caller must include `x-signature`, `x-timestamp`, `x-nonce` headers. |
| `POST` | `/admin/sign-withdraw-operation` | Sign + forward a validator-initiated action to the global relayer. Returns 503 if `RELAYER_URL` is not set. |
| `POST` | `/admin/sign-rebalance-reject` | Sign + forward a rebalance reject to the global relayer. Returns 503 if `RELAYER_URL` is not set. |

Supported `/sign` actions: `request-withdraw`, `batch-flush-withdrawals`, `batch-toggle-pending-withdrawal`, `execute-pending-withdrawal`, `batch-reset-withdraw-hot-amount`, `rebalance-withdraw`, `reject-rebalance-collection`.

Failure codes: `400` on bad input or risk-check denial, `401` on bad caller signature, `500` on internal error.

## Configuration

Full reference (every variable, every field of every JSON env, where in
the codebase enforces it) lives at
[`docs/tech/configuration.md`](docs/tech/configuration.md). The table
below is just enough to get the container booting:

| Variable | Required | Notes |
| --- | --- | --- |
| `KMS_KEY_ID_VALIDATOR` | yes | KMS key the validator signs with. |
| `CALLER_PEM_PUBLIC_KEY_PATH` | yes | Path on disk or `https://` URL of the relayer's PEM public key. |
| `CALLER_PEM_PUBLIC_KEY_SHA256` | required for HTTPS PEM URLs | SHA-256 hex digest of the normalized relayer PEM content. Optional but recommended for local files. |
| `CEX_API_URL` | yes | CEX risk service base URL; `/sign` hits `${CEX_API_URL}/az/api/relayer/withdraw/verify?requestId=<id>`. |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | yes when not on AWS infra | KMS credentials. Drop the access keys if running on an EC2/EKS/Fargate role. |
| `RELAYER_URL` | yes for `/admin/*` and SPA relayer proxy | Global relayer base URL including scheme and port. |
| `ADMIN_BASIC_AUTH_PASSWORD` | yes in Docker | Password gating the admin SPA + `/admin/*`. Username is hardcoded `admin`. |
| `CHAIN_CONFIGS` | yes | JSON array of per-chain `{ chainId, vaultAddress, graphUrl, rpcUrl }` overrides. `rpcUrl` is per-chain and optional for built-in chain ids; relayer and validator service URLs are global. |

## Run with Docker (recommended)

The image bundles the validator API and the admin web. nginx fronts a loopback-only fastify process; the SPA, API, and the relayer/RPC proxies all share `APP_PORT`.

```bash
docker build -t az-validator .
docker run --rm \
  -p 3001:3001 \
  --env-file .env \
  -v $(pwd)/resources/relayer.pem:/app/resources/relayer.pem:ro \
  az-validator
```

Open `http://<host>:3001/` for the admin web. The relayer reaches the validator at the same host as `/sign`.

Mount the relayer's PEM at `CALLER_PEM_PUBLIC_KEY_PATH`. If `CALLER_PEM_PUBLIC_KEY_PATH` is an `https://` URL, the mount is not needed, but `CALLER_PEM_PUBLIC_KEY_SHA256` is required.

Minimal `.env` — copy `.env.example` and fill in:

```bash
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
KMS_KEY_ID_VALIDATOR=...
CALLER_PEM_PUBLIC_KEY_PATH=resources/relayer.pem
CALLER_PEM_PUBLIC_KEY_SHA256=
CEX_API_URL=https://cex.example.com
RELAYER_URL=http://relayer:3000
ADMIN_BASIC_AUTH_PASSWORD=replace-with-a-real-password
CHAIN_CONFIGS=[{"chainId":42161,"vaultAddress":"0x949556cb8634F9a4a8504665C3d0D9d326c600b2","graphUrl":"","rpcUrl":"https://solitary-empty-shard.arbitrum-mainnet.quiknode.pro/c3231ec35435fecf285eaa7e4b5010dc75881ec0/"}]
```

## Run locally (no Docker)

The repo ships a single CLI binary called `az-validator`. It has two
top-level subcommands — **`serve`** runs the fastify signing service,
**`sign`** runs a one-shot signing operation against KMS without
booting the server. Everything described below is the same binary.

### Validator service (HTTP)

```bash
npm install
npm run dev          # listens on http://localhost:3001
```

`npm run dev` is just `tsx src/cli/index.ts serve --host 0.0.0.0 --port 3001`
— so this starts the `serve` subcommand only. It does **not** start
the admin SPA dev server. The CLI itself is also not installed
globally by `npm install`; it's exposed via the local `node_modules/.bin`.

### Admin SPA (separate process)

```bash
cd web
npm install
npm run dev          # listens on http://localhost:5173
```

The SPA dev server proxies `/api/chain/*`, `/rpc/chain/*`, and the exact
validator paths `/validator` and `/admin/*` to the URLs from the built-in
chain registry merged with `CHAIN_CONFIGS`. The
validator service must already be running for write operations to
work end-to-end.

## CLI

### Installing the `az-validator` command

`npm install` only puts the CLI in `node_modules/.bin/az-validator`,
which is on `$PATH` while you're inside the repo. Three ways to
invoke it depending on context:

| Scenario | How |
|---|---|
| One-off run inside the repo | `npx az-validator <args>` |
| Repeatedly run from anywhere on your machine | `npm run build && npm link` — this symlinks the built `dist/cli/index.js` as a global `az-validator` |
| In CI / Docker / a script | `node dist/cli/index.js <args>` after a `npm run build` |
| TypeScript source (no build) | `npx tsx src/cli/index.ts <args>` (same as `npm run dev` for `serve`) |

`npm link` is reversible with `npm unlink -g az-validator`. The Docker
image bakes the built binary at `/app/dist/cli/index.js` and the
entrypoint invokes it directly, so the install step is irrelevant in
production.

### `az-validator serve`

Starts the HTTP signing service. CLI flags override the equivalent
env vars; if neither is set the defaults from
[`docs/tech/configuration.md`](docs/tech/configuration.md) apply.

```bash
az-validator serve [--host <host>] [--port <port>] [--log-level <level>]
```

| Flag | Env equivalent | Default |
|---|---|---|
| `--host` | `APP_HOST` | `127.0.0.1` (Docker entrypoint pins this to `127.0.0.1` so only nginx reaches fastify) |
| `--port` | `APP_PORT` | `3001` |
| `--log-level` | `LOG_LEVEL` | `info` |

### `az-validator sign <action> ...`

Builds the canonical digest for one action, signs it with KMS, and
prints the resulting `{action, chainId, vaultAddress, digest,
validatorAddress, signature, signedAt, riskCheck}` JSON to stdout.
Useful for offline replay testing, debugging digest mismatches, and
scripted operator flows. **All `sign` subcommands hit AWS KMS and the
configured CEX `/verify`** — they're not pure-local.

Required env (also enforced by `loadConfig`): `KMS_KEY_ID_VALIDATOR`,
`CALLER_PEM_PUBLIC_KEY_PATH`, `CEX_API_URL`, plus AWS creds. Set
`CALLER_PEM_PUBLIC_KEY_SHA256` when `CALLER_PEM_PUBLIC_KEY_PATH` is an
`https://` URL. The CLI doesn't accept `--key-id` etc.; configure via env.

#### Action: `request-withdraw`

```bash
az-validator sign request-withdraw \
  <withdrawalId> <tokenAddress> <amount> <fee> <receiver> \
  <isForcePending> <chainId> <vaultAddress> <nonce>
```

| Arg | Type | Meaning |
|---|---|---|
| `withdrawalId` | decimal string | Unique id of the withdraw on the vault. |
| `tokenAddress` | `0x…` (20 bytes) | ERC20 contract; `0x00…00` for native ETH. |
| `amount` | decimal string (wei) | Amount to withdraw. No decimal point. |
| `fee` | decimal string (wei) | Fee deducted from the withdraw. |
| `receiver` | `0x…` | Address that gets the funds. |
| `isForcePending` | `true` / `false` | `true` forces the slow-path (challenge period); `false` is the normal hot-path. |
| `chainId` | decimal | EVM chain id (e.g. `421614` for Arbitrum Sepolia). |
| `vaultAddress` | `0x…` | Deployed vault contract on `chainId`. |
| `nonce` | decimal | On-chain anti-replay nonce. |

#### Action: `batch-flush-withdrawals`

```bash
az-validator sign batch-flush-withdrawals \
  <withdrawalIds> <chainId> <vaultAddress> <nonce>
```

`withdrawalIds` is **comma-separated** (no spaces): e.g. `42,43,44`.

#### Action: `batch-toggle-pending-withdrawal`

```bash
az-validator sign batch-toggle-pending-withdrawal \
  <withdrawalIds> <shouldPause> <chainId> <vaultAddress> <nonce>
```

| Arg | Notes |
|---|---|
| `withdrawalIds` | comma-separated list (`42,43,44`) |
| `shouldPause` | `true` to pause those withdrawals, `false` to unpause |

#### Action: `execute-pending-withdrawal`

```bash
az-validator sign execute-pending-withdrawal \
  <withdrawalId> <chainId> <vaultAddress> <nonce>
```

#### Action: `batch-reset-withdraw-hot-amount`

```bash
az-validator sign batch-reset-withdraw-hot-amount \
  <tokenAddresses> <chainId> <vaultAddress> <nonce>
```

`tokenAddresses` is comma-separated, e.g.
`0x1111…,0x2222…,0x0000000000000000000000000000000000000000`.

#### Action: `rebalance-withdraw`

```bash
az-validator sign rebalance-withdraw \
  <tokenAddress> <amount> <receiver> <chainId> <vaultAddress> <nonce>
```

Worked example (Arbitrum Sepolia):

```bash
az-validator sign rebalance-withdraw \
  0x1111111111111111111111111111111111111111 \
  1000000000000000000 \
  0x3333333333333333333333333333333333333333 \
  421614 \
  0xF2137A2D64bA4dAFcaB54959862f7384Ed7BE100 \
  99
```

`az-validator help sign` or `az-validator sign <action> --help` prints
the inline help.

## Test

```bash
npm test                       # offline suite
npm run test:live-kms          # optional: live KMS smoke test
```
