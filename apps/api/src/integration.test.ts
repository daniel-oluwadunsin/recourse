import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getConnectionToken } from '@nestjs/mongoose';
import { createConnection, type Connection } from 'mongoose';
import request from 'supertest';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { AppExceptionFilter } from './common';
import { Environment } from './config';
import { CloudinaryService } from './documents.providers';
import { GeminiService } from './gemini.service';
import { ResearchService } from './research.service';

const assets = new Map<string, Buffer>();
const fakeCloudinary = {
  upload: async (
    bytes: Buffer,
    publicId: string,
    resourceType: 'image' | 'raw',
  ) => {
    assets.set(publicId, bytes);
    return {
      publicId,
      assetId: 'test-asset',
      resourceType,
      format: resourceType === 'raw' ? 'txt' : 'png',
      bytes: bytes.length,
      deliveryType: 'authenticated' as const,
    };
  },
  download: async (asset: { publicId: string }) =>
    assets.get(asset.publicId) ?? Buffer.alloc(0),
  delete: async (asset: { publicId: string }) => {
    assets.delete(asset.publicId);
  },
  ping: async () => true,
};

const fakeGemini = {
  understandCase: async (input: string) => ({
    institution: input.includes('unknown institution')
      ? null
      : 'Northfield Council',
    decision: 'A synthetic permit request was refused',
    statedReason: 'A required date was unclear',
    referenceNumber: 'SYN-1042',
    decisionDate: '2026-08-01',
    jurisdiction: 'Westborough',
    amountAffected: null,
    currency: null,
    summary: 'Northfield Council refused a synthetic permit request.',
    desiredOutcome: 'reconsideration',
    criticalUnknowns:
      input.includes('unknown institution') &&
      !input.includes('Northfield Council')
        ? [
            {
              field: 'institution',
              questionForUser: 'Which institution made the decision?',
            },
          ]
        : [],
    highStakes: false,
    highStakesReason: null,
  }),
  extractEvidence: async ({ filename }: { filename: string }) => ({
    summary: `${filename} supports the stated date.`,
    language: 'English',
    readable: true,
    unreadableReason: null,
    facts: [
      {
        statement: 'A synthetic date is present.',
        source: 'VERIFIED_DOCUMENT',
        date: '2026-07-20',
        confidence: 'high',
      },
    ],
  }),
  analyzeCase: async (context: { evidence: unknown[] }) => ({
    summary: 'The decision and current process are understood.',
    usefulEvidence: context.evidence.map((_: unknown, index: number) => ({
      documentId: String(index),
      title: 'Synthetic evidence',
      explanation: 'Supports the timeline.',
    })),
    missingEvidence: [],
    contradictions: [],
    timeline: [{ date: '2026-08-01', event: 'Decision received' }],
    readiness: 'ready',
    recommendation: 'Prepare the response you want to submit.',
  }),
  answerCaseQuestion: async (_context: unknown, question: string) =>
    question.includes('unknown fact')
      ? {
          answer: 'The case does not contain that fact.',
          caseRelated: true,
          needsFact: true,
          followUpQuestion: 'What is the missing account date?',
          referencedDocumentIds: [],
          referencedSourceIds: [],
          factsToRecord: [],
        }
      : {
          answer:
            'Explain that the dated synthetic evidence addresses the reason given.',
          caseRelated: true,
          needsFact: false,
          followUpQuestion: null,
          referencedDocumentIds: [],
          referencedSourceIds: ['source-1'],
          factsToRecord: [],
        },
  draftEmail: async () => ({
    subject: 'Request for reconsideration — SYN-1042',
    body: 'I am asking you to reconsider the decision using the attached dated evidence.',
    suggestedAttachments: [],
    unresolvedFacts: [],
  }),
  draftFormalLetter: async () => ({
    sender: '[Your name and address]',
    recipient: '[Recipient name and address]',
    date: '2026-08-22',
    reference: 'SYN-1042',
    subject: 'Request for reconsideration',
    salutation: 'Dear decision maker,',
    paragraphs: [
      'I request reconsideration of the decision.',
      'The dated evidence addresses the stated concern.',
    ],
    closing: 'Yours faithfully,',
    signatory: '[Your name]',
    suggestedAttachments: ['Dated evidence'],
    unresolvedFacts: ['Your name and address', 'Recipient name and address'],
  }),
  analyzeResponse: async () => ({
    outcome: 'rejected',
    responseSummary: 'The institution maintained its decision.',
    reasonGiven: 'The evidence was not accepted.',
    changedReasoning: null,
    pointsAddressed: ['The dated evidence'],
    pointsNotAddressed: ['Timing explanation'],
    newRequests: [],
    anotherRouteLikely: false,
    recommendation:
      'Ask for clarification or consider qualified help before choosing another action.',
  }),
};

