import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { type Request } from "express";

import { type EnvironmentConfig } from "@recourse/config";

import { type AuthenticatedUser } from "../auth.types";
import { UsersService } from "../../users/users.service";
import { type AccessTokenPayload } from "../token.service";

export interface AuthenticatedRequest extends Request {
  authenticatedUser?: AuthenticatedUser;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<EnvironmentConfig>,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readBearerToken(request);

    if (!token) {
      throw new UnauthorizedException("Authentication required.");
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          audience: this.config.get("JWT_AUDIENCE") ?? "recourse-web",
          issuer: this.config.get("JWT_ISSUER") ?? "recourse-api",
          secret: this.config.getOrThrow("JWT_ACCESS_SECRET"),
        },
      );

      if (payload.tokenType !== "access" || !payload.sub) {
        throw new Error("Invalid access token claims");
      }

      const user = await this.usersService.findActiveById(payload.sub);
      if (!user) {
        throw new Error("User is not active");
      }

      request.authenticatedUser = {
        user: this.usersService.toPublicUser(user),
        userId: user._id.toString(),
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid access token.");
    }
  }

  private readBearerToken(request: Request): string | undefined {
    const header = request.get("authorization");
    if (!header) {
      return undefined;
    }

    const [scheme, token] = header.split(" ");
    return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
  }
}
