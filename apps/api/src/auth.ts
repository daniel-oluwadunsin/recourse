import type { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  Body,
  ConflictException,
  Controller,
  createParamDecorator,
  Get,
  Inject,
  Injectable,
  Post,
  Put,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsString, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { Environment, durationToSeconds } from './config';
import {
  RefreshSessionRecord,
  UserRecord,
  type UserDocument,
} from './database.schemas';

const REFRESH_COOKIE = 'recourse_refresh';
export const AI_CONSENT_VERSION = 'gemini-unpaid-disclosure-v1';

export interface AuthenticatedRequest extends Request {
  user: { id: string; email: string };
}

export class CredentialsDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  password!: string;
}

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(Environment) private readonly environment: Environment,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new UnauthorizedException('Sign in to continue.');
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        kind: string;
      }>(header.slice(7), { secret: this.environment.JWT_ACCESS_SECRET });
      if (payload.kind !== 'access' || !Types.ObjectId.isValid(payload.sub))
        throw new Error('invalid');
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException(
        'Your session has expired. Sign in again.',
      );
    }
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedRequest['user'] =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

export const CurrentCookie = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<Request>();
    return request.cookies?.[REFRESH_COOKIE] as string | undefined;
  },
);

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(UserRecord.name) private readonly users: Model<UserRecord>,
    @InjectModel(RefreshSessionRecord.name)
    private readonly sessions: Model<RefreshSessionRecord>,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(Environment) private readonly environment: Environment,
  ) {}

  async signup(email: string, password: string) {
    const normalized = email.trim().toLowerCase();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    let user: UserDocument;
    try {
      user = await this.users.create({
        email: normalized,
        passwordHash,
        aiConsent: null,
      });
    } catch (error: unknown) {
      if (isDuplicateKey(error))
        throw new ConflictException(
          'An account already exists for this email.',
        );
      throw error;
    }
    return this.issueSession(user, randomUUID());
  }

  async login(email: string, password: string) {
    const user = await this.users
      .findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash')
      .exec();
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    return this.issueSession(user, randomUUID());
  }

  async refresh(rawToken: string | undefined) {
    if (!rawToken) throw new UnauthorizedException('Sign in to continue.');
    let payload: { sub: string; email: string; kind: string; familyId: string };
    try {
      payload = await this.jwt.verifyAsync(rawToken, {
        secret: this.environment.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException(
        'Your session has expired. Sign in again.',
      );
    }
    const tokenHash = hashToken(rawToken);
    const session = await this.sessions.findOne({ tokenHash }).exec();
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      if (payload.familyId) {
        await this.sessions.updateMany(
          { familyId: payload.familyId, revokedAt: null },
          { revokedAt: new Date() },
        );
      }
      throw new UnauthorizedException(
        'Your session has expired. Sign in again.',
      );
    }
    session.revokedAt = new Date();
    await session.save();
    const user = await this.users.findById(payload.sub).exec();
    if (!user) throw new UnauthorizedException('Sign in to continue.');
    return this.issueSession(user, payload.familyId);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.sessions.updateOne(
      { tokenHash: hashToken(rawToken) },
      { revokedAt: new Date() },
    );
  }

  async consent(userId: string) {
    const acceptedAt = new Date();
    await this.users.updateOne(
      { _id: new Types.ObjectId(userId) },
      { aiConsent: { version: AI_CONSENT_VERSION, acceptedAt } },
    );
    return { version: AI_CONSENT_VERSION, acceptedAt };
  }

  async me(userId: string) {
    const user = await this.users.findById(userId).exec();
    if (!user) throw new UnauthorizedException('Sign in to continue.');
    return this.publicUser(user);
  }

  async hasConsent(userId: string): Promise<boolean> {
    const user = await this.users
      .findById(userId)
      .select('aiConsent')
      .lean()
      .exec();
    return user?.aiConsent?.version === AI_CONSENT_VERSION;
  }

  private async issueSession(user: UserDocument, familyId: string) {
    const accessSeconds = durationToSeconds(this.environment.JWT_ACCESS_TTL);
    const refreshSeconds = durationToSeconds(this.environment.JWT_REFRESH_TTL);
    const payload = { sub: user._id.toString(), email: user.email };
    const accessToken = await this.jwt.signAsync(
      { ...payload, kind: 'access' },
      { secret: this.environment.JWT_ACCESS_SECRET, expiresIn: accessSeconds },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...payload, kind: 'refresh', familyId, jti: randomUUID() },
      {
        secret: this.environment.JWT_REFRESH_SECRET,
        expiresIn: refreshSeconds,
      },
    );
    await this.sessions.create({
      userId: user._id,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + refreshSeconds * 1000),
      revokedAt: null,
    });
    return { accessToken, refreshToken, user: this.publicUser(user) };
  }

  private publicUser(user: UserDocument) {
    return {
      id: user._id.toString(),
      email: user.email,
      hasAiConsent: user.aiConsent?.version === AI_CONSENT_VERSION,
    };
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Environment) private readonly environment: Environment,
  ) {}

  @Post('signup')
  async signup(
    @Body() body: CredentialsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.signup(body.email, body.password);
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post('login')
  async login(
    @Body() body: CredentialsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(body.email, body.password);
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post('refresh')
  async refresh(
    @Res({ passthrough: true }) response: Response,
    @CurrentCookie() token: string | undefined,
  ) {
    const session = await this.auth.refresh(token);
    this.setRefreshCookie(response, session.refreshToken);
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post('logout')
  async logout(
    @Res({ passthrough: true }) response: Response,
    @CurrentCookie() token: string | undefined,
  ) {
    await this.auth.logout(token);
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AccessGuard)
  me(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.auth.me(user.id);
  }

  @Put('consent')
  @UseGuards(AccessGuard)
  consent(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.auth.consent(user.id);
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.environment.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: durationToSeconds(this.environment.JWT_REFRESH_TTL) * 1000,
    });
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}
