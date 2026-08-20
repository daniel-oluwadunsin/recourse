import "api/sentry";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { RecourseLogger } from "@recourse/logger";
import { captureServerException } from "api/sentry";

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
  const logger = app.get(RecourseLogger);

  app.useLogger(logger);
  app.enableShutdownHooks();
  logger.log("Worker foundation started", "Bootstrap");
  try {
    await waitForTermination();
  } finally {
    try {
      await app.close();
    } catch (error: unknown) {
      captureServerException(error, { component: "worker-shutdown" });
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("Connection is closed") ||
        message.includes("Command timed out")
      ) {
        logger.warn(
          `Redis connection was already closed during worker shutdown: ${message}`,
          "Bootstrap",
        );
      } else {
        logger.error(`Worker shutdown failed: ${message}`, "Bootstrap");
        process.exitCode = 1;
      }
    }
  }
}

void bootstrap().catch((error: unknown) => {
  captureServerException(error, { component: "worker-bootstrap" });
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
