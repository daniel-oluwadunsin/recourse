import "reflect-metadata";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { AppModule } from "./app.module";

function waitForTermination(): Promise<void> {
  return new Promise((resolve) => {
    const onSignal = (): void => resolve();

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  const config = app.get<ConfigService<EnvironmentConfig>>(ConfigService);
  const logger = app.get(RecourseLogger);

  app.useLogger(logger);
  app.enableShutdownHooks();
  logger.log("Worker foundation started", "Bootstrap");
  const heartbeatInterval = config.get("WORKER_HEARTBEAT_INTERVAL_MS") ?? 30000;
  const heartbeat = setInterval(() => {
    logger.debug("Worker process heartbeat", "WorkerRuntime");
  }, heartbeatInterval);

  try {
    await waitForTermination();
  } finally {
    clearInterval(heartbeat);
    await app.close();
  }
}

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
