import { Injectable } from "@nestjs/common";

import { type EvidenceProcessingStatus } from "@recourse/contracts";

const allowedTransitions: Record<
  EvidenceProcessingStatus,
  readonly EvidenceProcessingStatus[]
> = {
  DELETED: [],
  DELETING: ["DELETED"],
  FAILED: ["QUEUED", "PROCESSING", "DELETING"],
  PROCESSING: ["READY", "UNSUPPORTED", "FAILED", "DELETING"],
  QUEUED: ["PROCESSING", "DELETING"],
  READY: ["DELETING"],
  UNSUPPORTED: ["DELETING"],
  UPLOADED: ["QUEUED", "PROCESSING", "DELETING"],
  UPLOADING: ["UPLOADED", "FAILED", "DELETING"],
};

@Injectable()
export class EvidenceStateMachineService {
  canTransition(
    from: EvidenceProcessingStatus,
    to: EvidenceProcessingStatus,
  ): boolean {
    return from === to || allowedTransitions[from].includes(to);
  }

  assertTransition(
    from: EvidenceProcessingStatus,
    to: EvidenceProcessingStatus,
  ): void {
    if (!this.canTransition(from, to)) {
      throw new Error(`Invalid evidence transition: ${from} -> ${to}`);
    }
  }

  transitions(): Readonly<
    Record<EvidenceProcessingStatus, readonly EvidenceProcessingStatus[]>
  > {
    return allowedTransitions;
  }
}
