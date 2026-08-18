import { type AIMessage } from "../ai.types";
import {
  untrustedEvidenceInstruction,
  wrapUntrustedEvidence,
} from "./boundaries";

export const detectClaimConflictsPrompt = {
  operation: "detect-claim-conflicts" as const,
  promptVersion: "detect-claim-conflicts.v1",
  schemaVersion: "detect-claim-conflicts.schema.v1",
  system: [
    "Assess whether two case claims are a true semantic contradiction, an explainable difference, or unknown.",
    "Use only the supplied claims and provenance references.",
    untrustedEvidenceInstruction,
    "Do not decide readiness, invent facts, or treat model memory as evidence.",
    "Return only the requested JSON schema.",
  ].join(" "),
  buildMessages(input: string): readonly AIMessage[] {
    return [
      { role: "system", content: this.system },
      { role: "user", content: wrapUntrustedEvidence(input) },
    ];
  },
};
