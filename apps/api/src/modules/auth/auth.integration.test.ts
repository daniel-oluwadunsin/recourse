import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { type INestApplication } from "@nestjs/common";
import request from "supertest";

import { type EnvironmentConfig } from "@recourse/config";
import { RecourseLogger } from "@recourse/logger";

import { configureHttpApplication } from "../../app-configure";
import { AppModule } from "../../app.module";
import { OwnershipAuthorizationService } from "../../common/authorization/ownership.service";

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
