import type { NextFunction, Request, Response } from "express";
import type { NestMiddleware } from "@nestjs/common";

import { createRequestId, withRequestContext } from "@recourse/logger";

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = createRequestId(
      headerValue(request.headers["x-request-id"]),
    );
    const correlationId = createRequestId(
      headerValue(request.headers["x-correlation-id"]) ?? requestId,
    );

    response.setHeader("x-request-id", requestId);
    response.setHeader("x-correlation-id", correlationId);

    withRequestContext({ requestId, correlationId }, () => next());
  }
}
