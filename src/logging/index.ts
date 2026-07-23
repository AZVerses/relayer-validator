import { createWriteStream, mkdirSync, type WriteStream } from 'fs';
import { resolve } from 'path';
import { AppConfig } from '../config';

type LoggerConfig = Pick<AppConfig, 'logLevel' | 'logPath'>;

export type DailyFileLogStreamOptions = {
  directory: string;
  now?: () => Date;
};

export class DailyFileLogStream {
  private readonly directory: string;
  private readonly now: () => Date;
  private currentDate: string | null = null;
  private stream: WriteStream | null = null;
  private streamError: Error | null = null;

  constructor(options: DailyFileLogStreamOptions) {
    this.directory = options.directory;
    this.now = options.now ?? (() => new Date());
  }

  write(message: string): void {
    this.ensureStream().write(message);
  }

  async close(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    this.currentDate = null;
    if (!stream) {
      return;
    }

    await new Promise<void>((resolvePromise, reject) => {
      const onError = (error: Error): void => reject(error);
      stream.once('error', onError);
      stream.end(() => {
        stream.removeListener('error', onError);
        resolvePromise();
      });
    });
  }

  private ensureStream(): WriteStream {
    if (this.streamError) {
      const error = new Error(`Daily log file is unavailable: ${this.streamError.message}`);
      Object.defineProperty(error, 'cause', { value: this.streamError });
      throw error;
    }

    const date = this.formatDate(this.now());
    if (this.stream && this.currentDate === date) {
      return this.stream;
    }

    if (this.stream) {
      this.stream.end();
    }

    const directory = resolve(this.directory);
    mkdirSync(directory, { recursive: true });
    const stream = createWriteStream(resolve(directory, `${date}.log`), {
      flags: 'a',
      encoding: 'utf8',
    });
    stream.on('error', (error: Error) => {
      if (this.stream === stream) {
        this.streamError = error;
      }
    });
    this.streamError = null;
    this.currentDate = date;
    this.stream = stream;
    return stream;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export interface ProcessErrorLogger {
  error(message: unknown, ...optionalParams: unknown[]): void;
  close(): Promise<void>;
}

type ProcessRuntime = Pick<NodeJS.Process, 'on' | 'exit'>;

export function createLogger(config: LoggerConfig): {
  options: { level: string; stream: DailyFileLogStream } | {
    level: string;
    transport: {
      target: string;
      options: Record<string, string | boolean>;
    };
  };
  close: () => Promise<void>;
} {
  if (config.logPath) {
    const stream = new DailyFileLogStream({ directory: config.logPath });
    return {
      options: { level: config.logLevel, stream },
      close: () => stream.close(),
    };
  }

  return {
    options: {
      level: config.logLevel,
      // Human-readable single-line output with ISO-8601 timestamps.
      // Falls back to plain JSON if pino-pretty is unavailable
      // (e.g. minimal build that strips devDeps).
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: true,
          messageFormat: '{reqId} {msg}',
        },
      },
    },
    close: async () => undefined,
  };
}

export function registerProcessErrorHandlers(
  logger: ProcessErrorLogger,
  runtime: ProcessRuntime = process,
): void {
  let shuttingDown = false;

  const handleFatalError = (kind: string, reason: unknown): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    void (async () => {
      try {
        logger.error(`[Process] ${kind}`, reason);
        await logger.close();
      } catch (loggingError) {
        console.error(`[Process] Failed to persist ${kind}`, loggingError);
        console.error(reason);
      } finally {
        runtime.exit(1);
      }
    })();
  };

  runtime.on('uncaughtException', error => {
    handleFatalError('Uncaught exception', error);
  });
  runtime.on('unhandledRejection', reason => {
    handleFatalError('Unhandled promise rejection', reason);
  });
}
