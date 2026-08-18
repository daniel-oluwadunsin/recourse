import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { type SubmissionCapability } from "@recourse/contracts";

import {
  type ActionAdapter,
  type ActionExecutionResult,
  type ActionVerificationResult,
  type PreparedAction,
} from "../appeal.types";
import { type CaseActionDocument } from "../schemas/case-action.schema";

/**
 * The adapter boundary is real, but intentionally unavailable until a
 * transactional provider and verified sender/domain are configured.
 */
@Injectable()
export class EmailActionAdapter implements ActionAdapter {
  readonly name = "email-unconfigured";

  capability(): SubmissionCapability {
    return "EMAIL";
  }

  async prepare(action: CaseActionDocument): Promise<PreparedAction> {
    void action;
    throw new ServiceUnavailableException(
      "Email submission is unavailable until a real email provider is configured.",
    );
  }

  async execute(
    prepared: PreparedAction,
    idempotencyKey: string,
  ): Promise<ActionExecutionResult> {
    void prepared;
    void idempotencyKey;
    throw new ServiceUnavailableException("Email submission is unavailable.");
  }

  async verify(
    result: ActionExecutionResult,
  ): Promise<ActionVerificationResult> {
    void result;
    return {
      explanation: "Email provider is not configured.",
      providerReference: null,
      verified: false,
    };
  }
}
