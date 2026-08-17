import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(32).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalNumber = (minimum: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(minimum).optional(),
  );

const optionalBoolean = z.preprocess((value) => {
  if (value === "" || value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value;
}, z.boolean().optional());

const durationSchema = z.string().regex(/^\d+(s|m|h|d)$/);

const logLevelSchema = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
]);

const baseEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  APP_VERSION: z.string().min(1).default("local"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000/api/v1"),
  API_URL: z.string().url().default("http://localhost:4000"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z
    .string()
    .regex(/^\/[a-zA-Z0-9/_-]+$/)
    .default("/api/v1"),
  LOG_LEVEL: logLevelSchema.default("info"),

  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  REDIS_PREFIX: z.string().min(1).default("recourse:local:"),
  QUEUE_CASE_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  QUEUE_PROCEDURE_CONCURRENCY: z.coerce.number().int().min(1).default(3),
  QUEUE_EVIDENCE_CONCURRENCY: z.coerce.number().int().min(1).default(3),
  QUEUE_AI_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  QUEUE_NOTIFICATION_CONCURRENCY: z.coerce.number().int().min(1).default(10),
  QUEUE_EXTERNAL_ACTION_CONCURRENCY: z.coerce.number().int().min(1).default(2),

  MONGODB_URI: optionalString,
  MONGODB_DATABASE: z.string().min(1).default("recourse"),
  MONGODB_MAX_POOL_SIZE: optionalNumber(1),
  MONGODB_MIN_POOL_SIZE: optionalNumber(0),
  MONGODB_AUTO_INDEX: optionalBoolean.default(false),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .default(5000),
  MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).default(10000),
  MONGODB_SOCKET_TIMEOUT_MS: z.coerce.number().int().min(0).default(45000),
  GROQ_API_KEY: optionalString,
  TAVILY_API_KEY: optionalString,

  JWT_ACCESS_SECRET: optionalSecret,
  JWT_ACCESS_TTL: durationSchema.default("15m"),
  JWT_REFRESH_SECRET: optionalSecret,
  JWT_REFRESH_TTL: durationSchema.default("30d"),
  JWT_ISSUER: z.string().min(1).default("recourse-api"),
  JWT_AUDIENCE: z.string().min(1).default("recourse-web"),
  AUTH_COOKIE_NAME: z.string().min(1).default("recourse_refresh"),
  AUTH_COOKIE_DOMAIN: optionalString,
  AUTH_COOKIE_PATH: z
    .string()
    .regex(/^\/[a-zA-Z0-9/_-]+$/)
    .default("/api/v1/auth"),
  AUTH_COOKIE_SECURE: optionalBoolean.default(false),
  AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict"]).default("lax"),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(1440)
    .default(30),
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(168)
    .default(24),
  PASSWORD_HASH_MEMORY_COST_KIB: z.coerce
    .number()
    .int()
    .min(19456)
    .default(19456),
  PASSWORD_HASH_TIME_COST: z.coerce.number().int().min(2).default(2),
  PASSWORD_HASH_PARALLELISM: z.coerce.number().int().min(1).default(1),
  RATE_LIMIT_STORAGE: z.enum(["memory", "redis"]).default("redis"),
  AUTH_RATE_LIMIT_TTL_MS: z.coerce.number().int().min(1000).default(60000),
  AUTH_RATE_LIMIT_LIMIT: z.coerce.number().int().min(1).default(10),
  TRUST_PROXY: optionalBoolean.default(false),

  SENTRY_DSN: optionalUrl,
  SENTRY_ENVIRONMENT: z.string().min(1).default("local"),
  SENTRY_RELEASE: optionalString,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  OTEL_EXPORTER_OTLP_HEADERS: optionalString,
  OTEL_SERVICE_NAME: z.string().min(1).default("recourse-api"),

  WORKER_NAME: z.string().min(1).default("recourse-worker"),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(30000),
});

export const environmentSchema = baseEnvironmentSchema.superRefine(
  (environment, context) => {
    if (
      environment.NODE_ENV === "production" ||
      environment.APP_ENV === "production"
    ) {
      for (const key of [
        "MONGODB_URI",
        "JWT_ACCESS_SECRET",
        "JWT_REFRESH_SECRET",
      ] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: "custom",
            message: `${key} is required in production`,
            path: [key],
          });
        }
      }

      if (!environment.AUTH_COOKIE_SECURE) {
        context.addIssue({
          code: "custom",
          message: "AUTH_COOKIE_SECURE must be true in production",
          path: ["AUTH_COOKIE_SECURE"],
        });
      }

      if (environment.MONGODB_AUTO_INDEX) {
        context.addIssue({
          code: "custom",
          message: "MONGODB_AUTO_INDEX must be false in production",
          path: ["MONGODB_AUTO_INDEX"],
        });
      }

      if (environment.RATE_LIMIT_STORAGE === "memory") {
        context.addIssue({
          code: "custom",
          message: "RATE_LIMIT_STORAGE must be redis in production",
          path: ["RATE_LIMIT_STORAGE"],
        });
      }

      if (!environment.WEB_URL.startsWith("https://")) {
        context.addIssue({
          code: "custom",
          message: "WEB_URL must use HTTPS in production",
          path: ["WEB_URL"],
        });
      }

      if (!environment.API_URL.startsWith("https://")) {
        context.addIssue({
          code: "custom",
          message: "API_URL must use HTTPS in production",
          path: ["API_URL"],
        });
      }
    }
  },
);

export type EnvironmentConfig = z.infer<typeof environmentSchema>;

export function parseEnvironment(
  input: Record<string, unknown> = process.env,
): EnvironmentConfig {
  return environmentSchema.parse(input);
}

export function getEnvironment(): EnvironmentConfig {
  return parseEnvironment();
}
