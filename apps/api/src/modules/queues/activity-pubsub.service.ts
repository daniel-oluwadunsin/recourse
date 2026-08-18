import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

const ACTIVITY_CHANNEL = "activity-events";

export interface ActivityNotification {
  caseId: string;
  sequence: number;
}

@Injectable()
export class ActivityPubSubService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly listeners = new Set<
    (notification: ActivityNotification) => void
  >();

  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly logger: RecourseLogger,
  ) {
    const url = config.getOrThrow("REDIS_URL");
    const options = {
      connectTimeout: config.get("REDIS_CONNECT_TIMEOUT_MS") ?? 10000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: (attempt: number) =>
        Math.min(1000 * 2 ** Math.min(attempt, 5), 20000),
    };
    this.publisher = new Redis(url, options);
    this.subscriber = new Redis(url, options);
    this.publisher.on("error", (error) =>
      this.logRedisError("publisher", error),
    );
    this.subscriber.on("error", (error) =>
      this.logRedisError("subscriber", error),
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.subscriber.connect();
      await this.subscriber.subscribe(this.channel());
      this.subscriber.on("message", (_channel, raw) => {
        try {
          const parsed = JSON.parse(raw) as ActivityNotification;
          if (
            typeof parsed.caseId === "string" &&
            Number.isInteger(parsed.sequence) &&
            parsed.sequence > 0
          ) {
            for (const listener of this.listeners) {
              listener(parsed);
            }
          }
        } catch (error: unknown) {
          this.logger.warn(
            `Ignored malformed activity notification: ${safeMessage(error)}`,
            "ActivityPubSub",
          );
        }
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Activity Pub/Sub unavailable at startup: ${safeMessage(error)}`,
        "ActivityPubSub",
      );
    }
  }

  on(listener: (notification: ActivityNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(notification: ActivityNotification): Promise<void> {
    try {
      if (this.publisher.status === "wait") {
        await this.publisher.connect();
      }
      await this.publisher.publish(
        this.channel(),
        JSON.stringify(notification),
      );
    } catch (error: unknown) {
      this.logger.debug(
        `Activity notification was not published: ${safeMessage(error)}`,
        "ActivityPubSub",
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()]);
  }

  private channel(): string {
    return `${this.config.get("REDIS_PREFIX") ?? "recourse:local:"}${ACTIVITY_CHANNEL}`;
  }

  private logRedisError(role: string, error: Error): void {
    this.logger.warn(
      `Redis ${role} error: ${safeMessage(error)}`,
      "ActivityPubSub",
    );
  }
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
