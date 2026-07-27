export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_NUMBERS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export interface LogPayload {
  msg: string;
  [key: string]: unknown;
}

class PinoLogger {
  private serviceName: string;

  constructor(serviceName = 'app-truyen-nova') {
    this.serviceName = serviceName;
  }

  private log(level: LogLevel, msgOrPayload: string | LogPayload, extra?: Record<string, unknown>) {
    const time = Date.now();
    const levelNum = LEVEL_NUMBERS[level];

    let payload: Record<string, unknown> = {};
    if (typeof msgOrPayload === 'string') {
      payload = { msg: msgOrPayload };
    } else {
      payload = { ...msgOrPayload };
    }

    if (extra) {
      payload = { ...payload, ...extra };
    }

    const logEntry = {
      level: levelNum,
      time,
      pid: process.pid || 1,
      hostname: process.env.HOSTNAME || 'nova-backend',
      service: this.serviceName,
      ...payload,
    };

    const formatted = JSON.stringify(logEntry);
    if (levelNum >= LEVEL_NUMBERS.error) {
      process.stderr.write(formatted + '\n');
    } else {
      process.stdout.write(formatted + '\n');
    }
  }

  trace(msgOrPayload: string | LogPayload, extra?: Record<string, unknown>) {
    this.log('trace', msgOrPayload, extra);
  }

  debug(msgOrPayload: string | LogPayload, extra?: Record<string, unknown>) {
    this.log('debug', msgOrPayload, extra);
  }

  info(msgOrPayload: string | LogPayload, extra?: Record<string, unknown>) {
    this.log('info', msgOrPayload, extra);
  }

  warn(msgOrPayload: string | LogPayload, extra?: Record<string, unknown>) {
    this.log('warn', msgOrPayload, extra);
  }

  error(msgOrPayload: string | LogPayload, extra?: Record<string, unknown>) {
    this.log('error', msgOrPayload, extra);
  }

  fatal(msgOrPayload: string | LogPayload, extra?: Record<string, unknown>) {
    this.log('fatal', msgOrPayload, extra);
  }
}

export const logger = new PinoLogger();
