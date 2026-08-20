import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { DocumentExtractionService } from "./document-extraction.service";
import { ExtractionFailure } from "./extraction.types";
import { EvidenceInputError, FilePolicyService } from "./file-policy.service";
import { EvidenceStateMachineService } from "./evidence-state-machine.service";
import {
  assertOpaqueStorageKey,
  createOpaqueStorageKey,
  StorageProviderError,
} from "../storage/storage.types";

describe("evidence file policy", () => {
  const policy = new FilePolicyService(
    new ConfigService({
      UPLOAD_MAX_BYTES_PDF: 10,
      UPLOAD_MAX_BYTES_TEXT: 10,
    }),
  );

  it("rejects path traversal and control characters in display filenames", () => {
    expect(() =>
      policy.normalizeUploadMetadata({
        byteSize: 10,
        mimeType: "application/pdf",
        originalFilename: "../notice.pdf",
      }),
    ).toThrowError(EvidenceInputError);
    expect(() =>
      policy.normalizeUploadMetadata({
        byteSize: 10,
        mimeType: "application/pdf",
        originalFilename: "notice\0.pdf",
      }),
    ).toThrowError(EvidenceInputError);
  });

  it("rejects MIME and extension mismatches and oversized uploads", () => {
    expect(() =>
      policy.normalizeUploadMetadata({
        byteSize: 10,
        mimeType: "application/pdf",
        originalFilename: "notice.exe",
      }),
    ).toThrowError("extension does not match");
    expect(() =>
      policy.normalizeUploadMetadata({
        byteSize: 11,
        mimeType: "application/pdf",
        originalFilename: "notice.pdf",
      }),
    ).toThrowError("exceeds");
  });

  it("rejects renamed executables and accepts a real PDF signature", () => {
    const metadata = policy.normalizeUploadMetadata({
      byteSize: 5,
      mimeType: "application/pdf",
      originalFilename: "notice.pdf",
    });
    expect(() =>
      policy.validateContentSignature(Buffer.from("MZ\0\0"), metadata),
    ).toThrow("content does not match");
    expect(() =>
      policy.validateContentSignature(Buffer.from("%PDF-1.7"), metadata),
    ).not.toThrow();
  });
});

describe("evidence state machine and opaque storage keys", () => {
  it("exposes and enforces every processing transition", () => {
    const machine = new EvidenceStateMachineService();
    for (const [from, targets] of Object.entries(machine.transitions())) {
      for (const target of targets) {
        expect(machine.canTransition(from as never, target)).toBe(true);
      }
    }
    expect(machine.canTransition("READY", "PROCESSING")).toBe(false);
    expect(machine.canTransition("DELETED", "READY")).toBe(false);
    expect(machine.canTransition("UPLOADED", "DELETING")).toBe(true);

    const key = createOpaqueStorageKey("recourse");
    expect(key).toMatch(/^recourse\/evidence\/[a-f0-9-]+\.bin$/);
    const textKey = createOpaqueStorageKey("recourse", "txt");
    expect(textKey).toMatch(/^recourse\/evidence\/[a-f0-9-]+\.txt$/);
    expect(() => createOpaqueStorageKey("recourse", "exe")).toThrowError(
      StorageProviderError,
    );
    expect(() => assertOpaqueStorageKey("recourse/../secret.bin")).toThrowError(
      StorageProviderError,
    );
  });
});

describe("native evidence extraction", () => {
  const extraction = new DocumentExtractionService(
    new ConfigService({ UPLOAD_MAX_PAGES: 2 }),
  );

  it("extracts plain text into provenance-bearing blocks", async () => {
    const result = await extraction.extract(
      Buffer.from("First paragraph\n\nSecond paragraph", "utf8"),
      {
        byteSize: 32,
        extension: "txt",
        mimeType: "text/plain",
        originalFilename: "note.txt",
      },
    );
    expect(result.extractionMethod).toBe("PLAIN_TEXT");
    expect(result.blocks.map((block) => block.text)).toEqual([
      "First paragraph",
      "Second paragraph",
    ]);
  });

  it("sanitizes HTML email content before producing text", async () => {
    const email = Buffer.from(
      [
        "From: sender@example.com",
        "To: owner@example.com",
        "Subject: Notice",
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=utf-8",
        "",
        '<p>Safe &amp; sound</p><script>ignore()</script><img src="https://tracker.invalid">',
      ].join("\r\n"),
    );
    const result = await extraction.extract(email, {
      byteSize: email.length,
      extension: "eml",
      mimeType: "message/rfc822",
      originalFilename: "notice.eml",
    });
    expect(result.blocks[0]?.text).toContain("Safe & sound");
    expect(result.blocks[0]?.text).not.toContain("ignore");
    expect(result.blocks[0]?.text).not.toContain("tracker.invalid");
  });

  it("extracts supported image metadata without pretending OCR ran", async () => {
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const result = await extraction.extract(onePixelPng, {
      byteSize: onePixelPng.length,
      extension: "png",
      mimeType: "image/png",
      originalFilename: "screen.png",
    });
    expect(result.extractionMethod).toBe("IMAGE_METADATA");
    expect(result.fallbackAvailable).toBe(true);
    expect(result.metadata.width).toBe(1);
  });

  it("reports malformed PDFs and DOCX files as parser failures", async () => {
    await expect(
      extraction.extract(Buffer.from("not a pdf"), {
        byteSize: 10,
        extension: "pdf",
        mimeType: "application/pdf",
        originalFilename: "broken.pdf",
      }),
    ).rejects.toBeInstanceOf(ExtractionFailure);
    await expect(
      extraction.extract(Buffer.from("not a docx"), {
        byteSize: 10,
        extension: "docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        originalFilename: "broken.docx",
      }),
    ).rejects.toBeInstanceOf(ExtractionFailure);
  });
});
