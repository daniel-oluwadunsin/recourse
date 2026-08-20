import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";

export const STORAGE_PROVIDER = Symbol("STORAGE_PROVIDER");

export type StorageResourceType = "raw";

const storageKeyExtensions = [
  "bin",
  "docx",
  "eml",
  "gif",
  "jpeg",
  "jpg",
  "pdf",
  "png",
  "txt",
  "webp",
] as const;

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

export function createOpaqueStorageKey(
  folder: string,
  extension = "bin",
): string {
  const id = randomUUID();
  const normalizedExtension = normalizeStorageKeyExtension(extension);
  return `${folder.replace(/^\/+|\/+$/g, "")}/evidence/${id}.${normalizedExtension}`;
}

export function assertOpaqueStorageKey(storageKey: string): void {
  const extension = storageKey.split(".").at(-1)?.toLowerCase() ?? "";
  if (
    storageKey.length > 240 ||
    storageKey.includes("..") ||
    storageKey.includes("\\") ||
    storageKey.startsWith("/") ||
    !/^[-a-zA-Z0-9_/]+\.[a-z0-9]+$/.test(storageKey) ||
    !isStorageKeyExtension(extension)
  ) {
    throw new StorageProviderError("Storage key is invalid.", "INVALID_KEY");
  }
}

function normalizeStorageKeyExtension(value: string): string {
  const normalized = value.trim().replace(/^\./, "").toLowerCase();
  if (!isStorageKeyExtension(normalized)) {
    throw new StorageProviderError(
      "Storage key extension is invalid.",
      "INVALID_KEY",
    );
  }
  return normalized;
}

function isStorageKeyExtension(
  value: string,
): value is (typeof storageKeyExtensions)[number] {
  return storageKeyExtensions.includes(
    value as (typeof storageKeyExtensions)[number],
  );
}
