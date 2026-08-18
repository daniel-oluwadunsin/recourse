import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { CloudinaryStorageProvider } from "./cloudinary-storage.provider";

describe("Cloudinary storage provider", () => {
  it("does not pretend storage is available without credentials", async () => {
    const provider = new CloudinaryStorageProvider(new ConfigService({}));
    await expect(provider.healthCheck()).resolves.toMatchObject({
      provider: "cloudinary",
      status: "unconfigured",
    });
    await expect(
      provider.createUploadIntent({
        expiresAt: new Date(Date.now() + 60_000),
        storageKey:
          "recourse/evidence/00000000-0000-0000-0000-000000000000.bin",
      }),
    ).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
  });
});
