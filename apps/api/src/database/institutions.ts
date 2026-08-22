import "reflect-metadata";

import mongoose from "mongoose";

import { parseEnvironment } from "@recourse/config";

import { normalizeInstitutionName } from "../modules/cases/institutions.service";

const environment = parseEnvironment(process.env);

const trustedCatalog = [
  {
    aliases: ["YouTube Studio"],
    canonicalName: "YouTube",
    categories: ["digital platform", "creator platform"],
    domains: ["youtube.com", "support.google.com"],
    // support.google.com/youtube is YouTube's public first-party help center.
    verifiedOfficialDomains: ["youtube.com", "support.google.com"],
  },
  {
    aliases: ["Amazon Seller Central"],
    canonicalName: "Amazon",
    categories: ["digital platform", "marketplace"],
    domains: ["amazon.com", "sellercentral.amazon.com"],
    verifiedOfficialDomains: ["amazon.com", "sellercentral.amazon.com"],
  },
  {
    aliases: ["Stripe Payments"],
    canonicalName: "Stripe",
    categories: ["payment processor", "financial platform"],
    domains: ["stripe.com"],
    // Stripe's support and documentation sites are first-party subdomains.
    verifiedOfficialDomains: ["stripe.com"],
  },
] as const;

async function upsertTrustedInstitutions(): Promise<void> {
  if (!environment.MONGODB_URI) {
    throw new Error("MONGODB_URI must be set before running db:institutions");
  }
  const connection = await mongoose
    .createConnection(environment.MONGODB_URI, {
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
    const institutions = connection.collection("institutions");
    for (const entry of trustedCatalog) {
      const normalizedName = normalizeInstitutionName(entry.canonicalName);
      await institutions.updateOne(
        { normalizedName },
        {
          $set: {
            aliases: [...entry.aliases],
            canonicalName: entry.canonicalName,
            categories: [...entry.categories],
            domains: [...entry.domains],
            normalizedAliases: entry.aliases.map(normalizeInstitutionName),
            normalizedName,
            updatedAt: new Date(),
            verifiedOfficialDomains: [...entry.verifiedOfficialDomains],
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true },
      );
      process.stdout.write(`${entry.canonicalName}: trusted catalog ready\n`);
    }
  } finally {
    await connection.close();
  }
}

void upsertTrustedInstitutions().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
