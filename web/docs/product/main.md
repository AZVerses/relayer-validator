# Validator Admin Web

## 当前范围

Admin Web 是多链 Vault 的运营控制台。当前认证边界是部署层 Nginx Basic Auth，并由
Fastify 对写接口二次校验；系统没有 email 登录、2FA、用户管理或应用内角色功能。

所有页面按链展示。当前链写入 URL `?chain=<chainId>`，刷新、浏览器前进后退和侧栏跳转
不会回到错误链；没有合法参数时默认选择已配置的 Arbitrum One。

## 页面

- Overview：Vault 地址、暂停状态、challenge period、rebalance receiver、全部 Vault roles、
  支持 token、token 余额/限额/refill 状态、validator sets 和 validator power。
- Deposits：按 token、用户地址和时间过滤充值记录，展示金额、确认状态、时间和交易链接。
- Withdrawals：按 token、用户地址、时间、pending/paused 状态过滤，展示费用、执行状态、
  challenge 到期时间和交易链接。
- Rebalance：创建、参与或拒绝 rebalance signature collection，展示投票 power、状态、交易
  hash 和失败信息。

Deposits、withdrawals 和 Vault roles 来自所选链的 relayer。`graphUrl` 非空时 token 和
validator sets 来自 The Graph；为空时从 relayer fallback 读取。Vault 基础状态和 token
metadata 通过所选链 RPC 实时读取。

## Withdrawal 操作

| Pending withdrawal 状态 | 可用按钮 |
| --- | --- |
| 未过期、未暂停 | `Flush`, `Pause` |
| 未过期、已暂停 | `Unpause` |
| 已过期、未暂停 | `Execute` |
| 已过期、已暂停 | `Unpause` |

Flush 支持单笔、选择多笔和 flush all。确认操作后相关行立即进入 loading，直到 relayer 返回
已上链交易结果；成功和失败都会解除，列表在后台刷新，不使用固定时间假 loading。

一次 Admin approve 只提供发起 validator 的预签名，不代表绕过 quorum。Relayer 仍会验证
digest/validator/chain/vault，并按 Vault validator threshold 收集其余签名后才提交交易。
Admin Web 不能创建新的 user withdrawal；新提现只能进入 CEX 签名的 relayer API。

## 部署边界

生产使用父目录 validator 单镜像，由同一个 origin 提供 SPA、validator API、relayer/RPC
proxy 和 Admin write forwarding。Standalone web-only Compose 仅用于本地集成，不承担生产
Basic Auth 配置。
