import type { CaseStatus, EvidenceKind } from "./types";

export type EvidenceUploadMode =
  | "ALL"
  | "INSTITUTION_RESPONSE_ONLY"
  | "BLOCKED";

export interface EvidenceUploadPolicy {
  mode: EvidenceUploadMode;
  message: string;
}

export function evidenceUploadPolicy(
  status: CaseStatus,
  kind: EvidenceKind = "SUPPORTING_DOCUMENT",
): EvidenceUploadPolicy {
  if (["RESOLVED", "EXHAUSTED"].includes(status)) {
    return {
      mode: "BLOCKED",
      message:
        "This case is closed. Create a follow-up case if you need to provide new evidence.",
    };
  }
  if (status === "SUBMITTED") {
    return {
      mode: "BLOCKED",
      message:
        "This case has been submitted and its evidence packet is locked. New documents belong in a follow-up or response record.",
    };
  }
  if (status === "AWAITING_USER_APPROVAL") {
    return {
      mode: "BLOCKED",
      message:
        "This case is waiting for your approval. Adding evidence requires reopening the case review before approval.",
    };
  }
  if (status === "CASE_ANALYSIS") {
    return {
      mode: "BLOCKED",
      message:
        "Case analysis is currently running. Wait for it to finish before adding more evidence.",
    };
  }
  if (status === "REPLANNING") {
    return {
      mode: "BLOCKED",
      message:
        "Recourse is reviewing the latest response. Wait for that review to finish before adding more evidence.",
    };
  }
  if (["AWAITING_RESPONSE", "RESPONSE_RECEIVED"].includes(status)) {
    return {
      mode: "INSTITUTION_RESPONSE_ONLY",
      message:
        kind === "INSTITUTION_RESPONSE"
          ? "Only an institution response can be added while this case is waiting for a response."
          : "This case is waiting for a response. Upload the institution's response as an institution response.",
    };
  }
  return {
    mode: "ALL",
    message:
      status === "READY_TO_APPEAL" || status === "NEEDS_HUMAN"
        ? "New evidence will reopen case review and update the readiness result before an appeal can continue."
        : "Evidence will be securely processed and added to the case review.",
  };
}
