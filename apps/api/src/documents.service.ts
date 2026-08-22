import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectModel } from '@nestjs/mongoose';
import { DocumentPurposeSchema, type DocumentPurpose } from '@recourse/shared';
import { fileTypeFromBuffer } from 'file-type';
import type { Response } from 'express';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AccessGuard, CurrentUser, type AuthenticatedRequest } from './auth';
import { AppError } from './common';
import { Environment } from './config';
import {
  CaseRecord,
  DocumentRecord,
  type DocumentDocument,
} from './database.schemas';
import {
  CloudinaryService,
  DocumentExtractionService,
  type StoredAsset,
} from './documents.providers';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALLOWED_MIME = new Set([
  'application/pdf',
  DOCX_MIME,
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
]);
const MIME_EXTENSIONS: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  [DOCX_MIME]: ['.docx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'text/plain': ['.txt'],
};

export interface UploadedEvidence {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(DocumentRecord.name)
    private readonly documents: Model<DocumentRecord>,
    @InjectModel(CaseRecord.name) private readonly cases: Model<CaseRecord>,
    @Inject(CloudinaryService) private readonly cloudinary: CloudinaryService,
    @Inject(DocumentExtractionService)
    private readonly extractor: DocumentExtractionService,
    @Inject(Environment) private readonly environment: Environment,
  ) {}

  async list(userId: string, caseId: string) {
    await this.assertCase(userId, caseId);
    const documents = await this.documents
      .find({ userId: objectId(userId), caseId: objectId(caseId) })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    return documents.map(toPublicDocument);
  }

  async upload(
    userId: string,
    caseId: string,
    rawPurpose: string,
    file: UploadedEvidence | undefined,
  ) {
    await this.assertCase(userId, caseId);
    if (!file)
      throw new AppError(
        'FILE_REQUIRED',
        'Choose a file to upload.',
        400,
        false,
      );
    const purpose = parsePurpose(rawPurpose);
    const mimeType = await validateFile(file, this.environment.MAX_UPLOAD_MB);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.documents
      .findOne({ caseId: objectId(caseId), purpose, sha256 })
      .lean()
      .exec();
    if (existing)
      return { document: toPublicDocument(existing), duplicate: true };

    const resourceType = mimeType.startsWith('image/') ? 'image' : 'raw';
    const publicId = `recourse/${userId}/${caseId}/${randomUUID()}`;
    const asset = await this.cloudinary.upload(
      file.buffer,
      publicId,
      resourceType,
    );
    try {
      const localExtraction = await this.extractor.extract(
        file.buffer,
        mimeType,
      );
      if ((localExtraction.pageCount ?? 0) > 100) {
        await this.cloudinary.delete(asset);
        throw new AppError(
          'PDF_TOO_LONG',
          'PDFs can contain at most 100 pages.',
          400,
          false,
        );
      }
      const created = await new this.documents({
        userId: objectId(userId),
        caseId: objectId(caseId),
        purpose,
        filename: safeFilename(file.originalname),
        mimeType,
        size: file.size,
        sha256,
        cloudinary: { ...asset },
        extractedText: localExtraction.text.slice(0, 160_000),
        extraction: null,
        processingStatus: 'uploaded',
        error: null,
      }).save();
      await this.cases.updateOne(
        { _id: objectId(caseId), userId: objectId(userId) },
        {
          $push: {
            activity: {
              $each: [
                {
                  type: 'document_added',
                  label: `Added ${created.filename}`,
                  at: new Date(),
                },
              ],
              $slice: -100,
            },
          },
        },
      );
      return { document: toPublicDocument(created), duplicate: false };
    } catch (error: unknown) {
      if (error instanceof AppError && error.code === 'PDF_TOO_LONG')
        throw error;
      await this.cloudinary.delete(asset).catch(() => undefined);
      if (isDuplicateKey(error)) {
        const duplicate = await this.documents
          .findOne({ caseId: objectId(caseId), purpose, sha256 })
          .lean();
        if (duplicate)
          return { document: toPublicDocument(duplicate), duplicate: true };
      }
      throw error;
    }
  }

  async getOwned(
    userId: string,
    caseId: string,
    documentId: string,
  ): Promise<DocumentDocument> {
    if (!Types.ObjectId.isValid(documentId)) throw notFound();
    const document = await this.documents
      .findOne({
        _id: objectId(documentId),
        userId: objectId(userId),
        caseId: objectId(caseId),
      })
      .exec();
    if (!document) throw notFound();
    return document;
  }

  async getBuffer(userId: string, caseId: string, documentId: string) {
    const document = await this.getOwned(userId, caseId, documentId);
    const asset = document.cloudinary as unknown as StoredAsset | null;
    if (!asset)
      throw new AppError(
        'DOWNLOAD_FAILED',
        'The file is temporarily unavailable.',
        503,
        true,
      );
    return { document, bytes: await this.cloudinary.download(asset) };
  }

  async delete(userId: string, caseId: string, documentId: string) {
    const document = await this.getOwned(userId, caseId, documentId);
    const asset = document.cloudinary as unknown as StoredAsset | null;
    if (asset) await this.cloudinary.delete(asset);
    await document.deleteOne();
    await this.cases.updateOne(
      { _id: objectId(caseId), userId: objectId(userId) },
      {
        $push: {
          activity: {
            $each: [
              {
                type: 'document_deleted',
                label: `Deleted ${document.filename}`,
                at: new Date(),
              },
            ],
            $slice: -100,
          },
        },
      },
    );
    return { ok: true };
  }

  async processForAi(document: DocumentDocument, userId: string) {
    if (document.userId.toString() !== userId) throw notFound();
    if (document.extraction) return document.extraction;
    document.processingStatus = 'extracting';
    document.error = null;
    await document.save();
    return null;
  }

  async listModels(
    userId: string,
    caseId: string,
  ): Promise<DocumentDocument[]> {
    await this.assertCase(userId, caseId);
    return this.documents
      .find({ userId: objectId(userId), caseId: objectId(caseId) })
      .sort({ createdAt: 1 })
      .exec();
  }

  async removeCaseAssets(userId: string, caseId: string): Promise<void> {
    const documents = await this.listModels(userId, caseId);
    for (const document of documents) {
      const asset = document.cloudinary as unknown as StoredAsset | null;
      if (asset) await this.cloudinary.delete(asset);
    }
    await this.documents.deleteMany({
      userId: objectId(userId),
      caseId: objectId(caseId),
    });
  }

  private async assertCase(userId: string, caseId: string): Promise<void> {
    if (!Types.ObjectId.isValid(caseId)) throw notFound();
    const exists = await this.cases.exists({
      _id: objectId(caseId),
      userId: objectId(userId),
    });
    if (!exists) throw notFound();
  }
}

