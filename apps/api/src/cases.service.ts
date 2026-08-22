import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  CaseStatusSchema,
  type CaseAnalysis,
  type CaseStatus,
  type EmailDraft,
  type FormalLetter,
} from '@recourse/shared';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Response } from 'express';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  AccessGuard,
  AuthService,
  CurrentUser,
  type AuthenticatedRequest,
} from './auth';
import { AppError } from './common';
import {
  CaseRecord,
  ChatMessageRecord,
  type CaseDocument,
  type DocumentDocument,
} from './database.schemas';
import { DocumentsService } from './documents.service';
import { LetterPdfService } from './documents.providers';
import { GeminiService } from './gemini.service';
import { ResearchService } from './research.service';

const ACTIVE_OPERATION_STATUSES = ['running'] as const;
const ALLOWED_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  NEW: ['ANALYZING', 'RESOLVED', 'CLOSED'],
  ANALYZING: [
    'NEEDS_INFO',
    'BUILDING_CASE',
    'NEEDS_EVIDENCE',
    'READY',
    'NEW',
    'CLOSED',
  ],
  NEEDS_INFO: ['ANALYZING', 'BUILDING_CASE', 'RESOLVED', 'CLOSED'],
  BUILDING_CASE: ['NEEDS_INFO', 'NEEDS_EVIDENCE', 'READY', 'CLOSED'],
  NEEDS_EVIDENCE: [
    'ANALYZING',
    'BUILDING_CASE',
    'READY',
    'AWAITING_SUBMISSION',
    'RESOLVED',
    'CLOSED',
  ],
  READY: [
    'ANALYZING',
    'AWAITING_SUBMISSION',
    'AWAITING_RESPONSE',
    'RESOLVED',
    'CLOSED',
  ],
  AWAITING_SUBMISSION: ['ANALYZING', 'AWAITING_RESPONSE', 'RESOLVED', 'CLOSED'],
  AWAITING_RESPONSE: ['CONTINUING', 'RESOLVED', 'CLOSED'],
  CONTINUING: [
    'NEEDS_INFO',
    'NEEDS_EVIDENCE',
    'READY',
    'AWAITING_RESPONSE',
    'RESOLVED',
    'CLOSED',
  ],
  RESOLVED: ['CONTINUING', 'CLOSED'],
  CLOSED: [],
};

export class CreateCaseDto {
  @IsString()
  @MinLength(20)
  @MaxLength(80_000)
  decisionText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsBoolean()
  previouslySubmitted?: boolean;
}

export class UpdateCaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80_000)
  decisionText?: string;
}

export class ClarificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  field!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8_000)
  answer!: string;
}

export class ChatDto {
  @IsString()
  @MinLength(2)
  @MaxLength(6_000)
  question!: string;
}

export class EmailDraftDto {
  @IsOptional()
  @IsIn(['concise', 'more_formal', 'regenerate'])
  transformation?: 'concise' | 'more_formal' | 'regenerate';
}

export class LetterDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  recipient?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signatory?: string;
}

export class SubmissionDto {
  @IsIn(['email', 'portal', 'post', 'in_person', 'other'])
  method!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  referenceNumber?: string;

  @IsIn(['unchanged', 'changed', 'different', 'previously_submitted'])
  sourceChoice!: 'unchanged' | 'changed' | 'different' | 'previously_submitted';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  draftRevisionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  actualText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];
}

export class ResponseDto {
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];

  @IsOptional()
  @IsDateString()
  receivedAt?: string;
}

@Injectable()
export class CasesService {
  constructor(
    @InjectModel(CaseRecord.name) private readonly cases: Model<CaseRecord>,
    @InjectModel(ChatMessageRecord.name)
    private readonly messages: Model<ChatMessageRecord>,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(GeminiService) private readonly gemini: GeminiService,
    @Inject(ResearchService) private readonly research: ResearchService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(LetterPdfService) private readonly pdf: LetterPdfService,
  ) {}

