import { Readable } from "node:stream";
import { createHash } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { configureHttpApplication } from "../../app-configure";
import { AppModule } from "../../app.module";
import { EvidenceService } from "./evidence.service";
import { EvidenceDeletedError } from "./evidence.errors";
import {
  type DownloadAccess,
  type StorageHealth,
  type StorageProvider,
  StorageProviderError,
  type StoredObjectMetadata,
  type UploadIntent,
  STORAGE_PROVIDER,
} from "../storage/storage.types";

vi.hoisted(() => {
  process.env.APP_ENV = "test";
  process.env.AUTH_COOKIE_SECURE = "false";
  process.env.AUTH_RATE_LIMIT_LIMIT = "1000";
  process.env.JWT_ACCESS_SECRET =
    "test-access-secret-that-is-long-enough-for-jwt";
  process.env.JWT_REFRESH_SECRET =
    "test-refresh-secret-that-is-long-enough-for-jwt";
  process.env.MONGODB_AUTO_INDEX = "true";
  process.env.NODE_ENV = "test";
  process.env.RATE_LIMIT_STORAGE = "memory";
});

class TestStorageProvider implements StorageProvider {
  readonly objects = new Map<string, Buffer>();
  lastKey: string | null = null;

  async createUploadIntent(input: {
    storageKey: string;
    expiresAt: Date;
  }): Promise<UploadIntent> {
    this.lastKey = input.storageKey;
    return {
      expiresAt: input.expiresAt,
      fields: { public_id: input.storageKey },
      uploadUrl: "https://test-storage.invalid/upload",
    };
  }

  seedLast(body: Buffer): void {
    if (!this.lastKey) {
      throw new Error("No upload intent exists");
    }
    this.objects.set(this.lastKey, body);
  }

  async getObjectMetadata(storageKey: string): Promise<StoredObjectMetadata> {
    const body = this.objects.get(storageKey);
    if (!body) {
      throw new StorageProviderError("Object not found", "NOT_FOUND");
    }
    return {
      assetId: `test-asset-${storageKey}`,
      byteSize: body.length,
      contentType: null,
      resourceType: "raw",
      storageKey,
      version: "1",
    };
  }

  async downloadObject(storageKey: string): Promise<Readable> {
    const body = this.objects.get(storageKey);
    if (!body) {
      throw new StorageProviderError("Object not found", "NOT_FOUND");
    }
    return Readable.from([body]);
  }

  async createDownloadAccess(
    storageKey: string,
    expiresAt: Date,
  ): Promise<DownloadAccess> {
    if (!this.objects.has(storageKey)) {
      throw new StorageProviderError("Object not found", "NOT_FOUND");
    }
    return { expiresAt, url: `https://test-storage.invalid/${storageKey}` };
  }

  async deleteObject(storageKey: string): Promise<void> {
    this.objects.delete(storageKey);
  }

  async uploadObject(input: {
    storageKey: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<StoredObjectMetadata> {
    this.objects.set(input.storageKey, input.bytes);
    return {
      assetId: `test-asset-${input.storageKey}`,
      byteSize: input.bytes.length,
      contentType: input.contentType,
      resourceType: "raw",
      storageKey: input.storageKey,
      version: "1",
    };
  }

  async healthCheck(): Promise<StorageHealth> {
    return { provider: "cloudinary", status: "ok" };
  }
}

describe("evidence upload ownership and lifecycle", () => {
  let app: INestApplication;
  let mongo: MongoMemoryReplSet;
  let storage: TestStorageProvider;
  let ownerAToken: string;
  let ownerBToken: string;
  let caseId: string;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    process.env.MONGODB_DATABASE = "recourse_evidence_test";
    process.env.MONGODB_URI = mongo.getUri();
    storage = new TestStorageProvider();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_PROVIDER)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    currentTestApp = app;
    const config = app.get<ConfigService<EnvironmentConfig>>(ConfigService);
    configureHttpApplication(app, config, app.get(RecourseLogger));
    await app.init();

    ownerAToken = await signUp("evidence-owner-a@example.com");
    ownerBToken = await signUp("evidence-owner-b@example.com");
    const created = await request(app.getHttpServer())
      .post("/api/v1/cases")
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ title: "Evidence case" })
      .expect(201);
    caseId = created.body.id as string;
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it("rejects malicious names, MIME mismatches, and oversized files", async () => {
    await uploadIntent({
      byteSize: 5,
      filename: "../unsafe.pdf",
      mimeType: "application/pdf",
    }).expect(400);
    await uploadIntent({
      byteSize: 5,
      filename: "notice.exe",
      mimeType: "application/pdf",
    }).expect(400);
    await uploadIntent({
      byteSize: 25 * 1024 * 1024 + 1,
      filename: "notice.pdf",
      mimeType: "application/pdf",
    }).expect(400);
  });

