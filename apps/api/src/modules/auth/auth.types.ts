import { type PublicUser } from "../users/users.service";

export interface AuthenticatedUser {
  user: PublicUser;
  userId: string;
}

export interface AuthRequestContext {
  correlationId?: string;
  ipAddress?: string;
  requestId?: string;
  userAgent?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}
