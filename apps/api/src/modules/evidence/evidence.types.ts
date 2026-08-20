import { type EvidenceDocument } from "./schemas/evidence.schema";

export interface EvidenceActor {
  actorId: string | null;
  actorType: "USER" | "SYSTEM";
  correlationId?: string;
}

export interface PublicEvidence {
  id: string;
  caseId: string;
  kind: EvidenceDocument["kind"];
  label: string | null;
  originalFilename: string | null;
  mimeType: string;
  extension: string;
  byteSize: number;
  sha256: string | null;
  processingStatus: EvidenceDocument["processingStatus"];
  malwareScanStatus: EvidenceDocument["malwareScanStatus"];
  extractionMethod: EvidenceDocument["extractionMethod"];
  pageCount: number | null;
  processingErrorCode: EvidenceDocument["processingErrorCode"];
  extractionMetadata: Record<string, unknown> | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}
