import { randomUUID } from "node:crypto";

import type { ConfigService } from "@nestjs/config";

import { parseEnvironment } from "../packages/config/src/index.js";
import { CloudinaryStorageProvider } from "../apps/api/src/modules/storage/cloudinary-storage.provider.js";
import {
  createOpaqueStorageKey,
  StorageProviderError,
} from "../apps/api/src/modules/storage/storage.types.js";

async function main(): Promise<void> {
  const environment = parseEnvironment(process.env);
  if (!environment.LIVE_CLOUDINARY_CHECK) {
    throw new Error(
      "Set LIVE_CLOUDINARY_CHECK=true to authorize creation and deletion of a temporary Cloudinary object.",
    );
  }

  const config = {
    get: <K extends keyof typeof environment>(
      key: K,
    ): (typeof environment)[K] => environment[key],
  } as unknown as ConfigService<typeof environment>;
  const provider = new CloudinaryStorageProvider(config);
  const health = await provider.healthCheck();
  if (health.status !== "ok") {
    throw new Error(
      `Cloudinary health check failed: ${health.message ?? health.status}`,
    );
  }

  const storageKey = createOpaqueStorageKey(
    `${environment.CLOUDINARY_UPLOAD_FOLDER}/live-check-${randomUUID()}`,
    "txt",
  );
  const body = Buffer.from("recourse-cloudinary-live-check\n", "utf8");

  try {
    const intent = await provider.createUploadIntent({
      expiresAt: new Date(Date.now() + 120_000),
      storageKey,
    });
    const form = new FormData();
    for (const [key, value] of Object.entries(intent.fields)) {
      form.append(key, value);
    }
    form.append(
      "file",
      new Blob([body], { type: "text/plain" }),
      "live-check.txt",
    );
    const uploadResponse = await fetch(intent.uploadUrl, {
      body: form,
      method: "POST",
    });
    if (!uploadResponse.ok) {
      throw new Error("Cloudinary signed upload verification failed.");
    }

    const metadata = await provider.getObjectMetadata(storageKey);
    if (metadata.byteSize !== body.length) {
      throw new Error("Cloudinary metadata verification failed.");
    }

    const access = await provider.createDownloadAccess(
      storageKey,
      new Date(Date.now() + 120_000),
    );
    const response = await fetch(access.url);
    const downloaded = Buffer.from(await response.arrayBuffer());
    if (!response.ok || !downloaded.equals(body)) {
      throw new Error("Cloudinary signed download verification failed.");
    }
  } finally {
    await provider.deleteObject(storageKey);
  }

  try {
    await provider.getObjectMetadata(storageKey);
    throw new Error("Cloudinary deletion verification failed.");
  } catch (error) {
    if (
      !(error instanceof StorageProviderError) ||
      error.code !== "NOT_FOUND"
    ) {
      throw error;
    }
  }

  process.stdout.write(
    "Cloudinary live check passed: upload, metadata, signed download, delete.\n",
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
