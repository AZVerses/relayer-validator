import { EventEmitter } from 'events';
import { mkdtempSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { createLogger, DailyFileLogStream, registerProcessErrorHandlers } from '../src/logging';

describe('validator logging', () => {
  it('writes logs to one file per local calendar day', async () => {
    const directory = path.join(mkdtempSync(path.join(tmpdir(), 'az-validator-log-')), 'nested');
    let currentTime = new Date(2026, 6, 17, 12, 0, 0);
    const stream = new DailyFileLogStream({
      directory,
      now: () => currentTime,
    });

    stream.write('first log\n');
    currentTime = new Date(2026, 6, 18, 12, 0, 0);
    stream.write('next day\n');
    await stream.close();

    expect(readdirSync(directory)).toEqual(['2026-07-17.log', '2026-07-18.log']);
    expect(readFileSync(path.join(directory, '2026-07-17.log'), 'utf8')).toContain('first log');
    expect(readFileSync(path.join(directory, '2026-07-18.log'), 'utf8')).toContain('next day');
  });

  it('routes Fastify logs through the configured daily file stream', async () => {
    const directory = path.join(mkdtempSync(path.join(tmpdir(), 'az-validator-log-')), 'logs');
    const logger = createLogger({ logLevel: 'info', logPath: directory });
    const app = fastify({ logger: logger.options });
    app.addHook('onClose', () => logger.close());

    app.log.info('fastify file logging works');
    await app.close();

    const date = new Date();
    const dateFile = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.log`;
    expect(readFileSync(path.join(directory, dateFile), 'utf8')).toContain('fastify file logging works');
  });

  it('logs unhandled rejections, closes, and exits with failure', async () => {
    const runtime = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const logger = {
      error: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    registerProcessErrorHandlers(logger, runtime as never);

    const error = new Error('rejection failure');
    runtime.emit('unhandledRejection', error);
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith('[Process] Unhandled promise rejection', error);
    expect(logger.close).toHaveBeenCalledTimes(1);
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it('logs uncaught exceptions and exits with failure', async () => {
    const runtime = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const logger = {
      error: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    registerProcessErrorHandlers(logger, runtime as never);

    const error = new Error('uncaught failure');
    runtime.emit('uncaughtException', error);
    await new Promise<void>(resolve => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith('[Process] Uncaught exception', error);
    expect(logger.close).toHaveBeenCalledTimes(1);
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });
});
