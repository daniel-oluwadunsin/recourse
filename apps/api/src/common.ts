import type {
  ArgumentsHost,
  ExceptionFilter,
  NestMiddleware,
} from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header('x-request-id');
    const requestId =
      incoming && incoming.length < 100 ? incoming : randomUUID();
    response.setHeader('x-request-id', requestId);
    next();
  }
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof AppError) {
      response.status(error.status).json({
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
      return;
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      const payload = error.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : typeof payload === 'object' && payload && 'message' in payload
            ? Array.isArray(payload.message)
              ? payload.message.join(' ')
              : String(payload.message)
            : 'The request could not be completed.';
      response.status(status).json({
        code:
          status === 401
            ? 'AUTHENTICATION_REQUIRED'
            : status === 403
              ? 'FORBIDDEN'
              : 'REQUEST_FAILED',
        message,
        retryable: status === HttpStatus.TOO_MANY_REQUESTS,
      });
      return;
    }
    console.error(
      'Unhandled request failure',
      error instanceof Error ? error.message : 'unknown',
    );
    response.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'I could not finish that step. Your saved work is still here.',
      retryable: true,
    });
  }
}
