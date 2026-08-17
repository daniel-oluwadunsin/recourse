import { MiddlewareConsumer, Module, RequestMethod } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";

import { type EnvironmentConfig, parseEnvironment } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { AuthorizationModule } from "./common/authorization/authorization.module";
import { HttpErrorFilter } from "./common/http-error.filter";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => parseEnvironment(config),
    }),
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentConfig>) => {
        const options = {
          throttlers: [
            {
              limit: config.get("AUTH_RATE_LIMIT_LIMIT") ?? 10,
              ttl: config.get("AUTH_RATE_LIMIT_TTL_MS") ?? 60000,
            },
          ],
        };

        if (config.get("RATE_LIMIT_STORAGE") === "redis") {
          return {
            ...options,
            storage: new ThrottlerStorageRedisService(
              config.getOrThrow<string>("REDIS_URL"),
            ),
          };
        }

        return options;
      },
    }),
    AuthorizationModule,
    AuthModule,
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
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware)
      .forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
