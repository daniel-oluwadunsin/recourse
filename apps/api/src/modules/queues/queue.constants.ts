import { type QueueName } from "@recourse/contracts";

export const QUEUE_NAMES = {
  AI_OPERATIONS: "ai-operations",
  CASE_ORCHESTRATION: "case-orchestration",
  EVIDENCE_PROCESSING: "evidence-processing",
  EXTERNAL_ACTIONS: "external-actions",
  MAINTENANCE: "maintenance",
  NOTIFICATIONS: "notifications",
  PROCEDURE_RETRIEVAL: "procedure-retrieval",
} as const satisfies Record<string, QueueName>;

export const queueNames = Object.values(QUEUE_NAMES) as QueueName[];

export const JOB_NAMES = {
  CASE_EVENT: "case-event",
  EVIDENCE_PROCESS: "evidence-process",
  MAINTENANCE_RECONCILE_DISPATCHES: "maintenance-reconcile-dispatches",
} as const;

export const WORKFLOW_VERSION = "phase-5-v1";

export function stableJobId(namespace: string, ...parts: string[]): string {
  const normalized = [namespace, ...parts]
    .map((part) => part.trim().replace(/[^a-zA-Z0-9._-]/g, "-"))
    .join("-");

  if (normalized.includes(":")) {
    throw new Error("BullMQ job IDs must not contain ':' separators.");
  }

  return normalized.slice(0, 200);
}

export { JOB_NAMES as QueueJobNames, QUEUE_NAMES as QueueNames };
