import {
  type EvidenceBlockType,
  type EvidenceErrorCode,
  type EvidenceExtractionMethod,
} from "@recourse/contracts";

export interface ExtractedBlock {
  blockType: EvidenceBlockType;
  pageNumber: number | null;
  blockIndex: number;
  text: string;
  normalizedText: string;
  characterStart: number | null;
  characterEnd: number | null;
  extractionMethod: EvidenceExtractionMethod;
  provenance: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

export interface ExtractionResult {
  extractionMethod: EvidenceExtractionMethod;
  pageCount: number | null;
  blocks: ExtractedBlock[];
  metadata: Record<string, unknown>;
  fallbackAvailable: boolean;
}

export class ExtractionFailure extends Error {
  constructor(
    readonly code:
      EvidenceErrorCode | "UNSUPPORTED_FORMAT" | "INVALID_DOCUMENT",
    message: string,
  ) {
    super(message);
    this.name = "ExtractionFailure";
  }
}

export interface MultimodalExtractor {
  readonly available: false;
  extract(): Promise<never>;
}
