import { createHash } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { Connection, isValidObjectId, Model, Types } from "mongoose";

import { type EnvironmentConfig } from "@recourse/config";

import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { CaseEventService } from "../cases/case-events.service";
import { Case } from "../cases/schemas/case.schema";
import { type CaseActor } from "../cases/cases.types";
import { EvidenceDeletedError, toEvidenceHttpError } from "./evidence.errors";
import {
  EvidenceInputError,
  FilePolicyService,
  type NormalizedUploadMetadata,
} from "./file-policy.service";
import { DocumentExtractionService } from "./document-extraction.service";
import { ExtractionFailure, type ExtractionResult } from "./extraction.types";
import { EvidenceStateMachineService } from "./evidence-state-machine.service";
import { Evidence, type EvidenceDocument } from "./schemas/evidence.schema";
import {
  EvidenceBlock,
  type EvidenceBlockDocument,
} from "./schemas/evidence-block.schema";
import { type EvidenceActor, type PublicEvidence } from "./evidence.types";
import {
  createOpaqueStorageKey,
  STORAGE_PROVIDER,
  StorageProviderError,
  type StorageProvider,
} from "../storage/storage.types";

const MAX_EVIDENCE_PAGE_SIZE = 50;
const HASH_SAMPLE_BYTES = 8192;

