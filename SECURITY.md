# Security Policy

## Reporting a vulnerability

Use this repository's GitHub **private vulnerability reporting** form: open the
**Security** tab and select **Report a vulnerability**. Include the affected
commit, impact, reproduction steps and a safe way to coordinate follow-up.

Do not open a public issue, discussion or pull request for an undisclosed
vulnerability. Do not include KMS key identifiers, AWS credentials, relayer PEM
material, admin passwords, internal endpoints or real chain configuration in a
report.

## Scope

This service holds signing authority for AssetVault withdrawal actions. Reports
are in scope when they concern:

- caller authentication — `x-signature` / `x-timestamp` / `x-nonce` verification,
  replay windows, and PEM pinning through `CALLER_PEM_PUBLIC_KEY_SHA256`;
- digest construction in `src/services/signing/digests.ts`, in particular any
  input that lets two different actions produce the same digest;
- the risk-check path, including any case where a check is skipped without the
  `skip-cex-verify` audit tag;
- admin route authentication and the browser-facing proxy allow-list;
- container and nginx hardening covered by the checked-in tests.

Out of scope in this repository: the relayer itself, the CEX risk service, the
AssetVault contracts, and AWS account configuration. Report those through their
owning channels.

## Response

Maintainers will acknowledge actionable reports privately, reproduce them
against a named commit, coordinate a fix, and disclose only after operators have
a safe upgrade path. No response-time or bounty guarantee is offered.
