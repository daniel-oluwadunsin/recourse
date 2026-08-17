import {
  Body,
  Controller,
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
import { type Request, type Response } from "express";

import { type EnvironmentConfig } from "@recourse/config";

import { getRequestContext } from "@recourse/logger";

import { SignInDto } from "./dto/sign-in.dto";
import { SignUpDto } from "./dto/sign-up.dto";
import { AuthService } from "./auth.service";
import { getRefreshCookieName, getRefreshCookieOptions } from "./auth-cookie";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AccessTokenGuard } from "./guards/access-token.guard";
import { type AuthenticatedUser, type AuthRequestContext } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<EnvironmentConfig>,
  ) {}

  @Post("sign-up")
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

  @Post("logout")
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
