import { createHash, randomBytes, randomUUID } from "node:crypto";

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";

import { type EnvironmentConfig } from "@recourse/config";

import { AuthToken, AuthTokenType } from "./schemas/auth-token.schema";
import { RefreshToken } from "./schemas/refresh-token.schema";

export interface AccessTokenPayload {
  sub: string;
  tokenType: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  familyId: string;
  tokenType: "refresh";
}

export interface RotatedRefreshToken {
  token: string;
  userId: string;
  familyId: string;
}

export class RefreshTokenReuseDetectedError extends Error {
  constructor(
    readonly userId: string,
    readonly familyId: string,
  ) {
    super("Refresh token reuse detected");
    this.name = "RefreshTokenReuseDetectedError";
  }
}

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly jwtService: JwtService,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshToken>,
    @InjectModel(AuthToken.name)
    private readonly authTokenModel: Model<AuthToken>,
  ) {}

  async issueAccessToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: userId,
        tokenType: "access",
      } satisfies AccessTokenPayload,
      {
        audience: this.config.get("JWT_AUDIENCE") ?? "recourse-web",
        expiresIn: this.durationToSeconds(
          this.config.get("JWT_ACCESS_TTL") ?? "15m",
        ),
        issuer: this.config.get("JWT_ISSUER") ?? "recourse-api",
        secret: this.config.getOrThrow("JWT_ACCESS_SECRET"),
      },
    );
  }

  async issueRefreshToken(
    userId: string,
    familyId = randomUUID(),
  ): Promise<string> {
    if (!isValidObjectId(userId)) {
      throw new Error("Cannot issue a refresh token for an invalid user ID");
    }

    const jti = randomUUID();
    const ttlSeconds = this.durationToSeconds(
      this.config.get("JWT_REFRESH_TTL") ?? "30d",
    );
    const token = await this.jwtService.signAsync(
      {
        familyId,
        jti,
        sub: userId,
        tokenType: "refresh",
      } satisfies RefreshTokenPayload,
      {
        audience: this.config.get("JWT_AUDIENCE") ?? "recourse-web",
        expiresIn: ttlSeconds,
        issuer: this.config.get("JWT_ISSUER") ?? "recourse-api",
        secret: this.config.getOrThrow("JWT_REFRESH_SECRET"),
      },
    );

    await this.refreshTokenModel.create({
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      familyId,
      jti,
      revokedAt: null,
      revokeReason: null,
      tokenHash: this.hashToken(token),
      userId: new Types.ObjectId(userId),
      usedAt: null,
    });

    return token;
  }

  async rotateRefreshToken(rawToken: string): Promise<RotatedRefreshToken> {
    const payload = await this.verifyRefreshToken(rawToken);
    const tokenHash = this.hashToken(rawToken);
    const current = await this.refreshTokenModel
      .findOne({ jti: payload.jti })
      .select("+tokenHash")
      .exec();

    if (
      !current ||
      current.tokenHash !== tokenHash ||
      current.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException("Invalid refresh token.");
    }

    if (current.usedAt || current.revokedAt) {
      await this.revokeFamily(payload.familyId, "REUSE_DETECTED");
      throw new RefreshTokenReuseDetectedError(payload.sub, payload.familyId);
    }

    const nextJti = randomUUID();
    const ttlSeconds = this.durationToSeconds(
      this.config.get("JWT_REFRESH_TTL") ?? "30d",
    );
    const nextToken = await this.jwtService.signAsync(
      {
        familyId: payload.familyId,
        jti: nextJti,
        sub: payload.sub,
        tokenType: "refresh",
      } satisfies RefreshTokenPayload,
      {
        audience: this.config.get("JWT_AUDIENCE") ?? "recourse-web",
        expiresIn: ttlSeconds,
        issuer: this.config.get("JWT_ISSUER") ?? "recourse-api",
        secret: this.config.getOrThrow("JWT_REFRESH_SECRET"),
      },
    );

    try {
      const consumed = await this.refreshTokenModel
        .findOneAndUpdate(
          {
            _id: current._id,
            revokedAt: null,
            tokenHash,
            usedAt: null,
          },
          {
            $set: {
              replacedByJti: nextJti,
              usedAt: new Date(),
            },
          },
          { returnDocument: "after" },
        )
        .exec();

      if (!consumed) {
        await this.revokeFamily(payload.familyId, "REUSE_DETECTED");
        throw new RefreshTokenReuseDetectedError(payload.sub, payload.familyId);
      }

      await this.refreshTokenModel.create({
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        familyId: payload.familyId,
        jti: nextJti,
        revokedAt: null,
        revokeReason: null,
        tokenHash: this.hashToken(nextToken),
        userId: new Types.ObjectId(payload.sub),
        usedAt: null,
      });
    } catch (error: unknown) {
      if (!(error instanceof RefreshTokenReuseDetectedError)) {
        // The old token has already been consumed. Revoking the family fails
        // closed if persistence of its replacement did not complete.
        await this.revokeFamily(payload.familyId, "ROTATION_FAILED");
      }
      throw error;
    }

    return {
      familyId: payload.familyId,
      token: nextToken,
      userId: payload.sub,
    };
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.refreshTokenModel.updateMany(
      { familyId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokeReason: reason } },
    );
  }

  async revokeByRawToken(rawToken: string): Promise<string | undefined> {
    const token = await this.refreshTokenModel
      .findOne({ tokenHash: this.hashToken(rawToken) })
      .select("+tokenHash")
      .exec();

    if (!token) {
      return undefined;
    }

    await this.revokeFamily(token.familyId, "LOGOUT");
    return token.userId.toString();
  }

  async revokeAllForUser(
    userId: string,
    reason = "ACCOUNT_DELETION",
  ): Promise<void> {
    if (!isValidObjectId(userId)) return;
    await this.refreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: null },
      { $set: { revokedAt: new Date(), revokeReason: reason } },
    );
  }

  async issueOneTimeToken(
    userId: string,
    type: AuthTokenType,
    ttlMs: number,
  ): Promise<string> {
    if (!isValidObjectId(userId)) {
      throw new Error("Cannot issue a one-time token for an invalid user ID");
    }

    await this.authTokenModel.updateMany(
      {
        consumedAt: null,
        type,
        userId: new Types.ObjectId(userId),
      },
      { $set: { consumedAt: new Date() } },
    );
    const rawToken = randomBytes(32).toString("base64url");
    await this.authTokenModel.create({
      consumedAt: null,
      expiresAt: new Date(Date.now() + ttlMs),
      tokenHash: this.hashToken(rawToken),
      type,
      userId: new Types.ObjectId(userId),
    });
    return rawToken;
  }

  async consumeOneTimeToken(
    rawToken: string,
    type: AuthTokenType,
  ): Promise<string | undefined> {
    const consumed = await this.authTokenModel
      .findOneAndUpdate(
        {
          consumedAt: null,
          expiresAt: { $gt: new Date() },
          tokenHash: this.hashToken(rawToken),
          type,
        },
        { $set: { consumedAt: new Date() } },
        { returnDocument: "after" },
      )
      .exec();

    return consumed?.userId.toString();
  }

  private async verifyRefreshToken(
    rawToken: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        rawToken,
        {
          audience: this.config.get("JWT_AUDIENCE") ?? "recourse-web",
          issuer: this.config.get("JWT_ISSUER") ?? "recourse-api",
          secret: this.config.getOrThrow("JWT_REFRESH_SECRET"),
        },
      );

      if (
        payload.tokenType !== "refresh" ||
        !payload.jti ||
        !payload.familyId ||
        !isValidObjectId(payload.sub)
      ) {
        throw new Error("Invalid refresh token claims");
      }

      return payload;
    } catch {
      throw new UnauthorizedException("Invalid refresh token.");
    }
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private durationToSeconds(duration: string): number {
    const match = /^(\d+)(s|m|h|d)$/.exec(duration);
    if (!match) {
      throw new Error(`Invalid duration: ${duration}`);
    }

    const amount = Number(match[1]);
    const unit = match[2];
    if (!unit || !(unit in { d: 86400, h: 3600, m: 60, s: 1 })) {
      throw new Error(`Invalid duration: ${duration}`);
    }

    const multiplier = { d: 86400, h: 3600, m: 60, s: 1 }[
      unit as "d" | "h" | "m" | "s"
    ];
    return amount * multiplier;
  }
}
