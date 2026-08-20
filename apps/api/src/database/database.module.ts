import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";

import { type EnvironmentConfig } from "@recourse/config";

function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentConfig>) => {
        const uri = config.get("MONGODB_URI");

        if (!uri) {
          throw new Error(
            "MONGODB_URI is required to start the API persistence layer",
          );
        }

        const maxPoolSize = optionalInteger(
          config.get("MONGODB_MAX_POOL_SIZE"),
        );
        const minPoolSize = optionalInteger(
          config.get("MONGODB_MIN_POOL_SIZE"),
        );

        return {
          autoIndex: config.get("MONGODB_AUTO_INDEX") ?? false,
          connectTimeoutMS: config.get("MONGODB_CONNECT_TIMEOUT_MS") ?? 10000,
          dbName: config.get("MONGODB_DATABASE") ?? "recourse",
          ...(maxPoolSize === undefined ? {} : { maxPoolSize }),
          ...(minPoolSize === undefined ? {} : { minPoolSize }),
          retryAttempts: 3,
          retryDelay: 1000,
          serverSelectionTimeoutMS:
            config.get("MONGODB_SERVER_SELECTION_TIMEOUT_MS") ?? 5000,
          socketTimeoutMS: config.get("MONGODB_SOCKET_TIMEOUT_MS") ?? 45000,
          uri,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
