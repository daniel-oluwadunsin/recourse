import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { type EnvironmentConfig } from "@recourse/config";

export type SupportedEvidenceMime =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "message/rfc822"
  | "application/octet-stream"
  | "text/plain"
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp";

export interface NormalizedUploadMetadata {
  originalFilename: string;
  extension: string;
  mimeType: SupportedEvidenceMime;
  byteSize: number;
}

export class EvidenceInputError extends Error {
  constructor(
    message: string,
    readonly code:
      | "MALICIOUS_FILENAME"
      | "UNSUPPORTED_MIME"
      | "MIME_EXTENSION_MISMATCH"
      | "FILE_TOO_LARGE"
      | "INTEGRITY_MISMATCH"
      | "INVALID_SHA256"
      | "CONTENT_SIGNATURE_MISMATCH"
      | "INVALID_TEXT",
  ) {
    super(message);
    this.name = "EvidenceInputError";
  }
}

const mimeByExtension: Record<string, readonly SupportedEvidenceMime[]> = {
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  eml: ["message/rfc822", "application/octet-stream"],
  gif: ["image/gif"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  pdf: ["application/pdf"],
  png: ["image/png"],
  txt: ["text/plain"],
  webp: ["image/webp"],
};

@Injectable()
export class FilePolicyService {
  constructor(private readonly config: ConfigService<EnvironmentConfig>) {}

  normalizeUploadMetadata(input: {
    originalFilename: string;
    mimeType: string;
    byteSize: number;
  }): NormalizedUploadMetadata {
    const originalFilename = normalizeFilename(input.originalFilename);
    const extension = getExtension(originalFilename);
    const mimeType = normalizeMimeType(input.mimeType);

    if (!mimeType || !isSupportedMime(mimeType)) {
      throw new EvidenceInputError(
        "This file type is not supported.",
        "UNSUPPORTED_MIME",
      );
    }

    if (!mimeByExtension[extension]?.includes(mimeType)) {
      throw new EvidenceInputError(
        "The file extension does not match its MIME type.",
        "MIME_EXTENSION_MISMATCH",
      );
    }

    if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1) {
      throw new EvidenceInputError("File size is invalid.", "FILE_TOO_LARGE");
    }

    const maximum = this.maximumBytes(mimeType);
    if (input.byteSize > maximum) {
      throw new EvidenceInputError(
        `File exceeds the configured ${maximum} byte limit.`,
        "FILE_TOO_LARGE",
      );
    }

    return {
      byteSize: input.byteSize,
      extension,
      mimeType,
      originalFilename,
    };
  }

  maximumBytes(mimeType: SupportedEvidenceMime): number {
    if (mimeType === "application/pdf") {
      return this.config.get("UPLOAD_MAX_BYTES_PDF") ?? 25 * 1024 * 1024;
    }
    if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return this.config.get("UPLOAD_MAX_BYTES_DOCX") ?? 15 * 1024 * 1024;
    }
    if (mimeType.startsWith("image/")) {
      return this.config.get("UPLOAD_MAX_BYTES_IMAGE") ?? 15 * 1024 * 1024;
    }
    if (mimeType === "text/plain") {
      return this.config.get("UPLOAD_MAX_BYTES_TEXT") ?? 2 * 1024 * 1024;
    }
    return this.config.get("UPLOAD_MAX_BYTES_EMAIL") ?? 25 * 1024 * 1024;
  }

  validateSha256(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
      throw new EvidenceInputError(
        "SHA-256 must be 64 hexadecimal characters.",
        "INVALID_SHA256",
      );
    }
    return normalized;
  }

  validateContentSignature(
    sample: Buffer,
    metadata: Pick<NormalizedUploadMetadata, "extension" | "mimeType">,
  ): void {
    const valid =
      metadata.mimeType === "application/pdf"
        ? sample.subarray(0, 5).toString("ascii") === "%PDF-"
        : metadata.mimeType === "image/png"
          ? sample
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : metadata.mimeType === "image/jpeg"
            ? sample.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
            : metadata.mimeType === "image/gif"
              ? /^(GIF87a|GIF89a)$/.test(
                  sample.subarray(0, 6).toString("ascii"),
                )
              : metadata.mimeType === "image/webp"
                ? sample.subarray(0, 4).toString("ascii") === "RIFF" &&
                  sample.subarray(8, 12).toString("ascii") === "WEBP"
                : metadata.extension === "docx"
                  ? sample.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
                  : isValidTextSample(sample);

    if (!valid) {
      throw new EvidenceInputError(
        "The file content does not match its declared type.",
        "CONTENT_SIGNATURE_MISMATCH",
      );
    }
  }

  maxPages(): number {
    return this.config.get("UPLOAD_MAX_PAGES") ?? 100;
  }

  maxImagePixels(): number {
    return this.config.get("UPLOAD_MAX_IMAGE_PIXELS") ?? 40_000_000;
  }
}

export function normalizeFilename(value: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (
    !normalized ||
    normalized.length > 255 ||
    normalized === "." ||
    normalized === ".." ||
    normalized.includes("\0") ||
    [...normalized].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (code >= 0 && code <= 31) || code === 127;
    }) ||
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new EvidenceInputError(
      "Filename contains an unsafe path or control character.",
      "MALICIOUS_FILENAME",
    );
  }

  return normalized.replace(/[ ]{2,}/gu, " ");
}

function getExtension(filename: string): string {
  const extension = filename.split(".").at(-1)?.toLowerCase() ?? "";
  if (!extension || extension === filename.toLowerCase()) {
    throw new EvidenceInputError(
      "A supported file extension is required.",
      "UNSUPPORTED_MIME",
    );
  }
  return extension;
}

function normalizeMimeType(value: string): SupportedEvidenceMime | null {
  const normalized = value.split(";", 1)[0]?.trim().toLowerCase();
  return isSupportedMime(normalized) ? normalized : null;
}

function isSupportedMime(
  value: string | undefined,
): value is SupportedEvidenceMime {
  return (
    value !== undefined &&
    Object.values(mimeByExtension).some((mimes) =>
      mimes.includes(value as SupportedEvidenceMime),
    )
  );
}

function isValidTextSample(sample: Buffer): boolean {
  if (sample.includes(0)) {
    return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}