const fakeResearch = {
  research: async (understanding: { institution: string | null }) =>
    understanding.institution === 'No Process Office'
      ? {
          procedure: {
            status: 'NOT_FOUND',
            summary: 'No formal process could be verified.',
            procedureAvailable: false,
            deadline: null,
            steps: [],
            evidenceGuidance: [],
            nextRoute: null,
            sourceIds: [],
            uncertainty: 'No authoritative source supported a route.',
          },
          sources: [],
          researchedAt: new Date().toISOString(),
          cacheKey: 'none',
        }
      : {
          procedure: {
            status: 'VERIFIED',
            summary: 'A written reconsideration request is available.',
            procedureAvailable: true,
            deadline: 'Within 30 days of the decision',
            steps: [
              'Write to the review team',
              'Include the reference and supporting evidence',
            ],
            evidenceGuidance: ['Include dated evidence'],
            nextRoute: null,
            sourceIds: ['source-1'],
            uncertainty: null,
          },
          sources: [
            {
              id: 'source-1',
              title: 'Official review process',
              url: 'https://northfield.gov/review',
              domain: 'northfield.gov',
              excerpt: 'Synthetic official procedure fixture.',
              authority: 'official',
              accessedAt: new Date().toISOString(),
            },
          ],
          researchedAt: new Date().toISOString(),
          cacheKey: 'fixture',
        },
};