@Controller('cases/:caseId/documents')
@UseGuards(AccessGuard)
export class DocumentsController {
  constructor(
    @Inject(DocumentsService) private readonly documents: DocumentsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
  ) {
    return this.documents.list(user.id, caseId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Body('purpose') purpose: string | undefined,
    @UploadedFile() file: UploadedEvidence | undefined,
  ) {
    return this.documents.upload(user.id, caseId, purpose ?? 'evidence', file);
  }

  @Get(':documentId/content')
  async content(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ) {
    const result = await this.documents.getBuffer(user.id, caseId, documentId);
    response.setHeader('Content-Type', result.document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename(result.document.filename)}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(result.bytes);
  }

  @Delete(':documentId')
  remove(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.delete(user.id, caseId, documentId);
  }
}

export async function validateFile(
  file: UploadedEvidence,
  maximumMb: number,
): Promise<string> {
  if (!file.buffer.length || file.size !== file.buffer.length) {
    throw new AppError(
      'INVALID_FILE',
      'The uploaded file is incomplete.',
      400,
      false,
    );
  }
  if (file.size > maximumMb * 1024 * 1024) {
    throw new AppError(
      'FILE_TOO_LARGE',
      `Files can be at most ${maximumMb} MB.`,
      413,
      false,
    );
  }
  const declared = normalizeMime(file.mimetype);
  if (!ALLOWED_MIME.has(declared)) throw unsupported();
  const detected = await fileTypeFromBuffer(file.buffer);
  const actual =
    detected?.mime ?? (looksLikeText(file.buffer) ? 'text/plain' : 'unknown');
  const equivalentJpeg = declared === 'image/jpeg' && actual === 'image/jpeg';
  if (actual !== declared && !equivalentJpeg) throw unsupported();
  const extension = extname(file.originalname).toLowerCase();
  if (!MIME_EXTENSIONS[declared]?.includes(extension)) throw unsupported();
  return declared;
}

function parsePurpose(value: string): DocumentPurpose {
  const result = DocumentPurposeSchema.safeParse(value);
  if (!result.success)
    throw new AppError(
      'INVALID_PURPOSE',
      'Choose a valid document type.',
      400,
      false,
    );
  return result.data;
}

function normalizeMime(value: string): string {
  return value.toLowerCase().split(';')[0]?.trim() ?? '';
}

function looksLikeText(bytes: Buffer): boolean {
  if (bytes.includes(0)) return false;
  const sample = bytes.subarray(0, 8_000).toString('utf8');
  if (!sample.trim()) return false;
  const replacements = (sample.match(/�/g) ?? []).length;
  return replacements / sample.length < 0.01;
}

function safeFilename(value: string): string {
  return (
    value
      .replace(/[\r\n"\\/]/g, '_')
      .replace(/[^\w.() -]/g, '_')
      .slice(0, 120) || 'document'
  );
}

function objectId(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function notFound(): AppError {
  return new AppError(
    'NOT_FOUND',
    'That case or document could not be found.',
    404,
    false,
  );
}

function unsupported(): AppError {
  return new AppError(
    'UNSUPPORTED_FILE',
    'Use a PDF, DOCX, TXT, PNG, JPEG, or WebP file.',
    400,
    false,
  );
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

function toPublicDocument(
  document: DocumentRecord & {
    _id: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
  },
) {
  return {
    id: document._id.toString(),
    purpose: document.purpose,
    filename: document.filename,
    mimeType: document.mimeType,
    size: document.size,
    processingStatus: document.processingStatus,
    extraction: document.extraction,
    error: document.error,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}
