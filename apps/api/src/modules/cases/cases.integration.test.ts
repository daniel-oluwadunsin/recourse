import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ConfigService } from "@nestjs/config";
import { getModelToken } from "@nestjs/mongoose";
import { type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { type Model } from "mongoose";
import request from "supertest";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { configureHttpApplication } from "../../app-configure";
import { AppModule } from "../../app.module";
import { CaseEventService } from "./case-events.service";
import { CaseStateMachineService } from "./case-state-machine.service";
import { CaseTombstonedError } from "./cases.errors";
import { InstitutionLookupService } from "./institutions.service";
import { User, UserRole } from "../users/schemas/user.schema";

vi.hoisted(() => {
  process.env.APP_ENV = "test";
  process.env.AUTH_RATE_LIMIT_LIMIT = "1000";
  process.env.AUTH_COOKIE_SECURE = "false";
  process.env.JWT_ACCESS_SECRET =
    "test-access-secret-that-is-long-enough-for-jwt";
  process.env.JWT_REFRESH_SECRET =
    "test-refresh-secret-that-is-long-enough-for-jwt";
  process.env.MONGODB_AUTO_INDEX = "true";
  process.env.NODE_ENV = "test";
  process.env.RATE_LIMIT_STORAGE = "memory";
});

let testApp: INestApplication;

describe("case domain and deterministic workflow", () => {
  let mongo: MongoMemoryReplSet;
  let userA: string;
  let userB: string;
  let primaryCaseId: string;
  let primaryAccessToken: string;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    process.env.MONGODB_DATABASE = "recourse_case_test";
    process.env.MONGODB_URI = mongo.getUri();

    testApp = await NestFactory.create(AppModule, { bufferLogs: true });
    const config = testApp.get<ConfigService<EnvironmentConfig>>(ConfigService);
    configureHttpApplication(testApp, config, testApp.get(RecourseLogger));
    await testApp.init();

    userA = await signUp(
      "case-owner-a@example.com",
      "correct horse battery staple",
    );
    userB = await signUp(
      "case-owner-b@example.com",
      "correct horse battery staple",
    );

    const created = await createCase(userA, {
      title: "Primary case",
      institutionName: "Unknown Platform",
      relationship: "SELLER",
      decisionType: "SUSPENSION",
      financialImpact: { amount: "125.50", currency: "USD" },
      statedReason: "Policy review",
    });
    primaryCaseId = created.body.id as string;
    primaryAccessToken = userA;
  });

  afterAll(async () => {
    await testApp.close();
    await mongo.stop();
  });

  it("creates an INTAKE case and appends the initial activity event", async () => {
    expect(primaryCaseId).toEqual(expect.any(String));

    const response = await request(testApp.getHttpServer())
      .get(`/api/v1/cases/${primaryCaseId}`)
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .expect(200);

    expect(response.body.status).toBe("INTAKE");
    expect(response.body.currentStage).toBe("INTAKE");
    expect(response.body.financialImpact).toEqual({
      amount: "125.50",
      currency: "USD",
    });
    expect(response.body.decision.rawExtractedFields.decisionType).toBe(
      "SUSPENSION",
    );
    expect(response.body.decision.userCorrectedFields).toEqual({});

    const events = await request(testApp.getHttpServer())
      .get(`/api/v1/cases/${primaryCaseId}/events`)
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .expect(200);

    expect(events.body.items[0]).toMatchObject({
      sequence: 1,
      type: "CASE_CREATED",
    });
  });

  it("preserves raw decision data while applying a correction overlay", async () => {
    const before = await request(testApp.getHttpServer())
      .get(`/api/v1/cases/${primaryCaseId}`)
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .expect(200);

    const response = await request(testApp.getHttpServer())
      .patch(`/api/v1/cases/${primaryCaseId}`)
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .send({
        corrections: {
          decisionType: "RESTRICTION",
          institutionName: "Corrected Platform",
          statedReason: null,
        },
        expectedRevision: before.body.revision,
      })
      .expect(200);

    expect(response.body.decision.rawExtractedFields).toMatchObject({
      decisionType: "SUSPENSION",
      institutionName: "Unknown Platform",
      statedReason: "Policy review",
    });
    expect(response.body.decision.userCorrectedFields).toMatchObject({
      decisionType: "RESTRICTION",
      institutionName: "Corrected Platform",
      statedReason: null,
    });
    expect(response.body.decision.effectiveFields).toMatchObject({
      decisionType: "RESTRICTION",
      institutionName: "Corrected Platform",
      statedReason: null,
    });
    expect(response.body.decision.rawExtractedFields.decisionType).toBe(
      "SUSPENSION",
    );

    const events = await request(testApp.getHttpServer())
      .get(`/api/v1/cases/${primaryCaseId}/events`)
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .expect(200);
    expect(
      events.body.items.map((event: { type: string }) => event.type),
    ).toEqual(["CASE_CREATED", "DECISION_CORRECTED"]);
  });

  it("denies every case operation to another user", async () => {
    await request(testApp.getHttpServer())
      .get(`/api/v1/cases/${primaryCaseId}`)
      .set("Authorization", `Bearer ${userB}`)
      .expect(404);
    await request(testApp.getHttpServer())
      .get(`/api/v1/cases/${primaryCaseId}/events`)
      .set("Authorization", `Bearer ${userB}`)
      .expect(404);
    await request(testApp.getHttpServer())
      .patch(`/api/v1/cases/${primaryCaseId}`)
      .set("Authorization", `Bearer ${userB}`)
      .send({ expectedRevision: 1, title: "Unauthorized" })
      .expect(404);
    await request(testApp.getHttpServer())
      .delete(`/api/v1/cases/${primaryCaseId}`)
      .set("Authorization", `Bearer ${userB}`)
      .expect(404);
    await request(testApp.getHttpServer())
      .get(`/api/v1/cases/${primaryCaseId}/events/stream`)
      .set("Authorization", `Bearer ${userB}`)
      .expect(404);
    await request(testApp.getHttpServer())
      .get(`/api/v1/cases/${primaryCaseId}/events/stream`)
      .expect(401);
  });

  it("allocates monotonic sequences and replays duplicate events idempotently", async () => {
    const events = testApp.get(CaseEventService);
    const first = await events.append({
      actor: { actorId: null, actorType: "SYSTEM" },
      caseId: primaryCaseId,
      idempotencyKey: "phase3-duplicate-event",
      payload: { source: "test" },
      type: "CASE_UPDATED",
    });
    const duplicate = await events.append({
      actor: { actorId: null, actorType: "SYSTEM" },
      caseId: primaryCaseId,
      idempotencyKey: "phase3-duplicate-event",
      payload: { source: "different-payload" },
      type: "CASE_UPDATED",
    });
    expect(duplicate._id.toString()).toBe(first._id.toString());
    expect(duplicate.sequence).toBe(first.sequence);

    const concurrent = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        events.append({
          actor: { actorId: null, actorType: "SYSTEM" },
          caseId: primaryCaseId,
          idempotencyKey: `phase3-concurrent-${index}`,
          payload: { index },
          type: "CASE_UPDATED",
        }),
      ),
    );
    const sequences = concurrent
      .map((event) => event.sequence)
      .sort((a, b) => a - b);
    expect(new Set(sequences).size).toBe(5);
    expect(sequences).toEqual(
      Array.from({ length: 5 }, (_, index) => first.sequence + 1 + index),
    );
  });

  it("supports cursor pagination and status filters", async () => {
    await createCase(userA, { title: "Pagination case 1" });
    await createCase(userA, { title: "Pagination case 2" });

    const first = await request(testApp.getHttpServer())
      .get("/api/v1/cases?limit=1&status=INTAKE")
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect(first.body.items[0].status).toBe("INTAKE");

    const second = await request(testApp.getHttpServer())
      .get(
        `/api/v1/cases?limit=1&status=INTAKE&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      )
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
  });

  it("normalizes trusted institution aliases without verifying unknown domains", async () => {
    const institutions = testApp.get(InstitutionLookupService);
    await institutions.registerTrustedCatalogEntry({
      aliases: ["ACME APP"],
      canonicalName: "Acme Platform",
      domains: ["acme.example"],
      verifiedOfficialDomains: ["acme.example"],
    });

    const known = await institutions.lookup(" acme app ");
    expect(known.matchedBy).toBe("ALIAS");
    expect(known.institution?.canonicalName).toBe("Acme Platform");
    expect(known.institution?.verifiedOfficialDomains).toEqual([
      "acme.example",
    ]);

    const unknown = await institutions.lookup("Model Invented Institution");
    expect(unknown.institution).toBeNull();
    expect(unknown.matchedBy).toBe("NONE");
  });

  it("protects queue operations with staff RBAC and records safe health metadata", async () => {
    const users = testApp.get<Model<User>>(getModelToken(User.name));
    await users.updateOne(
      { email: "case-owner-a@example.com" },
      { $set: { role: UserRole.STAFF } },
    );

    const staffResponse = await request(testApp.getHttpServer())
      .get("/api/v1/admin/queues/health")
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .expect(200);
    expect(staffResponse.body.queues).toHaveLength(7);
    expect(staffResponse.body.queues[0]).toHaveProperty("oldestWaitingAgeMs");

    await request(testApp.getHttpServer())
      .get("/api/v1/admin/queues/failures")
      .set("Authorization", `Bearer ${userB}`)
      .expect(403);

    await users.updateOne(
      { email: "case-owner-a@example.com" },
      { $set: { role: UserRole.USER } },
    );
  });

  it("tombstones deleted cases and rejects late workflow transitions", async () => {
    const created = await createCase(userA, { title: "Tombstone case" });
    const caseId = created.body.id as string;
    const stateMachine = testApp.get(CaseStateMachineService);

    await stateMachine.transition(
      caseId,
      "CLASSIFYING",
      { actorId: "system-test", actorType: "SYSTEM" },
      { eventType: "CLASSIFICATION_COMPLETE", idempotencyKey: "classify-once" },
    );

    await request(testApp.getHttpServer())
      .delete(`/api/v1/cases/${caseId}`)
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .expect(204);
    await request(testApp.getHttpServer())
      .delete(`/api/v1/cases/${caseId}`)
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .expect(204);

    await expect(
      stateMachine.transition(caseId, "PROCEDURE_RESOLUTION", {
        actorId: "late-worker",
        actorType: "RECOURSE",
      }),
    ).rejects.toBeInstanceOf(CaseTombstonedError);
    await request(testApp.getHttpServer())
      .get(`/api/v1/cases/${caseId}`)
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .expect(404);
  });

  it("rejects stale case corrections", async () => {
    const created = await createCase(userA, { title: "Revision case" });
    const caseId = created.body.id as string;
    const revision = created.body.revision as number;

    await request(testApp.getHttpServer())
      .patch(`/api/v1/cases/${caseId}`)
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .send({ expectedRevision: revision, title: "First update" })
      .expect(200);
    await request(testApp.getHttpServer())
      .patch(`/api/v1/cases/${caseId}`)
      .set("Authorization", `Bearer ${primaryAccessToken}`)
      .send({ expectedRevision: revision, title: "Stale update" })
      .expect(409);
  });
});

async function signUp(email: string, password: string): Promise<string> {
  const response = await request(appForTest().getHttpServer())
    .post("/api/v1/auth/sign-up")
    .send({ email, password })
    .expect(201);
  return response.body.accessToken as string;
}

async function createCase(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  return request(appForTest().getHttpServer())
    .post("/api/v1/cases")
    .set("Authorization", `Bearer ${accessToken}`)
    .send(body)
    .expect(201);
}

function appForTest(): INestApplication {
  return testApp;
}
