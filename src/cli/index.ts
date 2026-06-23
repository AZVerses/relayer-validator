#!/usr/bin/env node
import 'dotenv/config';

import { Command } from 'commander';
import { loadConfig } from '../config';
import { AwsKmsValidatorSignerBackend } from '../services/kms/backend';
import { SigningService } from '../services/signing/service';
import { buildApp } from '../server/app';
import { SignRequest, signRequestSchema } from '../types/actions';

export interface CliDeps {
  getServices?: (env?: NodeJS.ProcessEnv) => {
    config: ReturnType<typeof loadConfig>;
    signingService: SigningService;
  };
}

function getSigningService(env = process.env) {
  const resolvedEnv = env ?? process.env;
  const config = loadConfig(resolvedEnv);
  return {
    config,
    signingService: new SigningService(config, new AwsKmsValidatorSignerBackend(config)),
  };
}

async function runSign(request: SignRequest, getServices: NonNullable<CliDeps['getServices']>) {
  const { signingService } = getServices(process.env);
  const validated = signRequestSchema.parse(request);
  const result = await signingService.sign(validated);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export function buildProgram(deps: CliDeps = {}): Command {
  const resolveServices = deps.getServices ?? getSigningService;
  const program = new Command();

  program
    .name('az-validator')
    .description('AZ validator signer service and CLI')
    .showHelpAfterError()
    .helpCommand('help [command]', 'display help for command')
    .addHelpText(
      'after',
      `
Examples:
  az-validator serve --host 0.0.0.0 --port 3001
  az-validator sign rebalance-withdraw 0xToken 10 0xReceiver 11155111 0xVault 123
  az-validator sign request-withdraw 42 0xToken 10 1 0xReceiver false 11155111 0xVault 99

Required environment:
  AWS_REGION
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  KMS_KEY_ID_VALIDATOR
  CALLER_PEM_PUBLIC_KEY_PATH
`,
    );

  program
    .command('serve')
    .description('start the HTTP signing service')
    .option('--host <host>', 'bind host')
    .option('--port <port>', 'bind port')
    .option('--log-level <level>', 'log level')
    .action(async (options: { host?: string; port?: string; logLevel?: string }) => {
      const config = loadConfig({
        ...process.env,
        APP_HOST: options.host ?? process.env.APP_HOST,
        APP_PORT: options.port ?? process.env.APP_PORT,
        LOG_LEVEL: options.logLevel ?? process.env.LOG_LEVEL,
      });
      const signingService = resolveServices({
        ...process.env,
        APP_HOST: config.appHost,
        APP_PORT: String(config.appPort),
        LOG_LEVEL: config.logLevel,
      }).signingService;
      const app = await buildApp({ config, signingService });
      await app.listen({ host: config.appHost, port: config.appPort });
    });

  const sign = program.command('sign').description('sign a withdraw-related action and return JSON');

  sign
    .command('request-withdraw <withdrawalId> <tokenAddress> <amount> <fee> <receiver> <isForcePending> <chainId> <vaultAddress> <nonce>')
    .description('sign requestWithdraw')
    .action(async (withdrawalId, tokenAddress, amount, fee, receiver, isForcePending, chainId, vaultAddress, nonce) => {
      await runSign({
        action: 'request-withdraw',
        withdrawalId,
        tokenAddress,
        amount,
        fee,
        receiver,
        isForcePending: isForcePending === 'true',
        chainId: Number(chainId),
        vaultAddress,
        nonce,
      }, resolveServices);
    });

  sign
    .command('batch-flush-withdrawals <withdrawalIds> <chainId> <vaultAddress> <nonce>')
    .description('sign batchFlushWithdrawals; withdrawalIds is comma-separated')
    .action(async (withdrawalIds, chainId, vaultAddress, nonce) => {
      await runSign({
        action: 'batch-flush-withdrawals',
        withdrawalIds: String(withdrawalIds).split(',').filter(Boolean),
        chainId: Number(chainId),
        vaultAddress,
        nonce,
      }, resolveServices);
    });

  sign
    .command('batch-toggle-pending-withdrawal <withdrawalIds> <shouldPause> <chainId> <vaultAddress> <nonce>')
    .description('sign batchTogglePendingWithdrawal; withdrawalIds is comma-separated')
    .action(async (withdrawalIds, shouldPause, chainId, vaultAddress, nonce) => {
      await runSign({
        action: 'batch-toggle-pending-withdrawal',
        withdrawalIds: String(withdrawalIds).split(',').filter(Boolean),
        shouldPause: shouldPause === 'true',
        chainId: Number(chainId),
        vaultAddress,
        nonce,
      }, resolveServices);
    });

  sign
    .command('execute-pending-withdrawal <withdrawalId> <chainId> <vaultAddress> <nonce>')
    .description('sign executePendingWithdrawal')
    .action(async (withdrawalId, chainId, vaultAddress, nonce) => {
      await runSign({
        action: 'execute-pending-withdrawal',
        withdrawalId,
        chainId: Number(chainId),
        vaultAddress,
        nonce,
      }, resolveServices);
    });

  sign
    .command('batch-reset-withdraw-hot-amount <tokenAddresses> <chainId> <vaultAddress> <nonce>')
    .description('sign batchResetWithdrawHotAmount; tokenAddresses is comma-separated')
    .action(async (tokenAddresses, chainId, vaultAddress, nonce) => {
      await runSign({
        action: 'batch-reset-withdraw-hot-amount',
        tokenAddresses: String(tokenAddresses).split(',').filter(Boolean),
        chainId: Number(chainId),
        vaultAddress,
        nonce,
      }, resolveServices);
    });

  sign
    .command('rebalance-withdraw <tokenAddress> <amount> <receiver> <chainId> <vaultAddress> <nonce>')
    .description('sign rebalanceWithdraw')
    .addHelpText(
      'after',
      `
Example:
  az-validator sign rebalance-withdraw 0x1111111111111111111111111111111111111111 10 0x3333333333333333333333333333333333333333 11155111 0x2222222222222222222222222222222222222222 99
`,
    )
    .action(async (
      tokenAddress: string,
      amount: string,
      receiver: string,
      chainId: string,
      vaultAddress: string,
      nonce: string,
    ) => {
      await runSign({
        action: 'rebalance-withdraw',
        tokenAddress,
        amount,
        receiver,
        chainId: Number(chainId),
        vaultAddress,
        nonce,
      }, resolveServices);
    });

  return program;
}

export async function main(argv = process.argv) {
  const program = buildProgram();
  await program.parseAsync(argv);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
