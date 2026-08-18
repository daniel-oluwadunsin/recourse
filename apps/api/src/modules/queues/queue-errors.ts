import { UnrecoverableError } from "bullmq";

import { type QueueRetryCategory, type QueueName } from "@recourse/contracts";

export class TransientQueueError extends Error {
  constructor(
    message: string,
    readonly code = "TRANSIENT_PROVIDER_ERROR",
  ) {
    super(`[${code}] ${message}`);
    this.name = "TransientQueueError";
  }
}

export class NonRetryableQueueError extends UnrecoverableError {
  constructor(
    message: string,
    readonly code = "INVALID_JOB_INPUT",
  ) {
    super(`[${code}] ${message}`);
    this.name = "NonRetryableQueueError";
  }
}

export interface QueueFailureInput {
  queue: QueueName;
  jobId: string;
  jobName: string;
  category: QueueRetryCategory;
  code: string;
  message: string;
  attemptsMade: number;
  caseId?: string | null;
  evidenceId?: string | null;
  correlationId?: string | null;
}

export function classifyQueueError(error: unknown): QueueRetryCategory {
  if (error instanceof NonRetryableQueueError) {
    return "INVALID_INPUT";
  }
  if (error instanceof TransientQueueError) {
    return "TRANSIENT";
  }
  if (error instanceof Error && error.name === "UnrecoverableError") {
    return "INVALID_INPUT";
  }
  return "UNKNOWN";
}

export function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 100);
  }

  return error instanceof Error ? error.name.slice(0, 100) : "UNKNOWN_ERROR";
}

export function safeQueueErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 500);
}
