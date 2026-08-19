import { Readable } from "node:stream";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";

import { type EnvironmentConfig } from "@recourse/config";

import {
  assertOpaqueStorageKey,
  type DownloadAccess,
  type StorageHealth,
  type StorageProvider,
  StorageProviderError,
  type StoredObjectMetadata,
  type UploadIntent,
} from "./storage.types";

interface CloudinaryResourceResponse {
  asset_id?: string;
  bytes?: number;
  format?: string;
  public_id?: string;
  resource_type?: string;
  type?: string;
  version?: number;
}

@Injectable()
export class CloudinaryStorageProvider implements StorageProvider {
  private readonly cloudName: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService<EnvironmentConfig>) {
    this.cloudName = config.get("CLOUDINARY_CLOUD_NAME");
    this.apiKey = config.get("CLOUDINARY_API_KEY");
    this.apiSecret = config.get("CLOUDINARY_API_SECRET");
    this.configured = Boolean(this.cloudName && this.apiKey && this.apiSecret);

    if (this.configured) {
      cloudinary.config({
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        cloud_name: this.cloudName,
        signature_algorithm: "sha256",
        secure: true,
      });
    }
  }

  async createUploadIntent(input: {
    storageKey: string;
    expiresAt: Date;
  }): Promise<UploadIntent> {
    this.assertConfigured();
    assertOpaqueStorageKey(input.storageKey);

    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = {
      overwrite: false,
      public_id: input.storageKey,
      timestamp,
      type: "authenticated",
    };
    const signature = cloudinary.utils.api_sign_request(
      signedParams,
      this.apiSecret as string,
    );

    return {
      expiresAt: input.expiresAt,
      fields: {
        api_key: this.apiKey as string,
        overwrite: "false",
        public_id: input.storageKey,
        signature,
        timestamp: String(timestamp),
        type: "authenticated",
      },
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(this.cloudName as string)}/raw/upload`,
    };
  }

  async getObjectMetadata(storageKey: string): Promise<StoredObjectMetadata> {
    this.assertConfigured();
    assertOpaqueStorageKey(storageKey);

    try {
      const response = (await cloudinary.api.resource(storageKey, {
        resource_type: "raw",
        type: "authenticated",
      })) as CloudinaryResourceResponse;

      if (
        response.public_id !== storageKey ||
        response.resource_type !== "raw" ||
        typeof response.bytes !== "number"
      ) {
        throw new StorageProviderError(
          "Cloudinary returned incomplete object metadata.",
          "PROVIDER_ERROR",
        );
      }

      return this.toMetadata(response, storageKey);
    } catch (error) {
      if (error instanceof StorageProviderError) {
        throw error;
      }
      if (isCloudinaryNotFound(error)) {
        throw new StorageProviderError("Object was not found.", "NOT_FOUND");
      }
      throw new StorageProviderError(
        "Cloudinary metadata lookup failed.",
        "PROVIDER_ERROR",
      );
    }
  }

  async downloadObject(storageKey: string): Promise<Readable> {
    const access = await this.createDownloadAccess(
      storageKey,
      new Date(Date.now() + 5 * 60 * 1000),
    );
    const response = await fetch(access.url);

    if (!response.ok || !response.body) {
      throw new StorageProviderError(
        "Cloudinary object download failed.",
        response.status === 404 ? "NOT_FOUND" : "PROVIDER_ERROR",
      );
    }

    return Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
  }

  async createDownloadAccess(
    storageKey: string,
    expiresAt: Date,
  ): Promise<DownloadAccess> {
    this.assertConfigured();
    assertOpaqueStorageKey(storageKey);

    const expiry = Math.floor(expiresAt.getTime() / 1000);
    if (expiry <= Math.floor(Date.now() / 1000)) {
      throw new StorageProviderError(
        "Download access expiry must be in the future.",
        "PROVIDER_ERROR",
      );
    }

    return {
      expiresAt,
      url: cloudinary.utils.private_download_url(storageKey, "bin", {
        attachment: false,
        expires_at: expiry,
        resource_type: "raw",
        type: "authenticated",
      }),
    };
  }

  async deleteObject(storageKey: string): Promise<void> {
    this.assertConfigured();
    assertOpaqueStorageKey(storageKey);

    try {
      const response = (await cloudinary.uploader.destroy(storageKey, {
        invalidate: true,
        resource_type: "raw",
        type: "authenticated",
      })) as { result?: string };

      if (response.result !== "ok" && response.result !== "not found") {
        throw new StorageProviderError(
          "Cloudinary object deletion was not confirmed.",
          "PROVIDER_ERROR",
        );
      }
    } catch (error) {
      if (error instanceof StorageProviderError) {
        throw error;
      }
      throw new StorageProviderError(
        "Cloudinary object deletion failed.",
        "PROVIDER_ERROR",
      );
    }
  }

  async uploadObject(input: {
    storageKey: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<StoredObjectMetadata> {
    this.assertConfigured();
    assertOpaqueStorageKey(input.storageKey);

    try {
      const response = await new Promise<CloudinaryResourceResponse>(
        (resolve, reject) => {
          const upload = cloudinary.uploader.upload_stream(
            {
              context: { content_type: input.contentType },
              overwrite: false,
              public_id: input.storageKey,
              resource_type: "raw",
              type: "authenticated",
            },
            (error, result) => {
              if (error) {
                reject(error);
                return;
              }
              resolve((result ?? {}) as CloudinaryResourceResponse);
            },
          );
          Readable.from(input.bytes).pipe(upload);
        },
      );
      if (
        response.public_id !== input.storageKey ||
        response.resource_type !== "raw" ||
        typeof response.bytes !== "number"
      ) {
        throw new StorageProviderError(
          "Cloudinary returned incomplete upload metadata.",
          "PROVIDER_ERROR",
        );
      }
      return this.toMetadata(response, input.storageKey, input.contentType);
    } catch (error) {
      if (error instanceof StorageProviderError) {
        throw error;
      }
      throw new StorageProviderError(
        "Cloudinary object upload failed.",
        "PROVIDER_ERROR",
      );
    }
  }

  async healthCheck(): Promise<StorageHealth> {
    if (!this.configured) {
      return {
        message: "Cloudinary credentials are not configured.",
        provider: "cloudinary",
        status: "unconfigured",
      };
    }

    try {
      await cloudinary.api.ping();
      return { provider: "cloudinary", status: "ok" };
    } catch {
      return {
        message: "Cloudinary ping failed.",
        provider: "cloudinary",
        status: "error",
      };
    }
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new StorageProviderError(
        "Cloudinary storage is not configured.",
        "NOT_CONFIGURED",
      );
    }
  }

  private toMetadata(
    response: CloudinaryResourceResponse,
    storageKey: string,
    contentType: string | null = null,
  ): StoredObjectMetadata {
    return {
      assetId: response.asset_id ?? null,
      byteSize: response.bytes as number,
      contentType,
      resourceType: "raw",
      storageKey,
      version:
        typeof response.version === "number" ? String(response.version) : null,
    };
  }
}

function isCloudinaryNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { http_code?: unknown; message?: unknown };
  return (
    candidate.http_code === 404 ||
    (typeof candidate.message === "string" &&
      candidate.message.toLowerCase().includes("not found"))
  );
}
