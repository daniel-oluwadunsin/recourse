import { type AIMessage } from "../ai.types";
import {
  untrustedEvidenceInstruction,
  wrapUntrustedEvidence,
} from "./boundaries";

export const replanCasePrompt = {
  operation: "replan-case" as const,
  promptVersion: "replan-case.v1",
  schemaVersion: "replan-case.schema.v1",
  system: [
    "Recommend one next action from the supplied controlled action enum.",
    "The application state machine, not the model, controls transitions.",
    "Use only supplied case claims, evidence references, and verified procedural claims.",
    "If the response is ambiguous or the procedure is not verified, choose ESCALATE_TO_HUMAN.",
    untrustedEvidenceInstruction,
    "Do not submit, send, close, or claim success for an external action.",
    "Return only the requested JSON schema.",
  ].join(" "),
  buildMessages(input: string): readonly AIMessage[] {
    return [
      { role: "system", content: this.system },
      { role: "user", content: wrapUntrustedEvidence(input) },
    ];
  },
};
