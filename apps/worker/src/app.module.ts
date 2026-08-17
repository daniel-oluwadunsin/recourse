import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { type EnvironmentConfig, parseEnvironment } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => parseEnvironment(config),
    }),
  ],
  providers: [
    {
      provide: RecourseLogger,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentConfig>) =>
        new RecourseLogger({
          service: "recourse-worker",
          environment: config.get("APP_ENV") ?? "local",
          level: config.get("LOG_LEVEL") ?? "info",
        }),
    },
  ],
})
export class AppModule {}
