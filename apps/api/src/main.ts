import "reflect-metadata";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { configureHttpApplication } from "./app-configure";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<EnvironmentConfig>>(ConfigService);
  const logger = app.get(RecourseLogger);

  configureHttpApplication(app, config, logger);

  const port = config.get("API_PORT") ?? 4000;
  await app.listen(port);
  logger.log(`API listening on port ${port}`, "Bootstrap");
}

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
