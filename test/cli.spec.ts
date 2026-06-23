import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildProgram } from '../src/cli/index';
import { SigningService } from '../src/services/signing/service';
import { createTestConfig, InMemorySignerBackend } from './helpers';

describe('az-validator CLI', () => {
  let stdoutSpy: any;
  let stderrSpy: any;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write');
    stderrSpy = vi.spyOn(process.stderr, 'write');
    stdoutSpy.mockImplementation(() => true);
    stderrSpy.mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('shows detailed help', async () => {
    const program = buildProgram();
    program.exitOverride();
    await expect(program.parseAsync(['node', 'az-validator', '--help'])).rejects.toMatchObject({
      code: 'commander.helpDisplayed',
    });
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('signs rebalance-withdraw and prints JSON', async () => {
    const config = createTestConfig();
    const serviceFactory = () => ({
      config,
      signingService: new SigningService(config, new InMemorySignerBackend()),
    });
    const program = buildProgram({
      getServices: serviceFactory,
    });

    await program.parseAsync([
      'node',
      'az-validator',
      'sign',
      'rebalance-withdraw',
      '0x1111111111111111111111111111111111111111',
      '10',
      '0x3333333333333333333333333333333333333333',
      '11155111',
      '0x2222222222222222222222222222222222222222',
      '12',
    ]);

    const output = stdoutSpy.mock.calls.map((call: any) => call[0]).join('');
    expect(output).toContain('"action": "rebalance-withdraw"');
    expect(output).toContain('"validatorAddress"');
  });
});
