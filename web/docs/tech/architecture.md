# Admin Web Architecture

## Runtime boundary

The production validator image serves the React SPA, Fastify validator API, relayer read proxy,
RPC proxy, and Admin write forwarder on one origin behind Nginx Basic Auth. The browser never
receives upstream credentials and does not call relayer/RPC origins directly.

Current stack versions come from `web/package.json`: React 19, React Router 7, Ant Design 6,
TanStack Query 5, Zustand 5, Vite 8, TypeScript 6, viem 2, and graphql-request 7.

## Routes and authentication

- Nginx protects the SPA root and `/admin/*` with Basic Auth (`admin` plus
  `ADMIN_BASIC_AUTH_PASSWORD`).
- Fastify independently verifies the same Basic Auth on `/admin/*` before KMS signing.
- `/validator` exposes the current validator address.
- `/api/chain/{chainId}/*` forwards only the allowlisted relayer read endpoints.
- `/rpc/chain/{chainId}` forwards JSON-RPC to the selected chain RPC.
- `/admin/sign-withdraw-operation` and `/admin/sign-rebalance-reject` sign and forward writes.

There is no email login, 2FA, cookie session, application user table, or application role model.
Network/IP restrictions may be added by deployment infrastructure but do not replace Basic Auth.

## Chain configuration

`CHAIN_CONFIGS` is injected into `window.__APP_CONFIG__` at container creation and merged with the
built-in chain registry. Each item contains:

```ts
{
  chainId,
  vaultAddress,
  graphUrl,
  rpcUrl?,
  relayerUrl?,
  name?,
  explorerUrl?
}
```

Built-in chains can inherit their RPC, name, and explorer. Custom chains require full metadata,
RPC, and relayer URL. `vaultAddress` and `graphUrl` are always explicit deployment values.
Unknown fields fail parsing. `relayerUrl` is the preferred per-chain route; legacy `RELAYER_URL`
fills it only when omitted by the validator service or standalone Nginx renderer.

The selected chain is encoded in the browser URL as `?chain=<chainId>`. Refresh, history
navigation, sidebar navigation, and unknown-route redirects preserve it. A missing or invalid
value selects Arbitrum One (`42161`) when configured, otherwise the first configured chain.

## Data sources

| Data | Source |
| --- | --- |
| Deposits / withdrawals | Selected relayer public APIs |
| Vault roles | Selected relayer indexed Vault state |
| Tokens | The Graph when `graphUrl` is non-empty; relayer fallback when empty |
| Validator sets | The Graph when `graphUrl` is non-empty; relayer fallback when empty |
| Paused flag, challenge period, rebalance receiver, required power | Live Vault RPC |
| Token name, symbol, decimals | Live token RPC |
| Rebalance collections | Selected relayer signature-collection APIs |

A configured Graph URL that fails surfaces the error; runtime does not silently switch sources.
Relayer fallback responses include `chainId` and `vaultAddress`, which the SPA verifies before
using them.

## Write lifecycle

Flush, pause, unpause, execute, reset-hot-amount, and rebalance actions are signed by the local
validator and forwarded to the selected relayer. The relayer validates the prepopulated signature,
collects the remaining validator quorum, selects an operator, submits the Vault transaction, and
waits for its receipt.

Withdrawal rows enter loading immediately after confirmation. Loading covers the fresh-state
precheck and the mined transaction response, then clears on success or failure. Relayer list
refreshes run in the background and do not impose an artificial fixed-duration row lock.

## Project structure

```text
src/config/             runtime chain registry
src/api/admin/          relayer reads and Admin actions
src/api/graph/          optional Graph token/validator queries
src/api/local/          same-origin validator signing calls
src/data/               Graph-versus-relayer source selection
src/hooks/              TanStack Query live and indexed reads
src/stores/             selected-chain state
src/pages/              overview, deposits, withdrawals, rebalance
src/utils/              formatting and action-state rules
```
