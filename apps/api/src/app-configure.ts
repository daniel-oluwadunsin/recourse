import cookieParser from "cookie-parser";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { type INestApplication } from "@nestjs/common";
import helmet from "helmet";
import type { NextFunction, Request, Response } from "express";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { HttpErrorFilter } from "./common/http-error.filter";
import { ApplicationObservabilityService } from "./common/observability.service";

export function configureHttpApplication(
  app: INestApplication,
  config: ConfigService<EnvironmentConfig>,
  logger: RecourseLogger,
  observability = new ApplicationObservabilityService(config),
): void {
  app.useLogger(logger);
  app.enableShutdownHooks();
  app
    .getHttpAdapter()
    .getInstance()
    .set("trust proxy", config.get("TRUST_PROXY") ?? false);
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "base-uri": ["'self'"],
          "default-src": ["'self'"],
          "frame-ancestors": ["'none'"],
          "object-src": ["'none'"],
          "script-src": ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  const allowedOrigins = new Set([
    config.get("WEB_URL") ?? "http://localhost:3000",
    ...splitOrigins(config.get("CORS_ALLOWED_ORIGINS")),
  ]);
  app.enableCors({
    allowedHeaders: [
      "Accept",
      "Authorization",
      "Content-Type",
      "Last-Event-ID",
      "X-Correlation-Id",
      "X-Request-Id",
    ],
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed."), false);
    },
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      isCookieMutationPath(request.path, config.get("API_PREFIX") ?? "/api/v1")
    ) {
      const origin = request.get("origin");
      if (origin && !allowedOrigins.has(origin)) {
        response.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "Request origin is not allowed.",
          },
        });
        return;
      }
    }
    next();
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const span = observability.tracing.startSpan("http.request", {
      "http.method": request.method,
      "http.route": request.path,
    });
    response.once("finish", () => {
      const labels = {
        method: request.method,
        route: request.path.slice(0, 120),
        status: String(response.statusCode),
      };
      observability.metrics.increment("recourse_http_requests_total", labels);
      observability.metrics.observe(
        "recourse_http_request_duration_ms",
        Date.now() - startedAt,
        labels,
      );
      span.setAttribute("http.status_code", response.statusCode);
      span.setAttribute("http.duration_ms", Date.now() - startedAt);
      span.end();
    });
    next();
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

function splitOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function isCookieMutationPath(path: string, prefix: string): boolean {
  const normalized = path.replace(/\/$/u, "");
  return (
    normalized === `${prefix}/auth/refresh` ||
    normalized === `${prefix}/auth/logout`
  );
}
