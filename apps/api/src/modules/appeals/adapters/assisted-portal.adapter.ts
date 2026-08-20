import { Injectable, ServiceUnavailableException } from "@nestjs/common";

import { type SubmissionCapability } from "@recourse/contracts";

import {
  type ActionAdapter,
  type ActionExecutionResult,
  type ActionVerificationResult,
  type PreparedAction,
} from "../appeal.types";
import { type CaseActionDocument } from "../schemas/case-action.schema";
import { normalizeUrl } from "../../retrieval/url-normalizer";

@Injectable()
export class AssistedPortalAdapter implements ActionAdapter {
  readonly name = "assisted-portal";

  capability(): SubmissionCapability {
    return "ASSISTED_PORTAL";
  }

  async prepare(action: CaseActionDocument): Promise<PreparedAction> {
    const recommendation = action.recommendation;
    const destination = readString(recommendation["officialDestination"]);
    const instructions = readStringArray(recommendation["instructions"]);
    if (!destination || !isHttpsUrl(destination) || instructions.length === 0) {
      throw new ServiceUnavailableException(
        "A verified official assisted destination is unavailable.",
      );
    }

    return {
      actionId: action._id.toString(),
      adapterName: this.name,
      canExecute: false,
      capability: "ASSISTED_PORTAL",
      destination,
      instructions,
      payload: {
        officialDestination: destination,
        instructions,
        submissionClaim: "USER_MUST_COMPLETE_ON_OFFICIAL_SITE",
      },
      payloadHash: action.payloadHash,
    };
  }

  async execute(
    prepared: PreparedAction,
    idempotencyKey: string,
  ): Promise<ActionExecutionResult> {
    void prepared;
    void idempotencyKey;
    throw new ServiceUnavailableException(
      "Assisted portal actions are not submitted by Recourse.",
    );
  }

  async verify(
    result: ActionExecutionResult,
  ): Promise<ActionVerificationResult> {
    void result;
    return {
      explanation:
        "No external submission occurred; user completion is required.",
      providerReference: null,
      verified: false,
    };
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isHttpsUrl(value: string): boolean {
  return normalizeUrl(value)?.canonicalUrl.startsWith("https://") ?? false;
}
