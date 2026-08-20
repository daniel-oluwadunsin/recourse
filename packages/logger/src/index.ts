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
const sensitiveKeyNames = new Set([
  "password",
  "password_hash",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "authorization",
  "cookie",
  "api_key",
  "body",
  "content",
  "html",
  "prompt",
  "raw",
  "text",
  "email",
  "email_address",
  "ip_address",
]);
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu;
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/giu;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;

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

/**
 * Logs are an operational record, not a second copy of case evidence.
 * Keep identifiers and bounded diagnostics, while removing fields that are
 * commonly used to carry credentials or private document content.
 */
export function sanitizeLogValue(
  value: unknown,
  key?: string,
  depth = 0,
): unknown {
  if (key && isSensitiveKey(key)) {
    return "[REDACTED]";
  }

  if (depth > 4) {
    return "[TRUNCATED]";
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeLogText(value.message),
    };
  }

  if (typeof value === "string") {
    return sanitizeLogText(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeLogValue(item, undefined, depth + 1));
  }

  if (typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      sanitized[childKey] = sanitizeLogValue(childValue, childKey, depth + 1);
    }
    return sanitized;
  }

  return String(value);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z])([A-Z])/gu, "$1_$2")
    .replace(/[-\s]/gu, "_")
    .toLowerCase();
  return [...sensitiveKeyNames].some(
    (name) =>
      normalized === name ||
      normalized.startsWith(`${name}_`) ||
      normalized.endsWith(`_${name}`),
  );
}

export function sanitizeLogText(value: string): string {
  return value
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(jwtPattern, "[REDACTED_TOKEN]")
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(/[\r\n\t]+/gu, " ")
    .slice(0, 1000);
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
    return sanitizeLogText(message);
  }

  try {
    return JSON.stringify(sanitizeLogValue(message));
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
      const safeFields = sanitizeLogValue(fields);
      this.logger[level](
        {
          ...(isPlainRecord(safeFields) ? safeFields : {}),
          err: sanitizeLogValue(message),
        },
        sanitizeLogText(message.message),
      );
      return;
    }

    const safeFields = sanitizeLogValue(fields);
    this.logger[level](
      isPlainRecord(safeFields) ? safeFields : {},
      messageText(message),
    );
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
