import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";

export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");

export type StorageResourceType = "raw";

export interface UploadIntent {
  uploadUrl: string;
  fields: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObjectMetadata {
  storageKey: string;
  resourceType: StorageResourceType;
  contentType: string | null;
  byteSize: number;
  assetId: string | null;
  version: string | null;
}

export interface DownloadAccess {
  url: string;
  expiresAt: Date;
}

export interface StorageHealth {
  status: "ok" | "unconfigured" | "error";
  provider: "cloudinary";
  message?: string;
}

export interface StorageProvider {
  createUploadIntent(input: {
    storageKey: string;
    expiresAt: Date;
  }): Promise<UploadIntent>;

  getObjectMetadata(storageKey: string): Promise<StoredObjectMetadata>;

  downloadObject(storageKey: string): Promise<Readable>;

  createDownloadAccess(
    storageKey: string,
    expiresAt: Date,
  ): Promise<DownloadAccess>;

  deleteObject(storageKey: string): Promise<void>;

  /**
   * Server-side upload is intentionally limited to bounded inbound artifacts
   * such as parsed email bodies. User uploads still use direct signed upload.
   */
  uploadObject?(input: {
    storageKey: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<StoredObjectMetadata>;

  healthCheck(): Promise<StorageHealth>;
}

export class StorageProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      "NOT_CONFIGURED" | "NOT_FOUND" | "PROVIDER_ERROR" | "INVALID_KEY",
  ) {
    super(message);
    this.name = "StorageProviderError";
  }
}

export function createOpaqueStorageKey(folder: string): string {
  const id = randomUUID();
  return `${folder.replace(/^\/+|\/+$/g, "")}/evidence/${id}.bin`;
}

export function assertOpaqueStorageKey(storageKey: string): void {
  if (
    storageKey.length > 240 ||
    storageKey.includes("..") ||
    storageKey.includes("\\") ||
    storageKey.startsWith("/") ||
    !/^[-a-zA-Z0-9_/]+\.bin$/.test(storageKey)
  ) {
    throw new StorageProviderError("Storage key is invalid.", "INVALID_KEY");
  }
}