@Injectable()
export class EvidenceService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Case.name) private readonly caseModel: Model<Case>,
    @InjectModel(Evidence.name)
    private readonly evidenceModel: Model<Evidence>,
    @InjectModel(EvidenceBlock.name)
    private readonly evidenceBlockModel: Model<EvidenceBlock>,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly filePolicy: FilePolicyService,
    private readonly extraction: DocumentExtractionService,
    private readonly stateMachine: EvidenceStateMachineService,
    private readonly caseEventService: CaseEventService,
    private readonly ownership: OwnershipAuthorizationService,
  ) {}

  async createUploadIntent(
    ownerId: string,
    caseId: string,
    input: {
      originalFilename: string;
      mimeType: string;
      byteSize: number;
      kind: Evidence["kind"];
      label?: string | null;
    },
  ): Promise<{
    evidenceId: string;
    uploadUrl: string;
    fields: Record<string, string>;
    expiresAt: Date;
    maxBytes: number;
  }> {
    const activeCase = await this.findOwnedCase(ownerId, caseId);
    const normalized = this.normalizeInput(input);
    const storageKey = createOpaqueStorageKey(
      this.config.get("CLOUDINARY_UPLOAD_FOLDER") ?? "recourse",
    );
    const expiresAt = new Date(
      Date.now() +
        (this.config.get("CLOUDINARY_UPLOAD_TTL_SECONDS") ?? 900) * 1000,
    );

    try {
      const intent = await this.storage.createUploadIntent({
        expiresAt,
        storageKey,
      });
      const evidence = await this.evidenceModel.create({
        byteSize: normalized.byteSize,
        caseId: activeCase._id,
        deletedAt: null,
        deletionVersion: 0,
        extension: normalized.extension,
        extractionCompletedAt: null,
        extractionMetadata: null,
        extractionMethod: null,
        kind: input.kind,
        label: input.label?.trim() || null,
        mimeType: normalized.mimeType,
        originalFilename: normalized.originalFilename,
        ownerId: activeCase.ownerId,
        pageCount: null,
        processingErrorCode: null,
        processingErrorMessage: null,
        processingStatus: "UPLOADING",
        revision: 0,
        sha256: null,
        storageAssetId: null,
        storageKey,
        storageVersion: null,
        uploadExpiresAt: intent.expiresAt,
      });

      return {
        evidenceId: evidence._id.toString(),
        expiresAt: intent.expiresAt,
        fields: intent.fields,
        maxBytes: this.filePolicy.maximumBytes(normalized.mimeType),
        uploadUrl: intent.uploadUrl,
      };
    } catch (error) {
      throw toEvidenceHttpError(error);
    }
  }

  async completeUpload(
    ownerId: string,
    caseId: string,
    input: { evidenceId: string; sha256?: string },
    actor: EvidenceActor,
  ): Promise<PublicEvidence> {
    const evidence = await this.findOwnedEvidence(
      ownerId,
      caseId,
      input.evidenceId,
      false,
    );
    if (evidence.processingStatus === "UPLOADED") {
      return this.toPublic(evidence);
    }
    if (evidence.processingStatus !== "UPLOADING") {
      throw new ConflictException(
        "Evidence is not awaiting upload completion.",
      );
    }
    if (evidence.uploadExpiresAt.getTime() <= Date.now()) {
      await this.safeDeleteObject(evidence.storageKey);
      await this.markFailed(
        evidence,
        "INTEGRITY_MISMATCH",
        "The upload intent expired before completion.",
      );
      throw new ConflictException("The upload intent has expired.");
    }

    const expectedSha256 = this.filePolicy.validateSha256(input.sha256);
    const normalized = this.normalizedFromEvidence(evidence);

    try {
      const metadata = await this.storage.getObjectMetadata(
        evidence.storageKey,
      );
      if (
        metadata.byteSize !== evidence.byteSize ||
        metadata.byteSize > this.filePolicy.maximumBytes(normalized.mimeType)
      ) {
        throw new EvidenceInputError(
          "Uploaded object size does not match the declared file.",
          "FILE_TOO_LARGE",
        );
      }

      const hashed = await hashAndSample(
        await this.storage.downloadObject(evidence.storageKey),
        this.filePolicy.maximumBytes(normalized.mimeType),
      );
      this.filePolicy.validateContentSignature(hashed.sample, normalized);
      if (expectedSha256 && expectedSha256 !== hashed.sha256) {
        throw new EvidenceInputError(
          "Uploaded object integrity check failed.",
          "INTEGRITY_MISMATCH",
        );
      }

      const duplicate = await this.evidenceModel
        .findOne({
          _id: { $ne: evidence._id },
          caseId: evidence.caseId,
          deletedAt: null,
          sha256: hashed.sha256,
        })
        .select({ _id: 1 })
        .exec();
      if (duplicate) {
        await this.safeDeleteObject(evidence.storageKey);
        await this.markFailed(
          evidence,
          "DUPLICATE_CONTENT",
          "This file is already attached to the case.",
        );
        throw new ConflictException(
          "This file is already attached to the case.",
        );
      }

      const updated = await this.connection.transaction(async (session) => {
        const result = await this.evidenceModel.findOneAndUpdate(
          {
            _id: evidence._id,
            deletedAt: null,
            processingStatus: "UPLOADING",
            revision: evidence.revision,
          },
          {
            $inc: { revision: 1 },
            $set: {
              processingStatus: "UPLOADED",
              sha256: hashed.sha256,
              storageAssetId: metadata.assetId,
              storageVersion: metadata.version,
            },
          },
          { returnDocument: "after", session },
        );
        if (!result) {
          throw new ConflictException(
            "Evidence upload completion raced another mutation.",
          );
        }

        await this.caseEventService.appendInSession(
          {
            actor: toCaseActor(actor),
            caseId,
            idempotencyKey: `evidence-uploaded:${evidence._id.toString()}:${evidence.revision}`,
            payload: {
              evidenceId: evidence._id.toString(),
              sha256: hashed.sha256,
            },
            type: "EVIDENCE_UPLOADED",
          },
          session,
        );
        return result;
      });

      return this.toPublic(updated);
    } catch (error) {
      if (
        error instanceof EvidenceInputError ||
        error instanceof StorageProviderError
      ) {
        await this.safeDeleteObject(evidence.storageKey);
        await this.markFailed(
          evidence,
          error instanceof EvidenceInputError
            ? error.code === "CONTENT_SIGNATURE_MISMATCH"
              ? "MIME_SIGNATURE_MISMATCH"
              : "INTEGRITY_MISMATCH"
            : "INTEGRITY_MISMATCH",
          "Uploaded evidence failed integrity verification.",
        );
      } else if (isMongoDuplicateKeyError(error)) {
        await this.safeDeleteObject(evidence.storageKey);
        await this.markFailed(
          evidence,
          "DUPLICATE_CONTENT",
          "This file is already attached to the case.",
        );
        throw new ConflictException(
          "This file is already attached to the case.",
        );
      }
      throw toEvidenceHttpError(error);
    }
  }

  async list(
    ownerId: string,
    caseId: string,
    options: { cursor?: string; limit: number },
  ): Promise<{
    items: PublicEvidence[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    await this.findOwnedCase(ownerId, caseId);
    const limit = Math.min(options.limit, MAX_EVIDENCE_PAGE_SIZE);
    const filter: Record<string, unknown> = this.ownership.withOwnerScope(
      ownerId,
      { caseId: this.toObjectId(caseId), deletedAt: null },
    );
    if (options.cursor) {
      const cursor = decodeEvidenceCursor(options.cursor);
      if (!cursor) {
        throw new BadRequestException("cursor is invalid.");
      }
      filter.$or = [
        { createdAt: { $lt: new Date(cursor.createdAt) } },
        {
          _id: { $lt: new Types.ObjectId(cursor.id) },
          createdAt: new Date(cursor.createdAt),
        },
      ];
    }

    const documents = await this.evidenceModel
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();
    const hasMore = documents.length > limit;
    const page = hasMore ? documents.slice(0, limit) : documents;
    const last = page.at(-1);
    return {
      hasMore,
      items: page.map((document) => this.toPublic(document)),
      nextCursor:
        hasMore && last
          ? encodeEvidenceCursor({
              createdAt: last.createdAt.toISOString(),
              id: last._id.toString(),
              version: 1,
            })
          : null,
    };
  }

  async get(
    ownerId: string,
    caseId: string,
    evidenceId: string,
  ): Promise<PublicEvidence> {
    return this.toPublic(
      await this.findOwnedEvidence(ownerId, caseId, evidenceId, false),
    );
  }

  async downloadAccess(
    ownerId: string,
    caseId: string,
    evidenceId: string,
  ): Promise<{ url: string; expiresAt: Date; filename: string | null }> {
    const evidence = await this.findOwnedEvidence(
      ownerId,
      caseId,
      evidenceId,
      false,
    );
    if (evidence.processingStatus === "DELETING") {
      throw new ConflictException("Evidence is being deleted.");
    }
    const expiresAt = new Date(
      Date.now() +
        (this.config.get("CLOUDINARY_DOWNLOAD_TTL_SECONDS") ?? 300) * 1000,
    );
    try {
      const access = await this.storage.createDownloadAccess(
        evidence.storageKey,
        expiresAt,
      );
      return {
        expiresAt: access.expiresAt,
        filename: evidence.originalFilename,
        url: access.url,
      };
    } catch (error) {
      throw toEvidenceHttpError(error);
    }
  }

  async delete(
    ownerId: string,
    caseId: string,
    evidenceId: string,
    actor: EvidenceActor,
  ): Promise<void> {
    await this.findOwnedCase(ownerId, caseId);
    const evidence = await this.findOwnedEvidence(
      ownerId,
      caseId,
      evidenceId,
      true,
    );
    if (evidence.processingStatus === "DELETED") {
      return;
    }

    if (evidence.processingStatus !== "DELETING") {
      this.stateMachine.assertTransition(evidence.processingStatus, "DELETING");
      const marked = await this.evidenceModel.findOneAndUpdate(
        {
          _id: evidence._id,
          deletedAt: null,
          ownerId: new Types.ObjectId(ownerId),
          revision: evidence.revision,
        },
        {
          $inc: { deletionVersion: 1, revision: 1 },
          $set: { deletedAt: new Date(), processingStatus: "DELETING" },
        },
        { returnDocument: "after" },
      );
      if (!marked) {
        throw new ConflictException(
          "Evidence deletion raced another mutation.",
        );
      }
    }

    try {
      await this.storage.deleteObject(evidence.storageKey);
    } catch (error) {
      await this.evidenceModel.updateOne(
        {
          _id: evidence._id,
          deletedAt: { $ne: null },
          processingStatus: "DELETING",
        },
        {
          $inc: { revision: 1 },
          $set: {
            processingErrorCode: "DELETION_FAILED",
            processingErrorMessage: "Evidence storage deletion requires retry.",
          },
        },
      );
      throw toEvidenceHttpError(error);
    }

    await this.connection.transaction(async (session) => {
      const updated = await this.evidenceModel.findOneAndUpdate(
        {
          _id: evidence._id,
          processingStatus: "DELETING",
          deletedAt: { $ne: null },
        },
        {
          $inc: { revision: 1 },
          $set: {
            processingErrorCode: null,
            processingErrorMessage: null,
            processingStatus: "DELETED",
          },
        },
        { returnDocument: "after", session },
      );
      if (!updated) {
        return;
      }
      await this.evidenceBlockModel.deleteMany(
        { evidenceId: evidence._id },
        { session },
      );
      await this.caseEventService.appendInSession(
        {
          actor: toCaseActor(actor),
          caseId,
          idempotencyKey: `evidence-deleted:${evidence._id.toString()}:${updated.deletionVersion}`,
          payload: { evidenceId: evidence._id.toString() },
          type: "EVIDENCE_DELETED",
        },
        session,
      );
    });
  }

  async process(
    evidenceId: string,
    expectedRevision: number,
    actor: EvidenceActor = { actorId: null, actorType: "SYSTEM" },
  ): Promise<PublicEvidence> {
    const evidence = await this.findById(evidenceId, true);
    if (evidence.deletedAt || evidence.processingStatus === "DELETED") {
      throw new EvidenceDeletedError();
    }
    const activeCase = await this.caseModel
      .findOne({ _id: evidence.caseId, deletedAt: null })
      .select({ _id: 1 })
      .exec();
    if (!activeCase) {
      throw new EvidenceDeletedError();
    }
    if (evidence.revision !== expectedRevision) {
      throw new ConflictException("Evidence revision is stale.");
    }
    this.stateMachine.assertTransition(evidence.processingStatus, "PROCESSING");

    const processing = await this.evidenceModel.findOneAndUpdate(
      {
        _id: evidence._id,
        deletedAt: null,
        processingStatus: { $in: ["UPLOADED", "QUEUED", "FAILED"] },
        revision: expectedRevision,
      },
      { $inc: { revision: 1 }, $set: { processingStatus: "PROCESSING" } },
      { returnDocument: "after" },
    );
    if (!processing) {
      throw new ConflictException(
        "Evidence processing was already started or cancelled.",
      );
    }

    let result: ExtractionResult;
    try {
      const normalized = this.normalizedFromEvidence(processing);
      const buffer = await readStreamIntoBuffer(
        await this.storage.downloadObject(processing.storageKey),
        this.filePolicy.maximumBytes(normalized.mimeType),
      );
      result = await this.extraction.extract(buffer, normalized);
    } catch (error) {
      const failure = error instanceof ExtractionFailure ? error : null;
      const status =
        failure?.code === "UNSUPPORTED_FORMAT" ? "UNSUPPORTED" : "FAILED";
      const errorCode =
        failure?.code === "UNSUPPORTED_FORMAT"
          ? "UNSUPPORTED_FORMAT"
          : "PARSER_FAILED";
      await this.markProcessingFailure(
        processing,
        status,
        errorCode,
        failure?.message ?? "Evidence extraction failed.",
      );
      throw error instanceof Error
        ? error
        : new Error("Evidence extraction failed.");
    }

    const completed = await this.connection.transaction(async (session) => {
      const current = await this.evidenceModel
        .findOne({
          _id: processing._id,
          deletedAt: null,
          revision: processing.revision,
          processingStatus: "PROCESSING",
        })
        .session(session)
        .exec();
      if (!current) {
        throw new EvidenceDeletedError();
      }

      await this.evidenceBlockModel.deleteMany(
        { evidenceId: current._id },
        { session },
      );
      if (result.blocks.length > 0) {
        await this.evidenceBlockModel.insertMany(
          result.blocks.map((block) => ({
            ...block,
            caseId: current.caseId,
            evidenceId: current._id,
            ownerId: current.ownerId,
          })),
          { session },
        );
      }

      const updated = await this.evidenceModel.findOneAndUpdate(
        {
          _id: current._id,
          deletedAt: null,
          revision: current.revision,
          processingStatus: "PROCESSING",
        },
        {
          $inc: { revision: 1 },
          $set: {
            extractionCompletedAt: new Date(),
            extractionMetadata: {
              ...result.metadata,
              fallbackAvailable: result.fallbackAvailable,
            },
            extractionMethod: result.extractionMethod,
            pageCount: result.pageCount,
            processingErrorCode: null,
            processingErrorMessage: null,
            processingStatus: "READY",
          },
        },
        { returnDocument: "after", session },
      );
      if (!updated) {
        throw new EvidenceDeletedError();
      }
      await this.caseEventService.appendInSession(
        {
          actor: toCaseActor(actor),
          caseId: current.caseId.toString(),
          idempotencyKey: `evidence-processed:${current._id.toString()}:${current.revision}`,
          payload: {
            blockCount: result.blocks.length,
            evidenceId: current._id.toString(),
            extractionMethod: result.extractionMethod,
          },
          type: "EVIDENCE_PROCESSED",
        },
        session,
      );
      return updated;
    });

    return this.toPublic(completed);
  }

  async listBlocks(
    ownerId: string,
    caseId: string,
    evidenceId: string,
  ): Promise<EvidenceBlockDocument[]> {
    const evidence = await this.findOwnedEvidence(
      ownerId,
      caseId,
      evidenceId,
      false,
    );
    return this.evidenceBlockModel
      .find({ evidenceId: evidence._id, ownerId: new Types.ObjectId(ownerId) })
      .sort({ blockIndex: 1 })
      .exec();
  }

  private async findOwnedCase(
    ownerId: string,
    caseId: string,
  ): Promise<Case & { _id: Types.ObjectId }> {
    if (!isValidObjectId(caseId)) {
      throw new NotFoundException("Case not found.");
    }
    const document = await this.caseModel
      .findOne(
        this.ownership.withOwnerScope(ownerId, {
          _id: new Types.ObjectId(caseId),
          deletedAt: null,
        }),
      )
      .exec();
    if (!document) {
      throw new NotFoundException("Case not found.");
    }
    return document;
  }

  private async findOwnedEvidence(
    ownerId: string,
    caseId: string,
    evidenceId: string,
    includeDeleted: boolean,
  ): Promise<EvidenceDocument> {
    if (!isValidObjectId(evidenceId) || !isValidObjectId(caseId)) {
      throw new NotFoundException("Evidence not found.");
    }
    const filter: Record<string, unknown> = this.ownership.withOwnerScope(
      ownerId,
      {
        _id: new Types.ObjectId(evidenceId),
        caseId: new Types.ObjectId(caseId),
      },
    );
    if (!includeDeleted) {
      filter.deletedAt = null;
    }
    const evidence = await this.evidenceModel.findOne(filter).exec();
    if (!evidence) {
      throw new NotFoundException("Evidence not found.");
    }
    return evidence;
  }

  private async findById(
    evidenceId: string,
    includeDeleted: boolean,
  ): Promise<EvidenceDocument> {
    if (!isValidObjectId(evidenceId)) {
      throw new NotFoundException("Evidence not found.");
    }
    const filter: Record<string, unknown> = {
      _id: new Types.ObjectId(evidenceId),
    };
    if (!includeDeleted) {
      filter.deletedAt = null;
    }
    const evidence = await this.evidenceModel.findOne(filter).exec();
    if (!evidence) {
      throw new NotFoundException("Evidence not found.");
    }
    return evidence;
  }

  private normalizeInput(input: {
    originalFilename: string;
    mimeType: string;
    byteSize: number;
  }): NormalizedUploadMetadata {
    try {
      return this.filePolicy.normalizeUploadMetadata(input);
    } catch (error) {
      throw toEvidenceHttpError(error);
    }
  }

  private normalizedFromEvidence(
    evidence: EvidenceDocument,
  ): NormalizedUploadMetadata {
    return {
      byteSize: evidence.byteSize,
      extension: evidence.extension,
      mimeType: evidence.mimeType as NormalizedUploadMetadata["mimeType"],
      originalFilename:
        evidence.originalFilename ?? `evidence.${evidence.extension}`,
    };
  }

  private async safeDeleteObject(storageKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(storageKey);
    } catch {
      // The evidence remains failed or deleting; a later lifecycle retry can reconcile storage.
    }
  }

  private async markFailed(
    evidence: EvidenceDocument,
    code: Evidence["processingErrorCode"],
    message: string,
  ): Promise<void> {
    await this.evidenceModel.updateOne(
      { _id: evidence._id, deletedAt: null, revision: evidence.revision },
      {
        $inc: { revision: 1 },
        $set: {
          processingErrorCode: code,
          processingErrorMessage: message,
          processingStatus: "FAILED",
        },
      },
    );
  }

  private async markProcessingFailure(
    evidence: EvidenceDocument,
    status: "FAILED" | "UNSUPPORTED",
    code: Evidence["processingErrorCode"],
    message: string,
  ): Promise<void> {
    await this.evidenceModel.updateOne(
      {
        _id: evidence._id,
        deletedAt: null,
        revision: evidence.revision,
        processingStatus: "PROCESSING",
      },
      {
        $inc: { revision: 1 },
        $set: {
          processingErrorCode: code,
          processingErrorMessage: message.slice(0, 500),
          processingStatus: status,
        },
      },
    );
  }

  private toPublic(evidence: EvidenceDocument): PublicEvidence {
    return {
      byteSize: evidence.byteSize,
      caseId: evidence.caseId.toString(),
      createdAt: evidence.createdAt,
      extension: evidence.extension,
      extractionMethod: evidence.extractionMethod,
      extractionMetadata: evidence.extractionMetadata,
      id: evidence._id.toString(),
      kind: evidence.kind,
      label: evidence.label,
      mimeType: evidence.mimeType,
      originalFilename: evidence.originalFilename,
      pageCount: evidence.pageCount,
      processingErrorCode: evidence.processingErrorCode,
      processingStatus: evidence.processingStatus,
      revision: evidence.revision,
      sha256: evidence.sha256,
      updatedAt: evidence.updatedAt,
    };
  }

  private toObjectId(value: string): Types.ObjectId {
    if (!isValidObjectId(value)) {
      throw new NotFoundException("Case not found.");
    }
    return new Types.ObjectId(value);
  }
}

