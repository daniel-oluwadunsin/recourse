import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hostname } from "node:os";
import Redis from "ioredis";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

@Injectable()
export class WorkerHeartbeatService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly redis: Redis;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly logger: RecourseLogger,
  ) {
    const url = config.getOrThrow("REDIS_URL");
    this.redis = new Redis(url, {
      connectTimeout: config.get("REDIS_CONNECT_TIMEOUT_MS") ?? 10000,
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
      retryStrategy: (attempt: number) =>
        Math.min(1000 * 2 ** Math.min(attempt, 5), 20000),
    });
    this.redis.on("error", (error) => {
      this.logger.warn(
        `Worker heartbeat Redis error: ${error.message}`,
        "WorkerHeartbeat",
      );
    });
  }

  async onModuleInit(): Promise<void> {
    await this.writeHeartbeat();
    const intervalMs = this.config.get("WORKER_HEARTBEAT_INTERVAL_MS") ?? 30000;
    this.interval = setInterval(() => {
      void this.writeHeartbeat();
    }, intervalMs);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    try {
      await this.redis.del(this.key());
    } finally {
      await this.redis.quit();
    }
  }

  private async writeHeartbeat(): Promise<void> {
    const ttlSeconds = Math.max(
      2,
      Math.ceil((this.config.get("WORKER_HEARTBEAT_STALE_MS") ?? 90000) / 1000),
    );
    await this.redis.set(
      this.key(),
      JSON.stringify({
        hostname: hostname(),
        pid: process.pid,
        updatedAt: new Date().toISOString(),
        worker: this.config.get("WORKER_NAME") ?? "recourse-worker",
      }),
      "EX",
      ttlSeconds,
    );
  }

  private key(): string {
    return `${this.config.get("REDIS_PREFIX") ?? "recourse:local:"}worker-heartbeat:${this.config.get("WORKER_NAME") ?? "recourse-worker"}`;
  }
}
