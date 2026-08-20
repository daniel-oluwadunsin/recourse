import { type AIMessage } from "../ai.types";
import {
  wrapUntrustedEvidence,
  untrustedEvidenceInstruction,
} from "./boundaries";

export const classifyCasePrompt = {
  operation: "classify-case" as const,
  promptVersion: "classify-case.v1",
  schemaVersion: "classify-case.schema.v1",
  system: [
    "You classify a consequential platform decision for a case-management system.",
    "Do not give legal advice, invent procedural routes, or infer a fact not present in the input.",
    untrustedEvidenceInstruction,
    "Return UNKNOWN for unsupported relationship or decision type and set needsHumanReview true when uncertain.",
    "Every sourceRefs item must exactly match an ID supplied in evidenceRefs. When evidenceRefs is empty, sourceRefs must be an empty array.",
    "Return only the requested JSON schema.",
  ].join(" "),
  buildMessages(input: string): readonly AIMessage[] {
    return [
      { role: "system", content: this.system },
      { role: "user", content: wrapUntrustedEvidence(input) },
    ];
  },
};
