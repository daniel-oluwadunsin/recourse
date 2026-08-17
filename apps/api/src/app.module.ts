import { MiddlewareConsumer, Module, RequestMethod } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { type EnvironmentConfig, parseEnvironment } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { HttpErrorFilter } from "./common/http-error.filter";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => parseEnvironment(config),
    }),
    HealthModule,
  ],
  providers: [
    {
      provide: RecourseLogger,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentConfig>) =>
        new RecourseLogger({
          service: "recourse-api",
          environment: config.get("APP_ENV") ?? "local",
          level: config.get("LOG_LEVEL") ?? "info",
        }),
    },
    HttpErrorFilter,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
