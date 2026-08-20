import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import { type Request, type Response } from "express";

import { type EnvironmentConfig } from "@recourse/config";

import { getRequestContext } from "@recourse/logger";

import { configuredRateLimit } from "../../common/security/rate-limit";
import { SignInDto } from "./dto/sign-in.dto";
import { SignUpDto } from "./dto/sign-up.dto";
import { DeleteAccountDto } from "./dto/delete-account.dto";
import { RequestPasswordResetDto } from "./dto/request-password-reset.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { AuthService } from "./auth.service";
import { AccountDeletionService } from "./account-deletion.service";
import { getRefreshCookieName, getRefreshCookieOptions } from "./auth-cookie";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AccessTokenGuard } from "./guards/access-token.guard";
import { type AuthenticatedUser, type AuthRequestContext } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly accountDeletion: AccountDeletionService,
  ) {}

  @Post("sign-up")
  @Throttle({
    default: {
      limit: () => configuredRateLimit("AUTH_SIGN_UP_RATE_LIMIT"),
      ttl: 900000,
    },
  })
  async signUp(
    @Body() body: SignUpDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.signUp(
      body.email,
      body.password,
      this.requestContext(request),
    );
    this.setRefreshCookie(response, session.refreshToken);
    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post("sign-in")
  @Throttle({
    default: {
      limit: () => configuredRateLimit("AUTH_SIGN_IN_RATE_LIMIT"),
      ttl: 900000,
    },
  })
  async signIn(
    @Body() body: SignInDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.signIn(
      body.email,
      body.password,
      this.requestContext(request),
    );
    this.setRefreshCookie(response, session.refreshToken);
    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post("refresh")
  @Throttle({
    default: {
      limit: () => configuredRateLimit("AUTH_REFRESH_RATE_LIMIT"),
      ttl: 60000,
    },
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.readRefreshCookie(request);
    if (!refreshToken) {
      return this.rejectMissingRefreshToken();
    }

    const session = await this.authService.refresh(
      refreshToken,
      this.requestContext(request),
    );
    this.setRefreshCookie(response, session.refreshToken);
    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }

  @Post("password-reset/request")
  @Throttle({
    default: {
      limit: () => configuredRateLimit("AUTH_SIGN_IN_RATE_LIMIT"),
      ttl: 900000,
    },
  })
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Body() body: RequestPasswordResetDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.authService.requestPasswordReset(
      body.email,
      this.requestContext(request),
    );
    return {
      message:
        "If an active account matches that email, a reset link has been sent.",
    };
  }

  @Post("password-reset/complete")
  @Throttle({
    default: {
      limit: () => configuredRateLimit("AUTH_SIGN_IN_RATE_LIMIT"),
      ttl: 900000,
    },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.resetPassword(
      body.token,
      body.password,
      this.requestContext(request),
    );
    response.clearCookie(
      getRefreshCookieName(this.config),
      getRefreshCookieOptions(this.config),
    );
  }

  @Post("logout")
  @Throttle({
    default: {
      limit: () => configuredRateLimit("AUTH_REFRESH_RATE_LIMIT"),
      ttl: 60000,
    },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(
      this.readRefreshCookie(request),
      this.requestContext(request),
    );
    response.clearCookie(
      getRefreshCookieName(this.config),
      getRefreshCookieOptions(this.config),
    );
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  me(@CurrentUser() authenticatedUser: AuthenticatedUser) {
    return { user: authenticatedUser.user };
  }

  @Delete("me")
  @UseGuards(AccessTokenGuard)
  @Throttle({
    default: {
      limit: () => configuredRateLimit("ACCOUNT_DELETION_RATE_LIMIT"),
      ttl: 900000,
    },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @Body() body: DeleteAccountDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.accountDeletion.deleteAccount(
      currentUser.userId,
      body.password,
      this.requestContext(request),
    );
    response.clearCookie(
      getRefreshCookieName(this.config),
      getRefreshCookieOptions(this.config),
    );
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[getRefreshCookieName(this.config)];
    return typeof value === "string" ? value : undefined;
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(
      getRefreshCookieName(this.config),
      token,
      getRefreshCookieOptions(this.config),
    );
  }

  private rejectMissingRefreshToken(): never {
    throw new UnauthorizedException("Invalid refresh token.");
  }

  private requestContext(request: Request): AuthRequestContext {
    const context = getRequestContext();
    return {
      correlationId: context?.correlationId,
      ipAddress: request.ip,
      requestId: context?.requestId,
      userAgent: request.get("user-agent"),
    };
  }
}
