import "reflect-metadata";

import mongoose from "mongoose";

import { parseEnvironment } from "@recourse/config";

import {
  User,
  UserRole,
  UserSchema,
} from "../modules/users/schemas/user.schema";

async function grantAdmin(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error("Usage: pnpm --filter api admin:grant -- user@example.com");
  }

  const environment = parseEnvironment();
  const uri = environment.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required.");
  }

  const connection = await mongoose
    .createConnection(uri, {
      autoIndex: false,
      dbName: environment.MONGODB_DATABASE,
      serverSelectionTimeoutMS: environment.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    })
    .asPromise();

  try {
    const model = connection.model(User.name, UserSchema, "users");
    const result = await model.updateOne(
      { email },
      { $set: { role: UserRole.ADMIN } },
    );
    if (result.matchedCount !== 1) {
      throw new Error("No user matched the supplied email.");
    }
    process.stdout.write(`Granted ADMIN role to ${email}.\n`);
  } finally {
    await connection.close();
  }
}

void grantAdmin().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
