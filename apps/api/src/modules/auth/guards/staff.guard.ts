import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";

import { type AuthenticatedRequest } from "./access-token.guard";
import { UserRole } from "../../users/schemas/user.schema";

@Injectable()
export class StaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.authenticatedUser?.user.role;
    if (role === UserRole.STAFF || role === UserRole.ADMIN) {
      return true;
    }

    throw new ForbiddenException("Staff authorization required.");
  }
}