function toCaseActor(actor: EvidenceActor): CaseActor {
  return {
    actorId: actor.actorId,
    actorType: actor.actorType,
    correlationId: actor.correlationId,
  };
}

async function hashAndSample(
  stream: NodeJS.ReadableStream,
  maximumBytes: number,
): Promise<{ byteSize: number; sample: Buffer; sha256: string }> {
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  let byteSize = 0;
  for await (const chunk of stream) {
    const buffer = toBufferChunk(chunk);
    byteSize += buffer.length;
    if (byteSize > maximumBytes) {
      throw new EvidenceInputError(
        "Uploaded object is too large.",
        "FILE_TOO_LARGE",
      );
    }
    hash.update(buffer);
    const current = Buffer.concat(chunks);
    if (current.length < HASH_SAMPLE_BYTES) {
      chunks.push(buffer.subarray(0, HASH_SAMPLE_BYTES - current.length));
    }
  }
  return {
    byteSize,
    sample: Buffer.concat(chunks),
    sha256: hash.digest("hex"),
  };
}

async function readStreamIntoBuffer(
  stream: NodeJS.ReadableStream,
  maximumBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let byteSize = 0;
  for await (const chunk of stream) {
    const buffer = toBufferChunk(chunk);
    byteSize += buffer.length;
    if (byteSize > maximumBytes) {
      throw new EvidenceInputError(
        "Evidence is too large to process.",
        "FILE_TOO_LARGE",
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

interface EvidenceCursor {
  version: 1;
  createdAt: string;
  id: string;
}

function encodeEvidenceCursor(cursor: EvidenceCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeEvidenceCursor(value: string): EvidenceCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      !("createdAt" in parsed) ||
      !("id" in parsed)
    ) {
      return null;
    }
    const cursor = parsed as {
      version?: unknown;
      createdAt?: unknown;
      id?: unknown;
    };
    return cursor.version === 1 &&
      typeof cursor.createdAt === "string" &&
      typeof cursor.id === "string" &&
      isValidObjectId(cursor.id) &&
      !Number.isNaN(Date.parse(cursor.createdAt))
      ? { createdAt: cursor.createdAt, id: cursor.id, version: 1 }
      : null;
  } catch {
    return null;
  }
}

function toBufferChunk(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }
  return Buffer.from(chunk as Uint8Array);
}

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}