  async list(userId: string) {
    const cases = await this.cases
      .find({ userId: oid(userId) })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return cases.map(toPublicCase);
  }

  async get(userId: string, caseId: string) {
    return toPublicCase(await this.getOwned(userId, caseId));
  }

  async create(userId: string, input: CreateCaseDto) {
    const title = input.title?.trim() || deriveTitle(input.decisionText);
    const created = await this.cases.create({
      userId: oid(userId),
      title,
      status: input.previouslySubmitted ? 'AWAITING_SUBMISSION' : 'NEW',
      decisionText: input.decisionText.trim(),
      classification: null,
      clarifications: [],
      research: null,
      analysis: null,
      drafts: { email: [], letter: [] },
      submission: input.previouslySubmitted
        ? { pendingPriorSubmission: true }
        : null,
      responses: [],
      processing: { status: 'idle' },
      activity: [activity('case_created', 'Case created')],
      deletion: null,
    });
    return toPublicCase(created);
  }

  async update(userId: string, caseId: string, input: UpdateCaseDto) {
    const update: Record<string, unknown> = {};
    if (input.title !== undefined)
      update.title = input.title.trim() || 'Untitled case';
    if (input.decisionText !== undefined)
      update.decisionText = input.decisionText.trim();
    const changed = await this.cases.findOneAndUpdate(
      { _id: validId(caseId), userId: oid(userId), status: { $ne: 'CLOSED' } },
      { $set: update },
      { returnDocument: 'after' },
    );
    if (!changed) throw missingCase();
    return toPublicCase(changed);
  }

  async beginAnalysis(userId: string, caseId: string) {
    if (!(await this.auth.hasConsent(userId))) {
      throw new AppError(
        'AI_CONSENT_REQUIRED',
        'Please review and accept the AI processing disclosure first.',
        428,
        false,
      );
    }
    const operationId = randomUUID();
    const claimed = await this.cases.findOneAndUpdate(
      {
        _id: validId(caseId),
        userId: oid(userId),
        status: { $ne: 'CLOSED' },
        'processing.status': { $nin: ACTIVE_OPERATION_STATUSES },
      },
      {
        $set: {
          status: 'ANALYZING',
          processing: {
            status: 'running',
            operation: 'case_analysis',
            operationId,
            startedAt: new Date(),
          },
        },
        $push: {
          activity: {
            $each: [activity('analysis_started', 'Review started')],
            $slice: -100,
          },
        },
      },
      { returnDocument: 'after' },
    );
    if (!claimed) {
      const existing = await this.getOwned(userId, caseId);
      if (existing.processing?.status === 'running')
        return toPublicCase(existing);
      throw missingCase();
    }
    void this.runAnalysis(userId, caseId, operationId);
    return toPublicCase(claimed);
  }

