import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import PostalMime from "postal-mime";
import sanitizeHtml from "sanitize-html";
import sharp from "sharp";

import { type EnvironmentConfig } from "@recourse/config";
import {
  type EvidenceBlockType,
  type EvidenceExtractionMethod,
} from "@recourse/contracts";

import { type NormalizedUploadMetadata } from "./file-policy.service";
import {
  ExtractionFailure,
  type ExtractionResult,
  type ExtractedBlock,
} from "./extraction.types";

@Injectable()
export class DocumentExtractionService {
  constructor(private readonly config: ConfigService<EnvironmentConfig>) {}

  async extract(
    buffer: Buffer,
    metadata: NormalizedUploadMetadata,
  ): Promise<ExtractionResult> {
    switch (metadata.extension) {
      case "pdf":
        return this.extractPdf(buffer);
      case "docx":
        return this.extractDocx(buffer);
      case "eml":
        return this.extractEmail(buffer);
      case "txt":
        return this.extractText(buffer);
      case "gif":
      case "jpeg":
      case "jpg":
      case "png":
      case "webp":
        return this.extractImage(buffer);
      default:
        throw new ExtractionFailure(
          "UNSUPPORTED_FORMAT",
          "This evidence format is not supported.",
        );
    }
  }

  private async extractPdf(buffer: Buffer): Promise<ExtractionResult> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const maxPages = this.config.get("UPLOAD_MAX_PAGES") ?? 100;
      if (result.pages.length > maxPages) {
        throw new ExtractionFailure(
          "PAGE_LIMIT_EXCEEDED",
          "The PDF exceeds the configured page limit.",
        );
      }

      let offset = 0;
      const blocks = result.pages
        .map((page) => {
          const text = page.text.trim();
          const block = createBlock(
            "PAGE_TEXT",
            page.num,
            page.num - 1,
            text,
            "PDF_TEXT",
            { pageNumber: page.num },
            offset,
          );
          offset += page.text.length;
          return block;
        })
        .filter((block): block is ExtractedBlock => block !== null);

      return {
        blocks,
        extractionMethod: "PDF_TEXT",
        fallbackAvailable: false,
        metadata: { pageCount: result.pages.length },
        pageCount: result.pages.length,
      };
    } catch (error) {
      if (error instanceof ExtractionFailure) {
        throw error;
      }
      throw new ExtractionFailure(
        "PARSER_FAILED",
        "The PDF could not be parsed safely.",
      );
    } finally {
      await parser.destroy();
    }
  }

  private async extractDocx(buffer: Buffer): Promise<ExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const blocks = paragraphsToBlocks(result.value, "DOCX_TEXT", "TEXT");
      return {
        blocks,
        extractionMethod: "DOCX_TEXT",
        fallbackAvailable: false,
        metadata: {
          parserWarnings: result.messages
            .filter((message) => message.type === "warning")
            .map(() => "DOCX_PARSER_WARNING"),
        },
        pageCount: null,
      };
    } catch {
      throw new ExtractionFailure(
        "PARSER_FAILED",
        "The DOCX document could not be parsed safely.",
      );
    }
  }

  private async extractEmail(buffer: Buffer): Promise<ExtractionResult> {
    try {
      const email = await PostalMime.parse(buffer, {
        attachmentEncoding: "arraybuffer",
        maxHeadersSize: 256 * 1024,
        maxNestingDepth: 32,
      });
      const htmlText = email.html ? htmlToSafeText(email.html) : "";
      const text = (email.text ?? htmlText).trim();
      const block = createBlock(
        "EMAIL_BODY",
        null,
        0,
        text,
        "EML_TEXT",
        null,
        0,
      );

      return {
        blocks: block ? [block] : [],
        extractionMethod: "EML_TEXT",
        fallbackAvailable: false,
        metadata: {
          attachmentCount: email.attachments.length,
          date: email.date ?? null,
          messageId: email.messageId ?? null,
          subject: email.subject ?? null,
        },
        pageCount: null,
      };
    } catch {
      throw new ExtractionFailure(
        "PARSER_FAILED",
        "The email could not be parsed safely.",
      );
    }
  }

  private extractText(buffer: Buffer): ExtractionResult {
    let value: string;
    try {
      value = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      throw new ExtractionFailure(
        "PARSER_FAILED",
        "The text file is not valid UTF-8.",
      );
    }

    return {
      blocks: paragraphsToBlocks(value, "PLAIN_TEXT", "TEXT"),
      extractionMethod: "PLAIN_TEXT",
      fallbackAvailable: false,
      metadata: {},
      pageCount: null,
    };
  }

  private async extractImage(buffer: Buffer): Promise<ExtractionResult> {
    try {
      const metadata = await sharp(buffer, {
        limitInputPixels:
          this.config.get("UPLOAD_MAX_IMAGE_PIXELS") ?? 40_000_000,
        failOn: "warning",
      }).metadata();
      if (!metadata.width || !metadata.height) {
        throw new ExtractionFailure(
          "PARSER_FAILED",
          "Image dimensions could not be determined.",
        );
      }

      const text = `Image metadata: ${metadata.width} x ${metadata.height} pixels.`;
      const block = createBlock(
        "IMAGE_METADATA",
        null,
        0,
        text,
        "IMAGE_METADATA",
        {
          format: metadata.format ?? null,
          height: metadata.height,
          width: metadata.width,
        },
        0,
      );

      return {
        blocks: block ? [block] : [],
        extractionMethod: "IMAGE_METADATA",
        fallbackAvailable: true,
        metadata: {
          format: metadata.format ?? null,
          height: metadata.height,
          pages: metadata.pages ?? 1,
          width: metadata.width,
        },
        pageCount: metadata.pages ?? 1,
      };
    } catch (error) {
      if (error instanceof ExtractionFailure) {
        throw error;
      }
      throw new ExtractionFailure(
        "PARSER_FAILED",
        "The image could not be parsed safely.",
      );
    }
  }
}

