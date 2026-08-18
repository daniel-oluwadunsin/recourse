import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import { EvidenceInputError } from "./file-policy.service";
import { StorageProviderError } from "../storage/storage.types";

export class EvidenceDeletedError extends Error {
  constructor() {
    super("Evidence has been deleted and cannot be processed.");
    this.name = "EvidenceDeletedError";
  }
}

export function toEvidenceHttpError(error: unknown): Error {
  if (error instanceof EvidenceInputError) {
    return new BadRequestException(error.message);
  }
  if (error instanceof StorageProviderError) {
    if (error.code === "NOT_FOUND") {
      return new NotFoundException("Evidence object was not found.");
    }
    return new ServiceUnavailableException(
      "Evidence storage is temporarily unavailable.",
    );
  }
  if (error instanceof EvidenceDeletedError) {
    return new ConflictException(error.message);
  }
  return error instanceof Error
    ? error
    : new Error("Evidence operation failed.");
}
