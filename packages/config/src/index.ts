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
  QUEUE_MAINTENANCE_CONCURRENCY: z.coerce.number().int().min(1).default(1),
  QUEUE_DISPATCH_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
  QUEUE_BACKOFF_DELAY_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(3600000)
    .default(1000),
  QUEUE_COMPLETED_RETENTION: z.coerce.number().int().min(0).default(100),
  QUEUE_FAILED_RETENTION: z.coerce.number().int().min(1).default(1000),
  QUEUE_STALLED_INTERVAL_MS: z.coerce.number().int().min(1000).default(30000),
  QUEUE_PROCEDURE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
  QUEUE_PROCEDURE_RATE_LIMIT_DURATION_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(60000),
  QUEUE_AI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
  QUEUE_AI_RATE_LIMIT_DURATION_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(60000),
  QUEUE_EXTERNAL_ACTION_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .min(1)
    .default(5),
  QUEUE_EXTERNAL_ACTION_RATE_LIMIT_DURATION_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(60000),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).default(10000),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),

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
  OBJECT_STORAGE_PROVIDER: z.literal("cloudinary").default("cloudinary"),
  CLOUDINARY_CLOUD_NAME: optionalString,
  CLOUDINARY_API_KEY: optionalString,
  CLOUDINARY_API_SECRET: optionalString,
  CLOUDINARY_UPLOAD_FOLDER: z.string().min(1).default("recourse"),
  CLOUDINARY_UPLOAD_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  CLOUDINARY_DOWNLOAD_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(900)
    .default(300),
  LIVE_CLOUDINARY_CHECK: optionalBoolean.default(false),
  UPLOAD_MAX_BYTES_PDF: z.coerce
    .number()
    .int()
    .min(1)
    .default(25 * 1024 * 1024),
  UPLOAD_MAX_BYTES_DOCX: z.coerce
    .number()
    .int()
    .min(1)
    .default(15 * 1024 * 1024),
  UPLOAD_MAX_BYTES_EMAIL: z.coerce
    .number()
    .int()
    .min(1)
    .default(25 * 1024 * 1024),
  UPLOAD_MAX_BYTES_TEXT: z.coerce
    .number()
    .int()
    .min(1)
    .default(2 * 1024 * 1024),
  UPLOAD_MAX_BYTES_IMAGE: z.coerce
    .number()
    .int()
    .min(1)
    .default(15 * 1024 * 1024),
  UPLOAD_MAX_PAGES: z.coerce.number().int().min(1).max(1000).default(100),
  UPLOAD_MAX_IMAGE_PIXELS: z.coerce.number().int().min(1).default(40_000_000),
  GROQ_API_KEY: optionalString,
  GROQ_MODEL_FAST: z.string().min(1).default("openai/gpt-oss-20b"),
  GROQ_MODEL_REASONING: z.string().min(1).default("openai/gpt-oss-120b"),
  GROQ_MODEL_VISION: optionalString,
  GROQ_DEFAULT_REASONING_EFFORT: z
    .enum(["none", "low", "medium", "high"])
    .default("medium"),
  GROQ_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  GROQ_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  GROQ_RETRY_BASE_DELAY_MS: z.coerce
    .number()
    .int()
    .min(50)
    .max(60000)
    .default(500),
  EMBEDDING_PROVIDER: z.literal("voyage").default("voyage"),
  EMBEDDING_API_KEY: optionalString,
  EMBEDDING_MODEL: z.string().min(1).default("voyage-4-lite"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().min(1).max(8192).default(1024),
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(64),
  EMBEDDING_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(30000),
  EMBEDDING_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  EMBEDDING_RETRY_BASE_DELAY_MS: z.coerce
    .number()
    .int()
    .min(50)
    .max(60000)
    .default(500),
  VECTOR_SEARCH_INDEX_EVIDENCE: z
    .string()
    .min(1)
    .default("evidence_blocks_vector"),
  VECTOR_SEARCH_INDEX_PROCEDURE: z
    .string()
    .min(1)
    .default("procedure_source_chunks_vector"),
  ATLAS_SEARCH_INDEX_EVIDENCE: z
    .string()
    .min(1)
    .default("evidence_blocks_lexical"),
  ATLAS_SEARCH_INDEX_PROCEDURE: z
    .string()
    .min(1)
    .default("procedure_source_chunks_lexical"),
  VECTOR_SEARCH_NUM_CANDIDATES: z.coerce
    .number()
    .int()
    .min(10)
    .max(10000)
    .default(200),
  VECTOR_SEARCH_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  INTELLIGENCE_MAX_EVIDENCE_PER_ANALYSIS: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25),
  INTELLIGENCE_MAX_BLOCKS_PER_EVIDENCE: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100),
  INTELLIGENCE_MAX_CLAIMS_PER_ANALYSIS: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(250),
  INTELLIGENCE_MAX_CONTRADICTION_PAIRS: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100),
  TAVILY_API_KEY: optionalString,
  TAVILY_PROJECT_ID: optionalString,
  TAVILY_SEARCH_DEPTH: z.enum(["basic", "advanced"]).default("advanced"),
  TAVILY_EXTRACT_DEPTH: z.enum(["basic", "advanced"]).default("advanced"),
  TAVILY_SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(20).default(8),
  TAVILY_MAX_QUERIES_PER_PROCEDURE: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(3),
  TAVILY_MAX_EXTRACT_PAGES: z.coerce.number().int().min(1).max(20).default(8),
  TAVILY_CRAWL_MAX_DEPTH: z.coerce.number().int().min(1).max(5).default(2),
  TAVILY_CRAWL_MAX_BREADTH: z.coerce.number().int().min(1).max(500).default(20),
  TAVILY_CRAWL_MAX_PAGES: z.coerce.number().int().min(1).max(50).default(20),
  TAVILY_INCLUDE_USAGE: optionalBoolean.default(true),
  TAVILY_REQUEST_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(150)
    .default(60),
  TAVILY_MAX_CREDITS_PER_PROCEDURE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),
  TAVILY_USAGE_CACHE_TTL_MS: z.coerce.number().int().min(60000).default(600000),
  PROCEDURE_CACHE_TTL_HOURS: z.coerce.number().int().min(1).default(24),
  PROCEDURE_STALE_AFTER_HOURS: z.coerce.number().int().min(1).default(168),
  PROCEDURE_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.65),
  PROCEDURE_MAX_CLAIMS: z.coerce.number().int().min(1).max(100).default(50),

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

  EMAIL_PROVIDER: z.enum(["none", "gmail"]).default("none"),
  GMAIL_EMAIL: optionalString,
  GMAIL_APP_PASSWORD: optionalString,
  GMAIL_IMAP_HOST: z.string().min(1).default("imap.gmail.com"),
  GMAIL_IMAP_PORT: z.coerce.number().int().min(1).max(65535).default(993),
  GMAIL_IMAP_SECURE: optionalBoolean.default(true),
  GMAIL_IMAP_MAILBOX: z.string().min(1).default("INBOX"),
  EMAIL_FROM_NAME: z.string().min(1).max(120).default("Recourse"),
  EMAIL_INBOUND_ENABLED: optionalBoolean.default(false),
  EMAIL_INBOUND_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(10000)
    .default(60000),
  EMAIL_WEBHOOK_SECRET: optionalSecret,
  EMAIL_MAX_BODY_BYTES: z.coerce.number().int().min(1024).default(500000),
  EMAIL_MAX_ATTACHMENT_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(15 * 1024 * 1024),

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
  WORKER_HEARTBEAT_STALE_MS: z.coerce.number().int().min(1000).default(90000),
  SSE_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1000).default(15000),
  SSE_RETRY_MS: z.coerce.number().int().min(1000).default(5000),
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
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
        "GROQ_API_KEY",
        "TAVILY_API_KEY",
        "EMBEDDING_API_KEY",
      ] as const) {
        if (!environment[key]) {
          context.addIssue({
            code: "custom",
            message: `${key} is required in production`,
            path: [key],
          });
        }
      }

      if (environment.EMAIL_PROVIDER === "gmail") {
        for (const key of ["GMAIL_EMAIL", "GMAIL_APP_PASSWORD"] as const) {
          if (!environment[key]) {
            context.addIssue({
              code: "custom",
              message: `${key} is required when EMAIL_PROVIDER=gmail`,
              path: [key],
            });
          }
        }
      }

      if (!environment.GROQ_MODEL_VISION) {
        context.addIssue({
          code: "custom",
          message:
            "GROQ_MODEL_VISION must be explicitly selected in production",
          path: ["GROQ_MODEL_VISION"],
        });
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