function paragraphsToBlocks(
  value: string,
  extractionMethod: EvidenceExtractionMethod,
  blockType: EvidenceBlockType,
): ExtractedBlock[] {
  let offset = 0;
  return value
    .split(/\n{2,}|\r\n{2,}/u)
    .map((paragraph, blockIndex) => {
      const block = createBlock(
        blockType,
        null,
        blockIndex,
        paragraph,
        extractionMethod,
        null,
        offset,
      );
      offset += paragraph.length + 2;
      return block;
    })
    .filter((block): block is ExtractedBlock => block !== null);
}

function createBlock(
  blockType: EvidenceBlockType,
  pageNumber: number | null,
  blockIndex: number,
  rawText: string,
  extractionMethod: EvidenceExtractionMethod,
  metadata: Record<string, unknown> | null,
  characterStart: number,
): ExtractedBlock | null {
  const text = rawText.trim();
  if (!text) {
    return null;
  }
  const normalizedText = text.replace(/\s+/gu, " ").trim();
  return {
    blockIndex,
    blockType,
    characterEnd: characterStart + rawText.length,
    characterStart,
    extractionMethod,
    metadata,
    normalizedText,
    pageNumber,
    provenance: pageNumber === null ? null : { pageNumber },
    text,
  };
}

function htmlToSafeText(html: string): string {
  const safeHtml = sanitizeHtml(html, {
    allowedAttributes: {},
    allowedTags: ["br", "div", "em", "li", "ol", "p", "span", "strong", "ul"],
    disallowedTagsMode: "discard",
  });

  return decodeEntities(
    safeHtml
      .replace(/<br\s*\/?\s*>/giu, "\n")
      .replace(/<\/(?:div|li|p)\s*>/giu, "\n")
      .replace(/<[^>]*>/gu, "")
      .replace(/[ \t]+/gu, " ")
      .replace(/\n{3,}/gu, "\n\n")
      .trim(),
  );
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(?:amp|apos|gt|lt|nbsp|quot|#(\d+)|#x([\da-f]+));/giu,
    (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      if (decimal) {
        return String.fromCodePoint(Number(decimal));
      }
      if (hexadecimal) {
        return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      }
      return (
        {
          "&amp;": "&",
          "&apos;": "'",
          "&gt;": ">",
          "&lt;": "<",
          "&nbsp;": " ",
          "&quot;": '"',
        }[entity.toLowerCase()] ?? entity
      );
    },
  );
}
