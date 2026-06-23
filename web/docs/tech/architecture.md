# Architecture

## Tech Stack

- Vite 5 + React 18 + TypeScript
- Ant Design 5 (dark theme, custom tokens)
- React Router v6 (routing)
- TanStack Query v5 (server state / caching)
- Zustand (global state: chain selection, auth)
- graphql-request (Graph queries)
- viem (ERC20 contract calls for token metadata)

## Data Sources

### Admin API (global relayer endpoint)
- The admin web calls one configured relayer endpoint. Chain context stays in the path
  and request payloads.
- Cookie-based auth (`admin_session`, `credentials: 'include'`)
- Response envelope: `{ code: 0, msg: "success", data: {} }`, always HTTP 200
- Dev: Vite proxy routes `/api/chain/{chainId}/...` to relayer
- Public deposits / withdrawals return human-readable decimal `amount`
  and `fee` strings from the relayer. Do not pass those fields through
  `formatUnits` again; only Graph and direct on-chain reads use raw base
  units.

### The Graph (per-chain subgraph)
- Entities: Token, Validator, Withdrawal
- Authenticated via API key in URL

### ERC20 RPC (per-chain)
- Fetches token name, symbol, decimals at init via `rpcUrl`
- Cached in TanStack Query for 5 minutes
- Used for amount formatting (wei -> human readable) and token dropdowns

### Vault RPC
- Withdrawals only read vault basics needed for row actions, such as
  `pendingWithdrawChallengePeriod`.
- Rebalance initiation reads `rebalanceReceiver()` from the vault and
  refuses to create a collection when it is the zero address. Configure
  the receiver on-chain before using rebalance withdraw.
- Overview also reads role holders from `RoleGranted` / `RoleRevoked`,
  but starts at the built-in chain `startBlock` instead of block `0`.
  On Arbitrum One this avoids oversized mainnet `eth_getLogs` requests.
- If `graphUrl` is an empty string, Graph-backed token and validator
  queries return empty lists instead of issuing an invalid GraphQL
  request.

## Multi-Chain

Env var `CHAIN_CONFIGS` is a JSON array of per-chain deployment overrides:
```ts
{ chainId, vaultAddress, graphUrl, rpcUrl }
```

At startup the app merges those overrides with the built-in chain
registry in `src/config/chain-registry.ts`. All API calls and Graph
queries are namespaced by `chainId`. Chain selector in the header
switches context.

## Project Structure

```
src/
  config/chains.ts       - Chain config parser
  api/client.ts          - Admin API fetch wrapper with envelope unwrap
  api/admin/             - Auth, deposits, withdrawals, users API modules
  api/graph/             - GraphQL client + queries
  stores/                - Zustand stores (auth, chain)
  hooks/
    useGraphData.ts      - TanStack Query for Graph entities
    useTokenMeta.ts      - ERC20 metadata fetcher (name, symbol, decimals)
  utils/format.ts        - formatTokenAmount (wei->ether), shortenAddress
  types/                 - TypeScript types
  layouts/               - AuthLayout (centered dark card), DashboardLayout (sidebar + header)
  pages/                 - Login, Overview, Deposits, Withdrawals, Users
  components/
    ChainSelector.tsx    - Chain dropdown in header
    TokenSelect.tsx      - Token dropdown with name + address
    AddressLink.tsx      - Shortened address with explorer link
    StatusTag.tsx        - Colored status tags
    RoleGuard.tsx        - Conditional render by role
```

## Auth Flow

1. Email verification code -> cookie set
2. 2FA setup (first time) or 2FA verify (returning)
3. Session status: `pending_2fa_setup` | `pending_2fa_verify` | `active`
4. DashboardLayout checks `/api/admin/auth/me` on mount

## Roles

- `viewer`: read deposits/withdrawals
- `validator`: + withdraw actions (flush, pause, unpause, execute, reset hot amount)
- `super_admin`: + user management

## Batch Operations

- **Withdraw row actions**:
  - unexpired + unpaused: `Flush`, `Pause`
  - unexpired + paused: `Unpause`
  - expired + unpaused: `Execute`
  - expired + paused: `Unpause`
- **Flush**: Select individual unexpired unpaused withdrawals or use
  the "Flush All Unexpired Unpaused" button
- **Reset Hot Amount**: Select individual tokens or "Reset All" button on Overview page