describe('Recourse API lifecycle', () => {
  let mongo: MongoMemoryServer;
  let app: INestApplication;
  let firstToken = '';
  let secondToken = '';
  let caseId = '';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const legacyConnection = await createConnection(mongo.getUri(), {
      dbName: 'recourse_test',
    }).asPromise();
    await legacyConnection.collection('cases').createIndex(
      { caseKey: 1 },
      {
        name: 'cases_case_key_unique',
        unique: true,
      },
    );
    await legacyConnection.close();

    const environment = new Environment({
      NODE_ENV: 'test',
      MONGODB_URI: mongo.getUri(),
      MONGODB_DB_NAME: 'recourse_test',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '30d',
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Environment)
      .useValue(environment)
      .overrideProvider(GeminiService)
      .useValue(fakeGemini)
      .overrideProvider(ResearchService)
      .useValue(fakeResearch)
      .overrideProvider(CloudinaryService)
      .useValue(fakeCloudinary)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AppExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await mongo?.stop();
  });

  it('removes the obsolete unique caseKey index during startup', async () => {
    const connection = app.get<Connection>(getConnectionToken());
    const indexes = await connection.collection('cases').listIndexes().toArray();
    expect(indexes.map((index) => index.name)).not.toContain(
      'cases_case_key_unique',
    );
  });

  it('isolates users and completes intake through response continuation', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: 'first@example.test',
        password: 'correct horse battery staple',
      })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        email: 'second@example.test',
        password: 'another correct battery staple',
      })
      .expect(201);
    firstToken = first.body.accessToken as string;
    secondToken = second.body.accessToken as string;
    await request(app.getHttpServer())
      .put('/api/v1/auth/consent')
      .set(auth(firstToken))
      .expect(200);
    const created = await request(app.getHttpServer())
      .post('/api/v1/cases')
      .set(auth(firstToken))
      .send({
        decisionText:
          'Northfield Council refused my synthetic permit request after saying the evidence date was unclear.',
      })
      .expect(201);
    caseId = created.body.id as string;
    await request(app.getHttpServer())
      .get(`/api/v1/cases/${caseId}`)
      .set(auth(secondToken))
      .expect(404);

    const upload = await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/documents`)
      .set(auth(firstToken))
      .field('purpose', 'evidence')
      .attach(
        'file',
        Buffer.from('Synthetic dated evidence from 20 July 2026.'),
        { filename: 'evidence.txt', contentType: 'text/plain' },
      )
      .expect(201);
    expect(upload.body.duplicate).toBe(false);
    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/documents`)
      .set(auth(firstToken))
      .field('purpose', 'evidence')
      .attach(
        'file',
        Buffer.from('Synthetic dated evidence from 20 July 2026.'),
        { filename: 'evidence.txt', contentType: 'text/plain' },
      )
      .expect(201)
      .expect(({ body }: Response) => expect(body.duplicate).toBe(true));

    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/analyze`)
      .set(auth(firstToken))
      .expect(201);
    const ready = await waitForStatus(app, firstToken, caseId, 'READY');
    expect(ready.body.research.procedure.status).toBe('VERIFIED');
    expect(ready.body.analysis.readiness).toBe('ready');

    const unknown = await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/chat`)
      .set(auth(firstToken))
      .send({ question: 'What is the unknown fact on the account?' })
      .expect(201);
    expect(unknown.body.metadata.needsFact).toBe(true);
    const email = await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/drafts/email`)
      .set(auth(firstToken))
      .send({ transformation: 'concise' })
      .expect(201);
    const letter = await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/drafts/letter`)
      .set(auth(firstToken))
      .send({})
      .expect(201);
    const pdfResponse = await request(app.getHttpServer())
      .get(
        `/api/v1/cases/${caseId}/drafts/letter/${String(letter.body.id)}/pdf`,
      )
      .set(auth(firstToken));
    expect(pdfResponse.status, JSON.stringify(pdfResponse.body)).toBe(200);
    expect(pdfResponse.headers['content-type']).toMatch(/pdf/);

    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/submission`)
      .set(auth(firstToken))
      .send({
        method: 'email',
        date: '2026-08-20',
        sourceChoice: 'unchanged',
        draftRevisionId: email.body.id,
      })
      .expect(201)
      .expect(({ body }: Response) => {
        expect(body.status).toBe('AWAITING_RESPONSE');
        expect(body.submission.snapshot.text).toContain(
          'Request for reconsideration',
        );
      });
    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/responses`)
      .set(auth(firstToken))
      .send({
        text: 'We reviewed your submission but are maintaining the decision.',
      })
      .expect(201);
    const continued = await waitForStatus(app, firstToken, caseId, 'READY');
    expect(continued.body.responses[0].analysis.responseSummary).toContain(
      'maintained',
    );
  });

  it('rotates refresh tokens and revokes a reused token family', async () => {
    const signed = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'first@example.test',
        password: 'correct horse battery staple',
      })
      .expect(201);
    const originalCookie = signed.headers['set-cookie'];
    if (!originalCookie) throw new Error('Refresh cookie was not set');
    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(201);
    expect(rotated.body.accessToken).toBeTruthy();
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(401);
  });

  it('preserves an actual changed submission snapshot and deletes storage before records', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/cases')
      .set(auth(firstToken))
      .send({
        decisionText:
          'I previously submitted a synthetic request to Northfield Council and need to record the response.',
        previouslySubmitted: true,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/cases/${String(created.body.id)}/submission`)
      .set(auth(firstToken))
      .send({
        method: 'portal',
        date: '2026-08-18',
        sourceChoice: 'previously_submitted',
        actualText:
          'This exact synthetic text was submitted before using Recourse.',
      })
      .expect(201)
      .expect(({ body }: Response) =>
        expect(body.submission.snapshot.text).toContain('exact synthetic text'),
      );
    await request(app.getHttpServer())
      .delete(`/api/v1/cases/${String(created.body.id)}`)
      .set(auth(firstToken))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/cases/${String(created.body.id)}`)
      .set(auth(firstToken))
      .expect(404);
  });
});

async function waitForStatus(
  app: INestApplication,
  token: string,
  caseId: string,
  status: string,
): Promise<Response> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/cases/${caseId}`)
      .set({ Authorization: `Bearer ${token}` });
    if (
      response.body.status === status &&
      response.body.processing?.status !== 'running'
    )
      return response;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Case did not reach ${status}`);
}
