import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { type ApiErrorCode } from "@recourse/contracts";
import { RecourseLogger, getRequestContext } from "@recourse/logger";
import { captureServerException } from "../sentry";

@Catch()
@Injectable()
export class HttpErrorFilter implements ExceptionFilter {
  constructor(private readonly logger: RecourseLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = getRequestContext()?.requestId ?? "unknown";
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const { code, message, details } = this.toErrorDetails(exception, status);

    if (status >= 500) {
      captureServerException(exception, { code, path: request.path });
    }

    this.logger.error(
      {
        code,
        method: request.method,
        path: request.path,
        status,
      },
      undefined,
      "HttpErrorFilter",
    );

    response.status(status).json({
      error: {
        code,
        message,
        requestId,
        details,
      },
    });
  }

  private toErrorDetails(
    exception: unknown,
    status: number,
  ): {
    code: ApiErrorCode;
    message: string;
    details: Record<string, unknown>;
  } {
    if (!(exception instanceof HttpException)) {
      return {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        details: {},
      };
    }

    const exceptionResponse = exception.getResponse();
    const responseRecord =
      typeof exceptionResponse === "object" && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : undefined;
    const validationMessages = responseRecord?.message;
    const isValidationError =
      status === HttpStatus.BAD_REQUEST && Array.isArray(validationMessages);
    const code = this.errorCodeForStatus(status, isValidationError);

    return {
      code,
      message: isValidationError
        ? "Request validation failed."
        : status === HttpStatus.TOO_MANY_REQUESTS
          ? "Too many requests. Please wait and try again."
          : status >= 500
            ? "Service unavailable."
            : typeof responseRecord?.message === "string"
              ? responseRecord.message
              : exception.message,
      details: isValidationError ? { issues: validationMessages } : {},
    };
  }

  private errorCodeForStatus(
    status: number,
    isValidationError: boolean,
  ): ApiErrorCode {
    if (isValidationError) {
      return "VALIDATION_ERROR";
    }

    if (status === HttpStatus.UNAUTHORIZED) {
      return "UNAUTHORIZED";
    }

    if (status === HttpStatus.FORBIDDEN) {
      return "FORBIDDEN";
    }

    if (status === HttpStatus.CONFLICT) {
      return "CONFLICT";
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return "TOO_MANY_REQUESTS";
    }

    if (status === HttpStatus.NOT_FOUND) {
      return "NOT_FOUND";
    }

    if (status >= 500) {
      return "SERVICE_UNAVAILABLE";
    }

    return "BAD_REQUEST";
  }
}
