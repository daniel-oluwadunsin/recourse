import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { type EnvironmentConfig } from "@recourse/config";

import { QueueProducerService } from "./queue-producer.service";

@Injectable()
export class QueueRuntimeBootstrapService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer: NodeJS.Timeout | null = null;
  private publishing = false;

  constructor(
    private readonly queueProducer: QueueProducerService,
    private readonly config: ConfigService<EnvironmentConfig>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureMaintenanceScheduler();
    const intervalMs = this.config.get("QUEUE_DISPATCH_INTERVAL_MS") ?? 5000;
    this.timer = setInterval(() => {
      void this.ensureMaintenanceScheduler();
    }, intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async ensureMaintenanceScheduler(): Promise<void> {
    if (this.publishing) {
      return;
    }
    this.publishing = true;
    try {
      await this.queueProducer.ensureMaintenanceScheduler();
    } catch {
      // MongoDB remains authoritative. The next bounded attempt repairs the
      // scheduler after a Redis/API/worker outage without blocking startup.
    } finally {
      this.publishing = false;
    }
  }
}
