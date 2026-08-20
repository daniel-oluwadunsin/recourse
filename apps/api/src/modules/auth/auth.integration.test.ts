import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ConfigService } from "@nestjs/config";
import { getModelToken } from "@nestjs/mongoose";
import { NestFactory } from "@nestjs/core";
import { type INestApplication } from "@nestjs/common";
import { type Model } from "mongoose";
import request from "supertest";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { configureHttpApplication } from "../../app-configure";
import { AppModule } from "../../app.module";
import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";
import { Case } from "../cases/schemas/case.schema";
import { AuthService } from "./auth.service";

vi.hoisted(() => {
  process.env.APP_ENV = "test";
  process.env.AUTH_RATE_LIMIT_LIMIT = "100";
  process.env.AUTH_COOKIE_SECURE = "false";
  process.env.JWT_ACCESS_SECRET =
    "test-access-secret-that-is-long-enough-for-jwt";
  process.env.JWT_REFRESH_SECRET =
    "test-refresh-secret-that-is-long-enough-for-jwt";
  process.env.MONGODB_AUTO_INDEX = "true";
  process.env.NODE_ENV = "test";
  process.env.RATE_LIMIT_STORAGE = "memory";
});

describe("authentication and authorization", () => {
  let app: INestApplication;
  let mongo: MongoMemoryReplSet;

  beforeAll(async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    process.env.MONGODB_DATABASE = "recourse_auth_test";
    process.env.MONGODB_URI = mongo.getUri();

    app = await NestFactory.create(AppModule, { bufferLogs: true });
    const config = app.get<ConfigService<EnvironmentConfig>>(ConfigService);
    const logger = app.get(RecourseLogger);
    configureHttpApplication(app, config, logger);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await mongo.stop();
  });

  it("signs up, normalizes the email, and keeps refresh tokens in cookies", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-up")
      .send({
        email: "  User@Example.COM ",
        password: "correct horse battery staple",
      })
      .expect(201);

    expect(response.body.user.email).toBe("user@example.com");
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toBeUndefined();
    expect(firstSetCookie(response)).toMatch(
      /^recourse_refresh=[^;]+; Max-Age=2592000; Path=\/api\/v1\/auth; Expires=[^;]+; HttpOnly; SameSite=Lax$/,
    );
  });

  it("returns a generic credential failure and protects the current-user route", async () => {
    const invalidResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({ email: "user@example.com", password: "wrong password" })
      .expect(401);

    expect(invalidResponse.body.error.message).toBe(
      "Invalid email or password.",
    );

    const signInResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({
        email: "USER@example.com",
        password: "correct horse battery staple",
      })
      .expect(201);

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${signInResponse.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.email).toBe("user@example.com");
      });
  });

  it("rotates refresh tokens and revokes the family after replay", async () => {
    const signInResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({
        email: "user@example.com",
        password: "correct horse battery staple",
      })
      .expect(201);
    const originalCookie = firstCookieValue(signInResponse);

    const refreshResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", originalCookie)
      .expect(201);
    const rotatedCookie = firstCookieValue(refreshResponse);

    expect(rotatedCookie).not.toBe(originalCookie);
    expect(refreshResponse.body.refreshToken).toBeUndefined();

    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", originalCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", rotatedCookie)
      .expect(401);
  });

  it("logs out by revoking the refresh-token family and clearing the cookie", async () => {
    const signInResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({
        email: "user@example.com",
        password: "correct horse battery staple",
      })
      .expect(201);
    const refreshCookie = firstCookieValue(signInResponse);

    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", refreshCookie)
      .expect(204)
      .expect(({ headers }) => {
        expect(headers["set-cookie"]?.[0]).toContain(
          "recourse_refresh=; Path=/api/v1/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT;",
        );
      });

    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(401);
  });

  it("resets a password with a single-use token and revokes existing sessions", async () => {
    const signUpResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-up")
      .send({
        email: "password-reset@example.com",
        password: "original password value",
      })
      .expect(201);
    const originalCookie = firstCookieValue(signUpResponse);

    const existingRequest = await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "password-reset@example.com" })
      .expect(202);
    const missingRequest = await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "not-present@example.com" })
      .expect(202);
    expect(existingRequest.body).toEqual(missingRequest.body);

    const auth = app.get(AuthService);
    const token = await auth.issuePasswordResetToken(
      signUpResponse.body.user.id as string,
    );
    await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/complete")
      .send({ password: "replacement password value", token })
      .expect(204)
      .expect(({ headers }) => {
        expect(headers["set-cookie"]?.[0]).toContain("recourse_refresh=;");
      });

    await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/complete")
      .send({ password: "another replacement value", token })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", originalCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({
        email: "password-reset@example.com",
        password: "original password value",
      })
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({
        email: "password-reset@example.com",
        password: "replacement password value",
      })
      .expect(201);
  });

  it("deletes the account, tombstones private cases, and invalidates the access session", async () => {
    const signUpResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-up")
      .send({
        email: "privacy-delete@example.com",
        password: "correct horse battery staple",
      })
      .expect(201);
    const accessToken = signUpResponse.body.accessToken as string;

    const caseResponse = await request(app.getHttpServer())
      .post("/api/v1/cases")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Private case" })
      .expect(201);

    await request(app.getHttpServer())
      .delete("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ password: "wrong password" })
      .expect(401);

    await request(app.getHttpServer())
      .get(`/api/v1/cases/${caseResponse.body.id as string}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ password: "correct horse battery staple" })
      .expect(204);

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get("/api/v1/cases")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);

    const caseModel = app.get<Model<Case>>(getModelToken(Case.name));
    const deletedCase = await caseModel.findById(caseResponse.body.id).exec();
    expect(deletedCase?.deletedAt).toBeInstanceOf(Date);
  });

  it("centralizes owner scoping and denies a different user", () => {
    const authorization = new OwnershipAuthorizationService();
    const ownerId = "507f1f77bcf86cd799439011";
    const otherUserId = "507f1f77bcf86cd799439012";

    expect(authorization.withOwnerScope(ownerId, { status: "OPEN" })).toEqual({
      ownerId: expect.anything(),
      status: "OPEN",
    });
    expect(() => authorization.assertOwner(ownerId, otherUserId)).toThrow(
      "You do not have access to this resource.",
    );
  });
});

function firstSetCookie(response: request.Response): string {
  const setCookie = response.headers["set-cookie"];
  if (!setCookie?.[0]) {
    throw new Error("Expected a Set-Cookie response header");
  }

  return setCookie[0];
}

function firstCookieValue(response: request.Response): string {
  const cookie = firstSetCookie(response).split(";")[0];
  if (!cookie) {
    throw new Error("Expected a cookie value");
  }

  return cookie;
}
