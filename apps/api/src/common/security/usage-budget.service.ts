import {
  HttpException,
  HttpStatus,
  Injectable,
  OnApplicationShutdown,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

import { type EnvironmentConfig } from "@recourse/config";
import { ApplicationObservabilityService } from "../observability.service";

export class UsageBudgetExceededError extends HttpException {
  constructor(readonly budget: string) {
    super(
      "This operation has reached its safety limit. Try again later.",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Fixed-window budgets stop repeated AI/retrieval/email work from becoming an
 * unbounded provider bill. Redis is authoritative in deployed environments;
 * memory mode exists only for isolated tests and local development.
 */
@Injectable()
export class UsageBudgetService implements OnApplicationShutdown {
  private redis: Redis | null = null;
  private readonly memory = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    @Optional()
    private readonly observability?: ApplicationObservabilityService,
  ) {}

  async consume(budget: string, key: string, limit: number): Promise<void> {
    if (limit < 1) throw new UsageBudgetExceededError(budget);
    const bucket = utcDay();
    const storageKey = `${this.config.get("REDIS_PREFIX") ?? "recourse:local:"}budget:${budget}:${key}:${bucket}`;
    const ttlSeconds = secondsUntilUtcDayEnds();

    if (this.config.get("RATE_LIMIT_STORAGE") === "memory") {
      const current = this.memory.get(storageKey);
      const now = Date.now();
      const next =
        current && current.expiresAt > now
          ? { count: current.count + 1, expiresAt: current.expiresAt }
          : { count: 1, expiresAt: now + ttlSeconds * 1000 };
      this.memory.set(storageKey, next);
      if (next.count > limit) {
        this.observability?.metrics.increment(
          "recourse_safety_budget_exhausted_total",
          {
            budget,
          },
        );
        throw new UsageBudgetExceededError(budget);
      }
      this.observability?.metrics.increment(
        "recourse_safety_budget_consumed_total",
        {
          budget,
        },
      );
      return;
    }

    try {
      const client = this.redisClient();
      const count = await client.incr(storageKey);
      if (count === 1) await client.expire(storageKey, ttlSeconds);
      if (count > limit) {
        this.observability?.metrics.increment(
          "recourse_safety_budget_exhausted_total",
          {
            budget,
          },
        );
        throw new UsageBudgetExceededError(budget);
      }
      this.observability?.metrics.increment(
        "recourse_safety_budget_consumed_total",
        {
          budget,
        },
      );
    } catch (error: unknown) {
      if (error instanceof UsageBudgetExceededError) throw error;
      throw new ServiceUnavailableException(
        "Safety budget service is unavailable.",
      );
    }
  }

  consumeAiCase(caseId: string): Promise<void> {
    return this.consume(
      "ai-case",
      caseId,
      this.config.get("AI_MAX_OPERATIONS_PER_CASE_DAY") ?? 50,
    );
  }

  consumeTavilyCase(caseId: string): Promise<void> {
    return this.consume(
      "tavily-case",
      caseId,
      this.config.get("TAVILY_MAX_PROCEDURE_RESOLUTIONS_PER_CASE_DAY") ?? 5,
    );
  }

  consumeOutboundEmail(ownerId: string): Promise<void> {
    return this.consume(
      "email-owner",
      ownerId,
      this.config.get("EMAIL_MAX_OUTBOUND_PER_USER_DAY") ?? 20,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis && this.redis.status !== "end") {
      await this.redis.quit().catch(() => this.redis?.disconnect());
    }
    this.redis = null;
  }

  private redisClient(): Redis {
    if (!this.redis) {
      this.redis = new Redis(this.config.getOrThrow("REDIS_URL"), {
        commandTimeout: this.config.get("REDIS_COMMAND_TIMEOUT_MS") ?? 5000,
        connectTimeout: this.config.get("REDIS_CONNECT_TIMEOUT_MS") ?? 10000,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (attempt: number) =>
          Math.min(1000 * 2 ** Math.min(attempt, 5), 10000),
      });
      this.redis.on("error", () => undefined);
    }
    return this.redis;
  }
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilUtcDayEnds(): number {
  const now = new Date();
  const tomorrow = new Date(`${utcDay()}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return Math.max(60, Math.ceil((tomorrow.getTime() - now.getTime()) / 1000));
}
