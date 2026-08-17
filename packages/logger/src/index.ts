import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import pino, { type Logger as PinoLogger } from "pino";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface RequestContext {
  requestId: string;
  correlationId: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();
const safeIdentifierPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function createRequestId(candidate?: string): string {
  return candidate && safeIdentifierPattern.test(candidate)
    ? candidate
    : randomUUID();
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function withRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

export interface LoggerOptions {
  service: string;
  environment: string;
  level: LogLevel;
}

export function createStructuredLogger(options: LoggerOptions): PinoLogger {
  return pino({
    level: options.level,
    base: {
      service: options.service,
      environment: options.environment,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "password",
        "passwordHash",
        "token",
        "accessToken",
        "refreshToken",
        "apiKey",
        "secret",
        "authorization",
        "cookie",
        "req.headers.authorization",
        "req.headers.cookie",
      ],
      censor: "[REDACTED]",
    },
  });
}

function messageText(message: unknown): string {
  if (message instanceof Error) {
    return message.message;
  }

  if (typeof message === "string") {
    return message;
  }

  try {
    return JSON.stringify(message);
  } catch {
    return "Unserializable log message";
  }
}

export class RecourseLogger {
  private readonly logger: PinoLogger;

  constructor(options: LoggerOptions) {
    this.logger = createStructuredLogger(options);
  }

  log(message: unknown, context?: string): void {
    this.write("info", message, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write("error", message, context, trace);
  }

  warn(message: unknown, context?: string): void {
    this.write("warn", message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write("fatal", message, context);
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    trace?: string,
  ): void {
    const requestContext = getRequestContext();
    const fields = {
      ...(requestContext ?? {}),
      ...(context ? { context } : {}),
      ...(trace ? { trace } : {}),
    };

    if (message instanceof Error) {
      this.logger[level]({ ...fields, err: message }, message.message);
      return;
    }

    this.logger[level](fields, messageText(message));
  }
}
