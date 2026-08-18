import { type ConfigService } from "@nestjs/config";
import {
  type QueueOptions,
  type RedisOptions,
  type WorkerOptions,
} from "bullmq";

import { type EnvironmentConfig } from "@recourse/config";

export type RedisRuntimeRole = "producer" | "worker" | "pubsub";

export function redisConnectionOptions(
  config: ConfigService<EnvironmentConfig>,
  role: RedisRuntimeRole,
): RedisOptions {
  const isWorker = role === "worker";

  return {
    enableOfflineQueue: isWorker,
    maxRetriesPerRequest: isWorker ? null : 1,
    retryStrategy: (attempt: number) =>
      Math.min(Math.max(1000, 2 ** Math.min(attempt, 5) * 1000), 20000),
    url: config.getOrThrow("REDIS_URL"),
    connectTimeout: config.get("REDIS_CONNECT_TIMEOUT_MS") ?? 10000,
    ...(isWorker
      ? {}
      : { commandTimeout: config.get("REDIS_COMMAND_TIMEOUT_MS") ?? 5000 }),
  };
}

export function queueOptions(
  config: ConfigService<EnvironmentConfig>,
  role: RedisRuntimeRole,
): QueueOptions {
  return {
    connection: redisConnectionOptions(config, role),
    defaultJobOptions: {
      attempts: config.get("QUEUE_DEFAULT_ATTEMPTS") ?? 3,
      backoff: {
        delay: config.get("QUEUE_BACKOFF_DELAY_MS") ?? 1000,
        jitter: 0.25,
        type: "exponential",
      },
      removeOnComplete: {
        count: config.get("QUEUE_COMPLETED_RETENTION") ?? 100,
      },
      removeOnFail: {
        count: config.get("QUEUE_FAILED_RETENTION") ?? 1000,
      },
      stackTraceLimit: 10,
    },
    prefix: config.get("REDIS_PREFIX") ?? "recourse:local:",
    skipWaitingForReady: role === "producer",
  };
}

export function workerOptions(
  config: ConfigService<EnvironmentConfig>,
  concurrency: number,
  limiter?: WorkerOptions["limiter"],
): WorkerOptions {
  return {
    ...queueOptions(config, "worker"),
    concurrency,
    limiter,
    maxStalledCount: 1,
    stalledInterval: config.get("QUEUE_STALLED_INTERVAL_MS") ?? 30000,
    name: config.get("WORKER_NAME") ?? "recourse-worker",
  };
}
