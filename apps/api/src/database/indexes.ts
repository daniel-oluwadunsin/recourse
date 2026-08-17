import "reflect-metadata";

import mongoose from "mongoose";

import { parseEnvironment } from "@recourse/config";

import {
  AuthToken,
  AuthTokenSchema,
} from "../modules/auth/schemas/auth-token.schema";
import {
  RefreshToken,
  RefreshTokenSchema,
} from "../modules/auth/schemas/refresh-token.schema";
import {
  AuditLog,
  AuditLogSchema,
} from "../modules/audit/schemas/audit-log.schema";
import { User, UserSchema } from "../modules/users/schemas/user.schema";

const environment = parseEnvironment();

async function createAndVerifyIndexes(): Promise<void> {
  const uri = environment.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI must be set before running db:indexes");
  }

  const connection = await mongoose
    .createConnection(uri, {
      autoIndex: false,
      connectTimeoutMS: environment.MONGODB_CONNECT_TIMEOUT_MS,
      dbName: environment.MONGODB_DATABASE,
      maxPoolSize: environment.MONGODB_MAX_POOL_SIZE,
      minPoolSize: environment.MONGODB_MIN_POOL_SIZE,
      serverSelectionTimeoutMS: environment.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      socketTimeoutMS: environment.MONGODB_SOCKET_TIMEOUT_MS,
    })
    .asPromise();

  try {
    const definitions = [
      { collection: "users", name: User.name, schema: UserSchema },
      {
        collection: "refresh_tokens",
        name: RefreshToken.name,
        schema: RefreshTokenSchema,
      },
      {
        collection: "auth_tokens",
        name: AuthToken.name,
        schema: AuthTokenSchema,
      },
      {
        collection: "audit_logs",
        name: AuditLog.name,
        schema: AuditLogSchema,
      },
    ];

    for (const definition of definitions) {
      const model = connection.model(
        definition.name,
        definition.schema,
        definition.collection,
      );
      await model.createIndexes();

      const actualIndexes = await model.collection.listIndexes().toArray();
      const actualNames = new Set(actualIndexes.map((index) => index.name));
      const expectedNames = definition.schema
        .indexes()
        .map(([, options]) => options.name)
        .filter((name): name is string => Boolean(name));
      const missingNames = expectedNames.filter(
        (name) => !actualNames.has(name),
      );

      if (missingNames.length > 0) {
        throw new Error(
          `${definition.collection} is missing indexes: ${missingNames.join(", ")}`,
        );
      }

      process.stdout.write(
        `${definition.collection}: verified ${expectedNames.length} indexes\n`,
      );
    }
  } finally {
    await connection.close();
  }
}

void createAndVerifyIndexes().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
