import type { CaseEvent } from "./types";

export function caseEventTitle(type: string): string {
  const titles: Record<string, string> = {
    CASE_ANALYSIS_COMPLETED: "Case analysis completed",
    CASE_CREATED: "Case created",
    CASE_GAP_DISCOVERED: "Evidence gap discovered",
    CASE_NEEDS_HUMAN: "Human attention needed",
    CASE_STATUS_CHANGED: "Case stage changed",
    CLAIMS_UPDATED: "Evidence claims updated",
    CLASSIFICATION_COMPLETE: "Decision classified",
    CONTRADICTION_DISCOVERED: "Potential contradiction found",
    EVIDENCE_PROCESSED: "Evidence processing completed",
    EVIDENCE_PROCESSING_STARTED: "Evidence processing started",
    EVIDENCE_UPLOADED: "Evidence uploaded",
    GRAPH_REBUILT: "Case graph updated",
    READINESS_UPDATED: "Readiness updated",
    PROCEDURE_RESOLVED: "Procedure resolved",
    TIMELINE_UPDATED: "Timeline updated",
  };
  return titles[type] ?? humanizeEventType(type);
}

export function caseEventDescription(
  event: Pick<CaseEvent, "type" | "payload">,
): string {
  const payload = event.payload;
  switch (event.type) {
    case "CASE_ANALYSIS_COMPLETED":
      return "The case intelligence pass completed and saved its findings.";
    case "CASE_CREATED":
      return "The case was saved and queued for classification.";
    case "CASE_GAP_DISCOVERED":
      return "A missing or uncertain requirement was added to the case review.";
    case "CASE_NEEDS_HUMAN":
      return payload.reason === "CASE_ANALYSIS_FAILED"
        ? `Analysis stopped and needs attention${stringValue(payload.failureCode) ? ` (${stringValue(payload.failureCode)})` : ""}.`
        : "The workflow needs a human decision before it can continue.";
    case "CASE_STATUS_CHANGED":
      if (payload.reason === "NEW_EVIDENCE_REQUIRES_REVIEW") {
        return "New evidence was processed, so the case is being reviewed again.";
      }
      return `${humanizeEventValue(stringValue(payload.from) ?? "previous stage")} → ${humanizeEventValue(stringValue(payload.to) ?? "next stage")}.`;
    case "CLASSIFICATION_COMPLETE":
      return "The decision details were extracted and classified.";
    case "CONTRADICTION_DISCOVERED":
      return "The system found facts that may conflict and recorded them for review.";
    case "EVIDENCE_PROCESSED":
      return `${numberValue(payload.blockCount) ?? 0} evidence block${numberValue(payload.blockCount) === 1 ? "" : "s"} are now available for analysis.`;
    case "EVIDENCE_PROCESSING_STARTED":
      return "Security and document processing are running in the background.";
    case "EVIDENCE_UPLOADED":
      return "The file was uploaded and queued for security and document processing.";
    case "GRAPH_REBUILT":
      return "Relationships between the decision, evidence, requirements, and claims were refreshed.";
    case "PROCEDURE_RESOLVED":
      return "A current procedure was resolved from verified source material.";
    case "READINESS_UPDATED":
      return `Readiness was recalculated${numberValue(payload.score) !== null ? ` to ${numberValue(payload.score)}%` : ""}.`;
    case "TIMELINE_UPDATED":
      return "The case chronology was refreshed from the available evidence.";
    default:
      return "The case record was updated.";
  }
}

function humanizeEventType(value: string): string {
  return humanizeEventValue(value.replaceAll("_", " "));
}

function humanizeEventValue(value: string): string {
  return value.replace(/(^|\s)\S/gu, (letter) => letter.toUpperCase());
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
