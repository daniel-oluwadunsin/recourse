import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { type INestApplication } from "@nestjs/common";
import helmet from "helmet";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { HttpErrorFilter } from "./common/http-error.filter";

export function configureHttpApplication(
  app: INestApplication,
  config: ConfigService<EnvironmentConfig>,
  logger: RecourseLogger,
): void {
  app.useLogger(logger);
  app.enableShutdownHooks();
  app
    .getHttpAdapter()
    .getInstance()
    .set("trust proxy", config.get("TRUST_PROXY") ?? false);
  app.use(cookieParser());
  app.use(helmet());
  app.enableCors({
    credentials: true,
    origin: config.get("WEB_URL") ?? "http://localhost:3000",
  });
  app.setGlobalPrefix(config.get("API_PREFIX") ?? "/api/v1", {
    exclude: ["health/live", "health/ready"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(app.get(HttpErrorFilter));

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Recourse API")
    .setDescription("Recourse HTTP API")
    .setVersion("1.0")
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, swaggerDocument);
}
