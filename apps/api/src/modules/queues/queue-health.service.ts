import { Injectable, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import Redis from "ioredis";

import { type EnvironmentConfig } from "@recourse/config";

import { QUEUE_NAMES } from "./queue.constants";
import { queueOptions, redisConnectionOptions } from "./redis-options";

export interface QueueHealth {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  oldestWaitingAt: Date | null;
  oldestWaitingAgeMs: number | null;
}

@Injectable()
export class QueueHealthService implements OnApplicationShutdown {
  private readonly queues = new Map<string, Queue>();
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService<EnvironmentConfig>) {
    const { url, ...redisOptions } = redisConnectionOptions(config, "producer");
    if (!url) {
      throw new Error("REDIS_URL is required for queue health.");
    }
    this.redis = new Redis(url, {
      ...redisOptions,
      lazyConnect: true,
    });
  }

  async getHealth(): Promise<QueueHealth[]> {
    return Promise.all(
      Object.values(QUEUE_NAMES).map(async (queueName) => {
        const queue = this.queue(queueName);
        await queue.waitUntilReady();
        const counts = await queue.getJobCounts(
          "waiting",
          "active",
          "delayed",
          "failed",
        );
        const oldest = await queue.getJobs("waiting", 0, 0, true);
        const oldestWaitingAt = oldest[0]?.timestamp
          ? new Date(oldest[0].timestamp)
          : null;

        return {
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          oldestWaitingAt,
          oldestWaitingAgeMs: oldestWaitingAt
            ? Math.max(0, Date.now() - oldestWaitingAt.getTime())
            : null,
          queue: queueName,
          waiting: counts.waiting ?? 0,
        };
      }),
    );
  }

  async ping(): Promise<void> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }
    await this.redis.ping();
  }

  async workerHeartbeat(): Promise<boolean> {
    if (this.redis.status === "wait") {
      await this.redis.connect();
    }
    return (await this.redis.exists(this.workerHeartbeatKey())) === 1;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(
      [...this.queues.values()].map((queue) => queue.close()),
    );
    if (this.redis.status === "wait") {
      this.redis.disconnect();
    } else if (this.redis.status !== "end") {
      await this.redis.quit();
    }
  }

  private workerHeartbeatKey(): string {
    return `${this.config.get("REDIS_PREFIX") ?? "recourse:local:"}worker-heartbeat:${this.config.get("WORKER_NAME") ?? "recourse-worker"}`;
  }

  private queue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        ...queueOptions(this.config, "producer"),
        skipWaitingForReady: false,
      });
      queue.on("error", () => undefined);
      this.queues.set(name, queue);
    }
    return queue;
  }
}
