import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { SkipThrottle } from "@nestjs/throttler";
import { type Connection } from "mongoose";
import { type Request } from "express";
import { ConfigService } from "@nestjs/config";

import { type HealthResponse } from "@recourse/contracts";
import { type EnvironmentConfig } from "@recourse/config";
import { ApplicationObservabilityService } from "../../common/observability.service";
import { QueueHealthService } from "../queues/queue-health.service";

@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly queueHealth: QueueHealthService,
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly observability: ApplicationObservabilityService,
  ) {}

  @Get("live")
  live(): HealthResponse {
    return this.response();
  }

  @Get("ready")
  async ready(): Promise<HealthResponse> {
    if (this.connection.readyState !== 1 || !this.connection.db) {
      throw new ServiceUnavailableException("Service is not ready.");
    }

    try {
      await this.connection.db.command({ ping: 1 });
      await this.queueHealth.ping();
    } catch {
      throw new ServiceUnavailableException("Service is not ready.");
    }

    return this.response({ mongo: "ok", redis: "ok" });
  }

  @Get("worker")
  async worker(): Promise<HealthResponse> {
    try {
      if (!(await this.queueHealth.workerHeartbeat())) {
        throw new Error("Worker heartbeat is stale.");
      }
    } catch {
      throw new ServiceUnavailableException("Worker is not ready.");
    }

    return this.response({ worker: "ok" });
  }

  @Get("metrics")
  @SkipThrottle()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  metrics(@Req() request: Request): string {
    if (!this.config.get("METRICS_ENABLED")) {
      throw new NotFoundException();
    }
    const expected = this.config.get("METRICS_TOKEN");
    const supplied =
      request.get("x-metrics-token") ??
      bearerToken(request.get("authorization"));
    if (!expected || supplied !== expected) {
      throw new UnauthorizedException("Metrics authorization required.");
    }
    return this.observability.metrics.toPrometheus();
  }

  private response(checks: Record<string, "ok"> = {}): HealthResponse {
    return {
      status: "ok",
      service: "recourse-api",
      timestamp: new Date().toISOString(),
      checks: {
        process: "ok",
        ...checks,
      },
    };
  }
}

function bearerToken(value: string | undefined): string | undefined {
  const [scheme, token] = (value ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : undefined;
}
