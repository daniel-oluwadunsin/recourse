import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { SkipThrottle } from "@nestjs/throttler";
import { type Connection } from "mongoose";

import { type HealthResponse } from "@recourse/contracts";
import { QueueHealthService } from "../queues/queue-health.service";

@Controller("health")
@SkipThrottle()
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly queueHealth: QueueHealthService,
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
