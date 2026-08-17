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

    this.logger.error(
      {
        code,
        method: request.method,
        path: request.url,
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

    return {
      code: isValidationError
        ? "VALIDATION_ERROR"
        : status === HttpStatus.NOT_FOUND
          ? "NOT_FOUND"
          : "BAD_REQUEST",
      message: isValidationError
        ? "Request validation failed."
        : typeof responseRecord?.message === "string"
          ? responseRecord.message
          : exception.message,
      details: isValidationError ? { issues: validationMessages } : {},
    };
  }
}
