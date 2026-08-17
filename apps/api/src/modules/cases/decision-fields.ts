import {
  decisionCorrectionSchema,
  decisionFieldSnapshotSchema,
  type DecisionCorrection,
  type DecisionFieldSnapshot,
} from "@recourse/contracts";

export function toDecisionSnapshot(value: unknown): DecisionFieldSnapshot {
  return decisionFieldSnapshotSchema.parse(value);
}

export function toDecisionCorrection(value: unknown): DecisionCorrection {
  return decisionCorrectionSchema.parse(value);
}

export function applyDecisionCorrection(
  raw: DecisionFieldSnapshot,
  existing: DecisionCorrection,
  correction: DecisionCorrection,
): DecisionFieldSnapshot {
  return decisionFieldSnapshotSchema.parse({
    ...raw,
    ...existing,
    ...correction,
  });
}
