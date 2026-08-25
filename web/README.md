# Asset Vault Admin Web

React admin dashboard for multi-chain vault management.

## Local Development

```bash
npm install
cp .env.example .env.development     # CHAIN_CONFIGS is read by Vite dev
npm run dev                          # http://localhost:5173
```

Vite proxies `/api/chain/{chainId}/*` to the relayer, `/rpc/chain/{chainId}` to the public RPC, and direct `/validator` plus `/admin/*` paths to the validator service, so dev has no CORS issue.
Each `CHAIN_CONFIGS` item should include `relayerUrl` for Vite dev. The validator service defaults
to `http://localhost:3001`; the selected chain is persisted as `?chain=<chainId>`.

## Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `CHAIN_CONFIGS` | Vite + Docker | JSON array of per-chain `{ chainId, vaultAddress, graphUrl, rpcUrl?, relayerUrl }`; built-in chains may omit `rpcUrl`, while custom chains also require `name` and `explorerUrl`. Unknown fields fail startup. |
| `RELAYER_URL` | Docker only | Optional legacy fallback for entries without `relayerUrl`. |
| `VALIDATOR_SERVICE_URL` | Docker only | Global nginx proxy target for direct `/validator` and `/admin/*` paths. |
| `HOST_PORT` | Docker only | Host port to expose nginx on. Default: `8080`. |

## Deployment

The recommended production image is the parent `relayer-validator` image. It bundles this SPA,
Fastify, Nginx, and Basic Auth on one port. See `../README.md`; do not deploy the standalone web
image on a public VPS because it does not own the validator's Basic Auth configuration.

The standalone web-only Docker Compose file remains useful for local integration. Its container:

The container runs nginx that does two things:
1. Serves the built SPA from `dist/`
2. Reverse-proxies `/api/chain/{chainId}/*` to `CHAIN_CONFIGS[].relayerUrl` (or legacy
   `RELAYER_URL`), direct `/validator` and `/admin/*` paths to `VALIDATOR_SERVICE_URL`, and
   `/rpc/chain/{chainId}` to `CHAIN_CONFIGS[].rpcUrl`.

This keeps frontend + relayer on the same origin — no CORS, no cross-origin cookie issues.

### One-time setup

```bash
cp .env.example .env                 # edit values
docker compose up -d --build
```

Open `http://<host>:8080`.

### Verifying

```bash
docker compose ps
curl -I http://localhost:8080/                                   # → 200 OK
curl http://localhost:8080/validator                            # -> validator address
curl http://localhost:8080/api/chain/42161/api/public/vault-roles
curl -X POST http://localhost:8080/rpc/chain/42161 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}'
# -> {"jsonrpc":"2.0","id":1,"result":"0xa4b1"}
docker compose logs -f admin-web
```

### Updating config

env vars are injected at container creation, not at start. `docker restart` does NOT re-read `.env`.

**Change `CHAIN_CONFIGS`** (no rebuild needed, but container recreation is required):
```bash
docker compose up -d                # recreates container with new /config.js
```

### Port configuration

Container internal: 80 (nginx default — don't change).
Host: `HOST_PORT` in `.env`, default 8080.

For HTTPS, put Caddy / nginx / Traefik in front of port 8080.

## Production Build (without Docker)

```bash
npm run build       # output in dist/
npm run preview     # preview locally
```

You'll need to handle the proxy yourself (set up nginx/Caddy with the same rewrite rules as `docker/nginx.conf.template`).
