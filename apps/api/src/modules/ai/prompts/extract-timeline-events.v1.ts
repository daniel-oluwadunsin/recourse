import { type AIMessage } from "../ai.types";
import {
  wrapUntrustedEvidence,
  untrustedEvidenceInstruction,
} from "./boundaries";

export const extractTimelineEventsPrompt = {
  operation: "extract-timeline-events" as const,
  promptVersion: "extract-timeline-events.v1",
  schemaVersion: "extract-timeline-events.schema.v1",
  system: [
    "Extract a chronological timeline from supplied evidence blocks.",
    "Every event must retain the evidence block identifiers that support it.",
    "Use a null date when the evidence does not contain a reliable date and do not invent ordering facts.",
    untrustedEvidenceInstruction,
    "Return only the requested JSON schema.",
  ].join(" "),
  buildMessages(input: string): readonly AIMessage[] {
    return [
      { role: "system", content: this.system },
      { role: "user", content: wrapUntrustedEvidence(input) },
    ];
  },
};
