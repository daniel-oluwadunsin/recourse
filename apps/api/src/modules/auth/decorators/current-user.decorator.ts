import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { type AuthenticatedRequest } from "../guards/access-token.guard";
import { type AuthenticatedUser } from "../auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    void _data;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.authenticatedUser) {
      throw new Error("CurrentUser decorator requires AccessTokenGuard");
    }

    return request.authenticatedUser;
  },
);
