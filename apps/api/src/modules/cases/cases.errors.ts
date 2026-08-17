import { ConflictException } from "@nestjs/common";

export class InvalidCaseTransitionError extends ConflictException {
  constructor(from: string, to: string) {
    super(`Case cannot transition from ${from} to ${to}.`);
  }
}

export class CaseTombstonedError extends ConflictException {
  constructor() {
    super("Case has been deleted and cannot be changed.");
  }
}

export class StaleCaseRevisionError extends ConflictException {
  constructor() {
    super("The case changed before this update was applied.");
  }
}