  it("verifies the uploaded object, detects duplicates, and enforces ownership", async () => {
    const body = Buffer.from("%PDF-1.7\nminimal test object", "utf8");
    const intent = await uploadIntent({
      byteSize: body.length,
      filename: "notice.pdf",
      mimeType: "application/pdf",
    }).expect(201);
    storage.seedLast(body);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const complete = await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/evidence/complete`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ evidenceId: intent.body.evidenceId, sha256 })
      .expect(201);
    expect(complete.body.sha256).toBe(sha256);
    expect(complete.body.processingStatus).toBe("UPLOADED");

    await request(app.getHttpServer())
      .get(`/api/v1/cases/${caseId}/evidence/${intent.body.evidenceId}`)
      .set("Authorization", `Bearer ${ownerBToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/evidence/complete`)
      .set("Authorization", `Bearer ${ownerBToken}`)
      .send({ evidenceId: intent.body.evidenceId })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/cases/${caseId}/evidence/${intent.body.evidenceId}`)
      .set("Authorization", `Bearer ${ownerBToken}`)
      .expect(404);

    const duplicateIntent = await uploadIntent({
      byteSize: body.length,
      filename: "notice-copy.pdf",
      mimeType: "application/pdf",
    }).expect(201);
    storage.seedLast(body);
    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/evidence/complete`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ evidenceId: duplicateIntent.body.evidenceId })
      .expect(409);
    expect(storage.objects.has(storage.lastKey as string)).toBe(false);
  });

  it("persists pasted text as ready, provenance-backed evidence", async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/evidence/text`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({
        kind: "DECISION_NOTICE",
        label: "Decision notes",
        text: "The notice says access ended.",
      })
      .expect(201);

    expect(created.body).toMatchObject({
      extractionMethod: "PLAIN_TEXT",
      kind: "DECISION_NOTICE",
      label: "Decision notes",
      processingStatus: "READY",
    });
    const blocks = await request(app.getHttpServer())
      .get(`/api/v1/cases/${caseId}/evidence/${created.body.id}/blocks`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .expect(200);
    expect(blocks.body[0]).toMatchObject({
      blockType: "TEXT",
      provenance: { status: "USER_ASSERTED" },
      text: "The notice says access ended.",
    });

    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/evidence/text`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ text: "The notice says access ended." })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/evidence/text`)
      .set("Authorization", `Bearer ${ownerBToken}`)
      .send({ text: "Owner B must not attach to this case." })
      .expect(404);
  });

  it("persists the disabled scanner result when file processing completes", async () => {
    const body = Buffer.from("A distinct plain-text decision notice.", "utf8");
    const intent = await uploadIntent({
      byteSize: body.length,
      filename: "scanner-disabled.txt",
      mimeType: "text/plain",
    }).expect(201);
    storage.seedLast(body);
    const complete = await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/evidence/complete`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ evidenceId: intent.body.evidenceId })
      .expect(201);

    const processed = await app
      .get(EvidenceService)
      .process(
        intent.body.evidenceId as string,
        complete.body.revision as number,
        { actorId: null, actorType: "SYSTEM" },
      );

    expect(processed).toMatchObject({
      malwareScanStatus: "SKIPPED",
      processingStatus: "READY",
    });
  });

  it("tombstones evidence, makes repeated deletion idempotent, and rejects late processing", async () => {
    const body = Buffer.from("%PDF-1.7\nlate worker object", "utf8");
    const intent = await uploadIntent({
      byteSize: body.length,
      filename: "late.pdf",
      mimeType: "application/pdf",
    }).expect(201);
    storage.seedLast(body);
    const complete = await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/evidence/complete`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ evidenceId: intent.body.evidenceId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/cases/${caseId}/evidence/${intent.body.evidenceId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/api/v1/cases/${caseId}/evidence/${intent.body.evidenceId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/cases/${caseId}/evidence/${intent.body.evidenceId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .expect(404);

    const service = app.get(EvidenceService);
    await expect(
      service.process(
        intent.body.evidenceId as string,
        complete.body.revision,
        {
          actorId: null,
          actorType: "SYSTEM",
        },
      ),
    ).rejects.toBeInstanceOf(EvidenceDeletedError);
  });

  it("cascades case tombstones to attached storage objects", async () => {
    const body = Buffer.from("%PDF-1.7\ncase deletion object", "utf8");
    const intent = await uploadIntent({
      byteSize: body.length,
      filename: "case-delete.pdf",
      mimeType: "application/pdf",
    }).expect(201);
    storage.seedLast(body);
    await request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/evidence/complete`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ evidenceId: intent.body.evidenceId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/cases/${caseId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .expect(204);
    expect(storage.objects.size).toBe(0);
    await request(app.getHttpServer())
      .delete(`/api/v1/cases/${caseId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/cases/${caseId}/evidence/${intent.body.evidenceId}`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .expect(404);
  });

  function uploadIntent(input: {
    byteSize: number;
    filename: string;
    mimeType: string;
  }) {
    return request(app.getHttpServer())
      .post(`/api/v1/cases/${caseId}/evidence/upload-intent`)
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({
        byteSize: input.byteSize,
        kind: "DECISION_NOTICE",
        mimeType: input.mimeType,
        originalFilename: input.filename,
      });
  }
});

async function signUp(email: string): Promise<string> {
  const response = await request(testAppServer())
    .post("/api/v1/auth/sign-up")
    .send({ email, password: "correct horse battery staple" })
    .expect(201);
  return response.body.accessToken as string;
}

let currentTestApp: INestApplication | null = null;
function testAppServer() {
  if (!currentTestApp) {
    throw new Error("Test application is not initialized");
  }
  return currentTestApp.getHttpServer();
}
