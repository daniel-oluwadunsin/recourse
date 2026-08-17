import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
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

const logLevelSchema = z.enum([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
]);

export const environmentSchema = z.object({
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
  GROQ_API_KEY: optionalString,
  TAVILY_API_KEY: optionalString,

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

export type EnvironmentConfig = z.infer<typeof environmentSchema>;

export function parseEnvironment(
  input: Record<string, unknown> = process.env,
): EnvironmentConfig {
  return environmentSchema.parse(input);
}

export function getEnvironment(): EnvironmentConfig {
  return parseEnvironment();
}
