# Handoff

## Session Summary

Built the full Asset Vault Admin Web from scratch.

### Final Deployment Architecture

**Container**: nginx:1.27-alpine serves dist/ AND reverse-proxies relayer + RPC. Same-origin from the browser's view, so no CORS / cookie cross-origin / mixed-content headaches.

```
Browser → http://<vps>:3004 → nginx container ─┬─ static dist/
                                                ├─ /api/chain/{id}/* → ${RELAYER_URL}
                                                └─ /rpc/chain/{id}   → CHAIN_CONFIGS[].rpcUrl
```

**Two layers of config**:
- **Runtime** (`.env` read by docker-compose, no rebuild needed):
  - `CHAIN_CONFIGS` — injected into `/config.js` at container start via `docker/30-render-config.sh`
  - `RELAYER_URL` / `VALIDATOR_SERVICE_URL` — global upstreams
  - `rpcUrl` — configured per chain inside CHAIN_CONFIGS
- **No build-time env baked into image** — one image works in any environment

**Key files**:
- `Dockerfile` — multi-stage Node build → nginx runtime
- `docker/nginx.conf.template` — SPA fallback + asset cache + proxy rules with resolver
- `docker/30-render-config.sh` — generates `/usr/share/nginx/html/config.js` from CHAIN_CONFIGS env
- `docker/config.js.template` — `window.__APP_CONFIG__ = { CHAIN_CONFIGS: ${CHAIN_CONFIGS} }`
- `public/config.js` — placeholder for dev (empty `__APP_CONFIG__`)
- `index.html` — loads `/config.js` BEFORE main bundle
- `src/config/chains.ts` — reads `window.__APP_CONFIG__.CHAIN_CONFIGS` first, falls back to `import.meta.env.CHAIN_CONFIGS`

### Rebalance Signature Collection
- `/rebalance` page — validator-only
- Top: active collection detail (alert banner, payload, power progress bar, validator votes, approve/reject) OR initiate form (token + amount + fee)
- Bottom: paginated history table from `GET /api/admin/signature-collections`
- Auto-polls every 15s while `collecting`

### Core Features
- Vite + React 18 + TypeScript + Ant Design 5 (dark theme, Geist font)
- Auth: email code + 2FA setup/verify
- 5 pages: Overview, Deposits, Withdrawals, Rebalance, User Management
- 3 data sources: Admin API (relayer) + The Graph (subgraph) + Vault contract RPC

### Overview Page
- Contract Info card: vault address, paused state, challenge period, rebalance receiver
- Contract Roles card: scans RoleGranted/RoleRevoked events, shows holder addresses
- Token Assets: name/symbol from ERC20 RPC, balance, hard cap (bps*balance/10000), refill rate, Fast Lane progress bar
- Validators: grouped by validatorSetHash, each set shows Required Power from on-chain `validatorRequiredPowers(hash)`
- Batch: Reset Hot Amount (selected/all)

### Deposits / Withdrawals
- Token dropdown filter with name + symbol
- Time range: quick presets (1h/4h/1d/7d/2w/30d) + "Custom range..." modal
- Amount: full decimal precision, only `<0.0000000001` for tiny values
- `0x0000...0000` displays as "ETH"
- isPending/isPaused/isExecuted: checkmark/cross icons
- Withdraw actions: per-row loading after action, list auto-refresh every 15s and on window focus.
  Before flush/pause/unpause/execute, the page fetches the latest visible withdrawal state and
  blocks stale actions such as already-executed, flushed, paused, not-pending, or not-expired rows.
- Batch: Flush Selected / Flush All Pending
- Search: works with partial filters and does not inject metadata fields into the relayer query.

### User Management
- CRUD: add viewer/validator, change role, change validator address
- super_admin only

## Pitfalls / Hard-won Knowledge

- **Vercel doesn't work for internal-IP relayers**: edge can't reach private VPN IPs.
- **CHAIN_CONFIGS is runtime config**: inject it at container creation; the SPA merges it with the built-in chain registry at startup.
- **NestJS forbidNonWhitelisted**: relayer rejects unknown query params. Never inject metadata fields (like a cache-bust counter) into filter objects sent to the API.
- **nginx upstream DNS**: nginx resolves upstream hostnames at startup by default — crashes if name unresolvable. Fixed with `resolver` directive + variable-based `proxy_pass`.
- **docker compose restart does NOT re-read .env**: only `docker compose up -d` (or `--force-recreate`) recreates the container with new env.
- **Global relayer URL**: `RELAYER_URL` is one global upstream. Do not duplicate it per chain.
- **Filter keys**: TanStack Query JSON.stringify drops `undefined`. `buildFilters()` only sets defined keys.
- **Zero address**: `0x0000...0000` → "ETH", skips ERC20 RPC.
- **Cookie collision across chains**: same `admin_session` cookie name. Switching chains may require re-auth.
- **Role scanning**: `useVaultInfo` scans all RoleGranted/RoleRevoked events from block 0. On busy chains consider caching or limiting fromBlock.

## Environment

- Node.js (npm), Vite 5 dev server on port 5173
- Relayer: http://13.192.1.237:3000 (Arbitrum Sepolia, chainId 421614, internal IP via VPN)
- Vault: 0x5DE4C4B3ADCd59104DA8BB610e49202993207Ad0
- RPC: https://sepolia-rollup.arbitrum.io/rpc
- Graph: https://api.studio.thegraph.com/query/1722407/az-asset-vault/v0.0.2
- Image registry: ECR `405826043249.dkr.ecr.ap-northeast-1.amazonaws.com/azdex/test:asset-vault-admin-web-dev-latest`

## Run

```bash
# Local dev
npm install
npm run dev               # http://localhost:5173

# Build / typecheck
npm run build
npx tsc --noEmit

# VPS production
cp .env.example .env      # edit values
docker compose up -d --build
# (or `docker-compose up -d --force-recreate` if pulling pre-built image)
```

## Production .env Example

```env
CHAIN_CONFIGS=[{"chainId":42161,"vaultAddress":"0x949556cb8634F9a4a8504665C3d0D9d326c600b2","graphUrl":"","rpcUrl":"https://arb1.arbitrum.io/rpc"}]
RELAYER_URL=http://13.192.1.237:3000
VALIDATOR_SERVICE_URL=http://validator-service:3001
HOST_PORT=3004
```

## Docs Index

- `docs/product/main.md` — Product requirements
- `docs/tech/architecture.md` — Technical architecture
- `README.md` — Local dev + Docker deployment

## TODO

- [ ] E2E tests with Playwright
- [ ] Token icon/logo from token list registries
- [ ] Overview stats from Admin API (deposit/withdraw counts)
- [ ] Session expiry detection + auto-redirect
- [ ] Code splitting (bundle >1MB)
- [ ] GitHub Actions workflow for auto-deploy on push
- [ ] HTTPS in front of the docker container (Caddy/nginx-proxy + letsencrypt)
- [ ] Improve healthcheck command in docker-compose (currently uses `curl` but nginx:alpine has wget)