  async clarify(userId: string, caseId: string, input: ClarificationDto) {
    const updated = await this.cases.findOneAndUpdate(
      { _id: validId(caseId), userId: oid(userId), status: { $ne: 'CLOSED' } },
      {
        $push: {
          clarifications: {
            field: input.field.trim(),
            answer: input.answer.trim(),
            source: 'USER_ASSERTED',
            createdAt: new Date(),
          },
          activity: {
            $each: [
              activity('clarification_added', 'Added missing information'),
            ],
            $slice: -100,
          },
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) throw missingCase();
    return this.beginAnalysis(userId, caseId);
  }

  async chatHistory(userId: string, caseId: string) {
    await this.getOwned(userId, caseId);
    const messages = await this.messages
      .find({ userId: oid(userId), caseId: oid(caseId) })
      .sort({ createdAt: 1 })
      .lean();
    return messages.map((message) => ({
      id: message._id.toString(),
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      createdAt: message.createdAt,
    }));
  }

  async ask(userId: string, caseId: string, question: string) {
    await this.requireConsent(userId);
    const caseDocument = await this.getOwned(userId, caseId);
    if (caseDocument.status === 'CLOSED') throw closedCase();
    await this.messages.create({
      userId: oid(userId),
      caseId: oid(caseId),
      role: 'user',
      content: question,
    });
    const answer = await this.gemini.answerCaseQuestion(
      await this.context(userId, caseDocument),
      question,
    );
    const assistant = await this.messages.create({
      userId: oid(userId),
      caseId: oid(caseId),
      role: 'assistant',
      content: answer.answer,
      metadata: answer,
    });
    if (answer.factsToRecord.length) {
      await this.cases.updateOne(
        { _id: caseDocument._id, userId: oid(userId) },
        {
          $push: {
            clarifications: {
              $each: answer.factsToRecord.map((fact) => ({
                field: fact.field,
                answer: fact.value,
                source: 'USER_ASSERTED',
                createdAt: new Date(),
              })),
            },
          },
        },
      );
    }
    return {
      id: assistant._id.toString(),
      role: assistant.role,
      content: assistant.content,
      metadata: assistant.metadata,
      createdAt: assistant.createdAt,
    };
  }

  async draftEmail(userId: string, caseId: string, input: EmailDraftDto) {
    await this.requireConsent(userId);
    const caseDocument = await this.getOwned(userId, caseId);
    if (caseDocument.status === 'CLOSED') throw closedCase();
    const draft = await this.gemini.draftEmail(
      await this.context(userId, caseDocument),
      input.transformation ?? 'concise',
    );
    const revision = {
      ...draft,
      id: randomUUID(),
      createdAt: new Date(),
      transformation: input.transformation ?? 'concise',
    };
    caseDocument.drafts.email = [
      ...(caseDocument.drafts.email ?? []),
      revision,
    ].slice(-10);
    caseDocument.markModified('drafts');
    transition(caseDocument, 'AWAITING_SUBMISSION');
    addActivity(caseDocument, 'email_drafted', 'Email draft prepared');
    await caseDocument.save();
    return revision;
  }

  async draftLetter(userId: string, caseId: string, input: LetterDraftDto) {
    await this.requireConsent(userId);
    const caseDocument = await this.getOwned(userId, caseId);
    if (caseDocument.status === 'CLOSED') throw closedCase();
    const letter = await this.gemini.draftFormalLetter(
      await this.context(userId, caseDocument),
      {
        sender: input.sender || '[Your name and address]',
        recipient: input.recipient || '[Recipient name and address]',
        signatory: input.signatory || '[Your name]',
        date: new Date().toISOString().slice(0, 10),
      },
    );
    const revision = { ...letter, id: randomUUID(), createdAt: new Date() };
    caseDocument.drafts.letter = [
      ...(caseDocument.drafts.letter ?? []),
      revision,
    ].slice(-10);
    caseDocument.markModified('drafts');
    transition(caseDocument, 'AWAITING_SUBMISSION');
    addActivity(caseDocument, 'letter_drafted', 'Formal letter prepared');
    await caseDocument.save();
    return revision;
  }

  async letterPdf(userId: string, caseId: string, revisionId: string) {
    const caseDocument = await this.getOwned(userId, caseId);
    const revision = caseDocument.drafts.letter.find(
      (item) => item.id === revisionId,
    ) as FormalLetter | undefined;
    if (!revision)
      throw new AppError(
        'NOT_FOUND',
        'That letter revision could not be found.',
        404,
        false,
      );
    return {
      bytes: await this.pdf.render(revision),
      title: caseDocument.title,
    };
  }

  async submit(userId: string, caseId: string, input: SubmissionDto) {
    const caseDocument = await this.getOwned(userId, caseId);
    if (caseDocument.status === 'CLOSED') throw closedCase();
    if (
      caseDocument.submission &&
      !('pendingPriorSubmission' in caseDocument.submission)
    ) {
      throw new AppError(
        'SUBMISSION_ALREADY_RECORDED',
        'This submission has already been recorded.',
        409,
        false,
      );
    }
    const documentIds = await this.validateDocumentIds(
      userId,
      caseId,
      input.documentIds ?? [],
    );
    let actualText = input.actualText?.trim() ?? '';
    let draftType: 'email' | 'letter' | null = null;
    if (input.sourceChoice === 'unchanged') {
      const email = caseDocument.drafts.email.find(
        (item) => item.id === input.draftRevisionId,
      ) as EmailDraft | undefined;
      const letter = caseDocument.drafts.letter.find(
        (item) => item.id === input.draftRevisionId,
      ) as FormalLetter | undefined;
      if (email) {
        actualText = `Subject: ${email.subject}\n\n${email.body}`;
        draftType = 'email';
      } else if (letter) {
        actualText = letterToText(letter);
        draftType = 'letter';
      } else {
        throw new AppError(
          'DRAFT_REQUIRED',
          'Choose the draft you actually used.',
          400,
          false,
        );
      }
    }
    if (!actualText && documentIds.length === 0) {
      throw new AppError(
        'ACTUAL_SUBMISSION_REQUIRED',
        'Paste or upload what you actually submitted so future responses can be compared accurately.',
        400,
        false,
      );
    }
    caseDocument.submission = {
      id: randomUUID(),
      method: input.method,
      date: input.date,
      referenceNumber: input.referenceNumber?.trim() || null,
      sourceChoice: input.sourceChoice,
      draftRevisionId: input.draftRevisionId ?? null,
      draftType,
      snapshot: { text: actualText, documentIds },
      recordedAt: new Date(),
    };
    transition(caseDocument, 'AWAITING_RESPONSE');
    addActivity(
      caseDocument,
      'submission_recorded',
      'You recorded a submission',
    );
    await caseDocument.save();
    return toPublicCase(caseDocument);
  }

  async addResponse(userId: string, caseId: string, input: ResponseDto) {
    await this.requireConsent(userId);
    const caseDocument = await this.getOwned(userId, caseId);
    if (
      !caseDocument.submission ||
      'pendingPriorSubmission' in caseDocument.submission
    ) {
      throw new AppError(
        'SUBMISSION_REQUIRED',
        'Record what was submitted before adding a response.',
        400,
        false,
      );
    }
    const documentIds = await this.validateDocumentIds(
      userId,
      caseId,
      input.documentIds ?? [],
    );
    if (!input.text?.trim() && documentIds.length === 0) {
      throw new AppError(
        'RESPONSE_REQUIRED',
        'Paste or upload the response you received.',
        400,
        false,
      );
    }
    const responseId = randomUUID();
    caseDocument.responses.push({
      id: responseId,
      text: input.text?.trim() ?? '',
      documentIds,
      receivedAt: input.receivedAt ?? new Date().toISOString(),
      analysis: null,
      createdAt: new Date(),
    });
    transition(caseDocument, 'CONTINUING');
    caseDocument.processing = {
      status: 'running',
      operation: 'response_analysis',
      operationId: responseId,
      startedAt: new Date(),
    };
    addActivity(caseDocument, 'response_added', 'Response received');
    await caseDocument.save();
    void this.runResponseAnalysis(userId, caseId, responseId);
    return toPublicCase(caseDocument);
  }

  async resolve(userId: string, caseId: string) {
    const caseDocument = await this.getOwned(userId, caseId);
    transition(caseDocument, 'RESOLVED');
    addActivity(caseDocument, 'case_resolved', 'Marked resolved');
    await caseDocument.save();
    return toPublicCase(caseDocument);
  }

  async close(userId: string, caseId: string) {
    const caseDocument = await this.getOwned(userId, caseId);
    transition(caseDocument, 'CLOSED');
    addActivity(caseDocument, 'case_closed', 'Case closed');
    await caseDocument.save();
    return toPublicCase(caseDocument);
  }

  async delete(userId: string, caseId: string) {
    const caseDocument = await this.getOwned(userId, caseId);
    caseDocument.deletion = {
      status: 'deleting',
      startedAt: new Date(),
      error: null,
    };
    await caseDocument.save();
    try {
      await this.documents.removeCaseAssets(userId, caseId);
      await this.messages.deleteMany({
        userId: oid(userId),
        caseId: oid(caseId),
      });
      await caseDocument.deleteOne();
      return { ok: true };
    } catch (error: unknown) {
      caseDocument.deletion = {
        status: 'failed',
        failedAt: new Date(),
        error: {
          code: error instanceof AppError ? error.code : 'DELETE_FAILED',
          retryable: true,
        },
      };
      await caseDocument.save();
      throw error;
    }
  }

  private async runAnalysis(
    userId: string,
    caseId: string,
    operationId: string,
  ): Promise<void> {
    try {
      const caseDocument = await this.getOwned(userId, caseId);
      const documents = await this.documents.listModels(userId, caseId);
      const decisionDocuments = documents.filter(
        (document) => document.purpose === 'decision',
      );
      const input = [
        caseDocument.decisionText,
        ...decisionDocuments.map((document) => document.extractedText),
        caseDocument.clarifications
          .map((item) => `${String(item.field)}: ${String(item.answer)}`)
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n');
      const understanding = await this.gemini.understandCase(input);
      caseDocument.classification = understanding;
      if (understanding.criticalUnknowns.length > 0) {
        transition(caseDocument, 'NEEDS_INFO');
        caseDocument.processing = {
          status: 'idle',
          completedAt: new Date(),
          operationId,
        };
        addActivity(
          caseDocument,
          'information_needed',
          'A little more information is needed',
        );
        await caseDocument.save();
        return;
      }

      transition(caseDocument, 'BUILDING_CASE');
      await caseDocument.save();
      const research = await this.research.research(understanding);
      caseDocument.research = { ...research };
      const extractions = [];
      for (const document of documents) {
        const extraction = await this.ensureExtraction(document);
        extractions.push({
          documentId: document._id.toString(),
          filename: document.filename,
          purpose: document.purpose,
          extraction,
        });
      }
      const analysis = await this.gemini.analyzeCase({
        understanding,
        clarifications: caseDocument.clarifications,
        research,
        evidence: extractions,
      });
      caseDocument.analysis = analysis;
      transition(caseDocument, readinessStatus(analysis));
      caseDocument.processing = {
        status: 'idle',
        completedAt: new Date(),
        operationId,
      };
      addActivity(
        caseDocument,
        'analysis_completed',
        completionLabel(analysis),
      );
      await caseDocument.save();
    } catch (error: unknown) {
      await this.persistOperationFailure(userId, caseId, operationId, error);
    }
  }

  private async runResponseAnalysis(
    userId: string,
    caseId: string,
    responseId: string,
  ): Promise<void> {
    try {
      const caseDocument = await this.getOwned(userId, caseId);
      const response = caseDocument.responses.find(
        (item) => item.id === responseId,
      );
      if (!response) return;
      const analysis = await this.gemini.analyzeResponse(
        await this.context(userId, caseDocument),
      );
      response.analysis = analysis;
      caseDocument.markModified('responses');
      transition(
        caseDocument,
        analysis.outcome === 'accepted' ? 'RESOLVED' : 'READY',
      );
      caseDocument.processing = {
        status: 'idle',
        completedAt: new Date(),
        operationId: responseId,
      };
      addActivity(caseDocument, 'response_reviewed', 'Response reviewed');
      await caseDocument.save();
    } catch (error: unknown) {
      await this.persistOperationFailure(
        userId,
        caseId,
        responseId,
        error,
        'AWAITING_RESPONSE',
      );
    }
  }

  private async ensureExtraction(document: DocumentDocument) {
    if (document.extraction) return document.extraction;
    document.processingStatus = 'extracting';
    await document.save();
    try {
      let media: { bytes: Buffer; mimeType: string } | undefined;
      const needsMedia =
        document.mimeType.startsWith('image/') ||
        (document.mimeType === 'application/pdf' &&
          document.extractedText.trim().length < 100);
      if (needsMedia) {
        const asset = await this.documents.getBuffer(
          document.userId.toString(),
          document.caseId.toString(),
          document._id.toString(),
        );
        media = { bytes: asset.bytes, mimeType: document.mimeType };
      }
      const extraction = await this.gemini.extractEvidence({
        filename: document.filename,
        text: document.extractedText,
        media,
      });
      document.extraction = extraction;
      document.processingStatus = 'ready';
      document.error = null;
      await document.save();
      return extraction;
    } catch (error: unknown) {
      document.processingStatus = 'error';
      document.error = providerError(error);
      await document.save();
      throw error;
    }
  }

  private async context(userId: string, caseDocument: CaseDocument) {
    const documents = await this.documents.listModels(
      userId,
      caseDocument._id.toString(),
    );
    const latestResponse = caseDocument.responses.at(-1) ?? null;
    return {
      decision: caseDocument.decisionText,
      understanding: caseDocument.classification,
      clarifications: caseDocument.clarifications,
      procedure: caseDocument.research,
      evidence: documents.map((document) => ({
        id: document._id.toString(),
        filename: document.filename,
        purpose: document.purpose,
        extraction: document.extraction,
      })),
      analysis: caseDocument.analysis,
      actualSubmission: caseDocument.submission,
      latestResponse,
    };
  }

  private async validateDocumentIds(
    userId: string,
    caseId: string,
    ids: string[],
  ): Promise<string[]> {
    const unique = [...new Set(ids)].slice(0, 20);
    for (const id of unique) await this.documents.getOwned(userId, caseId, id);
    return unique;
  }

  private async persistOperationFailure(
    userId: string,
    caseId: string,
    operationId: string,
    error: unknown,
    fallback: CaseStatus = 'NEW',
  ): Promise<void> {
    await this.cases.updateOne(
      {
        _id: oid(caseId),
        userId: oid(userId),
        'processing.operationId': operationId,
      },
      {
        $set: {
          status: fallback,
          processing: {
            status: 'error',
            operationId,
            failedAt: new Date(),
            error: providerError(error),
          },
        },
        $push: {
          activity: {
            $each: [
              activity('operation_failed', 'That step needs another try'),
            ],
            $slice: -100,
          },
        },
      },
    );
  }

  private async requireConsent(userId: string): Promise<void> {
    if (!(await this.auth.hasConsent(userId))) {
      throw new AppError(
        'AI_CONSENT_REQUIRED',
        'Please review and accept the AI processing disclosure first.',
        428,
        false,
      );
    }
  }

  private async getOwned(
    userId: string,
    caseId: string,
  ): Promise<CaseDocument> {
    const document = await this.cases
      .findOne({ _id: validId(caseId), userId: oid(userId) })
      .exec();
    if (!document) throw missingCase();
    return document;
  }
}

@Controller('cases')
@UseGuards(AccessGuard)
export class CasesController {
  constructor(@Inject(CasesService) private readonly cases: CasesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.cases.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: CreateCaseDto,
  ) {
    return this.cases.create(user.id, body);
  }

  @Get(':caseId')
  get(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
  ) {
    return this.cases.get(user.id, caseId);
  }

  @Patch(':caseId')
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Body() body: UpdateCaseDto,
  ) {
    return this.cases.update(user.id, caseId, body);
  }

  @Post(':caseId/analyze')
  analyze(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
  ) {
    return this.cases.beginAnalysis(user.id, caseId);
  }

  @Post(':caseId/clarifications')
  clarify(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Body() body: ClarificationDto,
  ) {
    return this.cases.clarify(user.id, caseId, body);
  }

  @Get(':caseId/chat')
  chatHistory(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
  ) {
    return this.cases.chatHistory(user.id, caseId);
  }

  @Post(':caseId/chat')
  chat(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Body() body: ChatDto,
  ) {
    return this.cases.ask(user.id, caseId, body.question);
  }

  @Post(':caseId/drafts/email')
  draftEmail(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Body() body: EmailDraftDto,
  ) {
    return this.cases.draftEmail(user.id, caseId, body);
  }

  @Post(':caseId/drafts/letter')
  draftLetter(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Body() body: LetterDraftDto,
  ) {
    return this.cases.draftLetter(user.id, caseId, body);
  }

  @Get(':caseId/drafts/letter/:revisionId/pdf')
  async letterPdf(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Param('revisionId') revisionId: string,
    @Res() response: Response,
  ) {
    const result = await this.cases.letterPdf(user.id, caseId, revisionId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${slug(result.title)}-letter.pdf"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(result.bytes);
  }

  @Post(':caseId/submission')
  submission(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Body() body: SubmissionDto,
  ) {
    return this.cases.submit(user.id, caseId, body);
  }

  @Post(':caseId/responses')
  response(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
    @Body() body: ResponseDto,
  ) {
    return this.cases.addResponse(user.id, caseId, body);
  }

  @Post(':caseId/resolve')
  resolve(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
  ) {
    return this.cases.resolve(user.id, caseId);
  }

  @Post(':caseId/close')
  close(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
  ) {
    return this.cases.close(user.id, caseId);
  }

  @Delete(':caseId')
  remove(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('caseId') caseId: string,
  ) {
    return this.cases.delete(user.id, caseId);
  }
}

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

function transition(document: CaseDocument, to: CaseStatus): void {
  const current = CaseStatusSchema.parse(document.status);
  if (!canTransition(current, to)) {
    throw new AppError(
      'INVALID_CASE_STATE',
      'That action is not available at this stage.',
      409,
      false,
    );
  }
  document.status = to;
}

function readinessStatus(analysis: CaseAnalysis): CaseStatus {
  if (analysis.readiness === 'needs_info') return 'NEEDS_INFO';
  if (analysis.readiness === 'needs_evidence') return 'NEEDS_EVIDENCE';
  return 'READY';
}

function completionLabel(analysis: CaseAnalysis): string {
  return analysis.readiness === 'ready' ? 'Case is ready' : 'Review completed';
}

function deriveTitle(text: string): string {
  const first =
    text.replace(/\s+/g, ' ').trim().split(/[.!?]/)[0]?.trim() || 'New case';
  return first.length > 52 ? `${first.slice(0, 49)}…` : first;
}

function addActivity(
  document: CaseDocument,
  type: string,
  label: string,
): void {
  document.activity = [...document.activity, activity(type, label)].slice(-100);
}

function activity(type: string, label: string) {
  return { id: randomUUID(), type, label, at: new Date() };
}

function toPublicCase(
  document: CaseRecord & {
    _id: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
  },
) {
  return {
    id: document._id.toString(),
    title: document.title,
    status: document.status,
    decisionText: document.decisionText,
    classification: document.classification,
    clarifications: document.clarifications,
    research: document.research,
    analysis: document.analysis,
    drafts: document.drafts,
    submission: document.submission,
    responses: document.responses,
    processing: document.processing,
    activity: document.activity,
    deletion: document.deletion,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function letterToText(letter: FormalLetter): string {
  return [
    letter.sender,
    letter.date,
    letter.recipient,
    letter.reference ? `Reference: ${letter.reference}` : '',
    letter.subject,
    letter.salutation,
    ...letter.paragraphs,
    letter.closing,
    letter.signatory,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function providerError(error: unknown) {
  return error instanceof AppError
    ? { code: error.code, message: error.message, retryable: error.retryable }
    : {
        code: 'OPERATION_FAILED',
        message: 'That step could not be completed yet.',
        retryable: true,
      };
}

function validId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) throw missingCase();
  return oid(value);
}

function oid(value: string): Types.ObjectId {
  return new Types.ObjectId(value);
}

function missingCase(): AppError {
  return new AppError('NOT_FOUND', 'That case could not be found.', 404, false);
}

function closedCase(): AppError {
  return new AppError(
    'CASE_CLOSED',
    'This case is closed and cannot be changed.',
    409,
    false,
  );
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'recourse'
  );
}
