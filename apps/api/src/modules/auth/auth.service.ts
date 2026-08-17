import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { type EnvironmentConfig } from "@recourse/config";

import {
  AuditEventType,
  AuditOutcome,
} from "../audit/schemas/audit-log.schema";
import { AuditLogService } from "../audit/audit.service";
import { UsersService } from "../users/users.service";
import { AuthTokenType } from "./schemas/auth-token.schema";
import {
  AuthTokenService,
  RefreshTokenReuseDetectedError,
} from "./token.service";
import { PasswordService } from "./password.service";
import { type AuthRequestContext, type AuthSession } from "./auth.types";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class AuthService {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: AuthTokenService,
    private readonly usersService: UsersService,
  ) {}

  async signUp(
    email: string,
    password: string,
    context: AuthRequestContext,
  ): Promise<AuthSession> {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await this.passwordService.hash(password);
    let user: Awaited<ReturnType<UsersService["create"]>>;

    try {
      user = await this.usersService.create({
        email: normalizedEmail,
        passwordHash,
      });
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        await this.auditLogService.record(
          AuditEventType.AUTH_SIGN_UP_FAILURE,
          context,
          AuditOutcome.FAILURE,
          { action: "sign_up" },
          "ACCOUNT_CREATION_FAILED",
        );
        throw new ConflictException(
          "An account could not be created with these details.",
        );
      }
      throw error;
    }

    const session = await this.issueSession(user);
    await this.auditLogService.record(
      AuditEventType.AUTH_SIGN_UP,
      { ...context, userId: session.user.id },
      AuditOutcome.SUCCESS,
    );
    return session;
  }

  async signIn(
    email: string,
    password: string,
    context: AuthRequestContext,
  ): Promise<AuthSession> {
    const normalizedEmail = normalizeEmail(email);
    const user = await this.usersService.findForAuthentication(normalizedEmail);
    const validPassword = await this.passwordService.verify(
      password,
      user?.passwordHash,
    );

    if (!user || !validPassword || user.status !== "ACTIVE") {
      await this.auditLogService.record(
        AuditEventType.AUTH_SIGN_IN_FAILURE,
        context,
        AuditOutcome.FAILURE,
        { action: "sign_in" },
        "INVALID_CREDENTIALS",
      );
      throw new UnauthorizedException("Invalid email or password.");
    }

    const session = await this.issueSession(user);
    await this.auditLogService.record(
      AuditEventType.AUTH_SIGN_IN_SUCCESS,
      { ...context, userId: session.user.id },
      AuditOutcome.SUCCESS,
    );
    return session;
  }

  async refresh(
    refreshToken: string,
    context: AuthRequestContext,
  ): Promise<AuthSession> {
    try {
      const rotation = await this.tokenService.rotateRefreshToken(refreshToken);
      const user = await this.usersService.findActiveById(rotation.userId);

      if (!user) {
        await this.tokenService.revokeFamily(
          rotation.familyId,
          "USER_INACTIVE",
        );
        throw new UnauthorizedException("Invalid refresh token.");
      }

      const accessToken = await this.tokenService.issueAccessToken(
        rotation.userId,
      );
      const session = {
        accessToken,
        refreshToken: rotation.token,
        user: this.usersService.toPublicUser(user),
      } satisfies AuthSession;
      await this.auditLogService.record(
        AuditEventType.AUTH_REFRESH,
        { ...context, userId: session.user.id },
        AuditOutcome.SUCCESS,
      );
      return session;
    } catch (error: unknown) {
      if (error instanceof RefreshTokenReuseDetectedError) {
        await this.auditLogService.record(
          AuditEventType.AUTH_REFRESH_REUSE_DETECTED,
          { ...context, userId: error.userId },
          AuditOutcome.FAILURE,
          { familyId: error.familyId },
          "REFRESH_TOKEN_REUSE_DETECTED",
        );
        throw new UnauthorizedException("Invalid refresh token.");
      }

      if (error instanceof UnauthorizedException) {
        await this.auditLogService.record(
          AuditEventType.AUTH_REFRESH,
          context,
          AuditOutcome.FAILURE,
          {},
          "INVALID_REFRESH_TOKEN",
        );
        throw error;
      }

      throw error;
    }
  }

  async logout(
    refreshToken: string | undefined,
    context: AuthRequestContext,
  ): Promise<void> {
    const userId = refreshToken
      ? await this.tokenService.revokeByRawToken(refreshToken)
      : undefined;
    await this.auditLogService.record(
      AuditEventType.AUTH_LOGOUT,
      { ...context, ...(userId ? { userId } : {}) },
      AuditOutcome.SUCCESS,
    );
  }

  async currentUser(userId: string) {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException("Authentication required.");
    }
    return this.usersService.toPublicUser(user);
  }

  async issueEmailVerificationToken(userId: string): Promise<string> {
    const hours = this.config.get("EMAIL_VERIFICATION_TOKEN_TTL_HOURS") ?? 24;
    return this.tokenService.issueOneTimeToken(
      userId,
      AuthTokenType.EMAIL_VERIFICATION,
      hours * 60 * 60 * 1000,
    );
  }

  async issuePasswordResetToken(userId: string): Promise<string> {
    const minutes = this.config.get("PASSWORD_RESET_TOKEN_TTL_MINUTES") ?? 30;
    return this.tokenService.issueOneTimeToken(
      userId,
      AuthTokenType.PASSWORD_RESET,
      minutes * 60 * 1000,
    );
  }

  private async issueSession(
    user: Awaited<ReturnType<UsersService["create"]>>,
  ): Promise<AuthSession> {
    const userId = user._id.toString();
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.issueAccessToken(userId),
      this.tokenService.issueRefreshToken(userId),
    ]);

    return {
      accessToken,
      refreshToken,
      user: this.usersService.toPublicUser(user),
    };
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return error.code === 11000;
}
