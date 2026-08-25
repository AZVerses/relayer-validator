# Admin Web Handoff

## Current state

- Production is the parent validator single image: Nginx serves the SPA and proxies Fastify,
  selected relayer reads, and selected RPC reads on one origin.
- Authentication is Nginx + Fastify Basic Auth. There is no email/2FA/cookie/user-role system.
- Pages: Overview, Deposits, Withdrawals, Rebalance.
- Selected chain persists in `?chain=<chainId>`; Arbitrum One is the default when configured.
- Deposits, withdrawals, and Vault roles come from relayer public APIs. Tokens and validator sets
  use Graph only when `graphUrl` is non-empty, otherwise relayer fallback.
- Withdrawal actions enter row loading before precheck and clear when the relayer's mined
  transaction response succeeds or fails. Background refresh does not hold the row lock.

## Environment

`CHAIN_CONFIGS` is the shared runtime payload. Each entry requires `chainId`, `vaultAddress`, and
`graphUrl`; it may set `rpcUrl`, `relayerUrl`, `name`, and `explorerUrl`. Built-in chains can omit
RPC/name/explorer; custom chains require full metadata. Unknown fields fail startup.

For Vite dev, `relayerUrl` is read from each chain item and the validator defaults to
`http://localhost:3001`. For the combined image, `CHAIN_CONFIGS[].relayerUrl` is preferred and
legacy `RELAYER_URL` is only a fallback. Recreate the container to reload `.env`; `docker restart`
does not inject changed environment variables.

## Run and verify

```bash
npm install
npm run dev
npm run build
npm run lint
```

Validator-level tests live in `../test`; run `npm test` from the validator root. The canonical
architecture and product behavior are in `docs/tech/architecture.md` and `docs/product/main.md`.

## Known boundary

The standalone web-only Docker Compose path is for local integration and does not own the parent
image's Basic Auth configuration. Public deployments should use the parent validator image.
