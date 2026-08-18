import { describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

import { CaseOrchestratorService } from "./case-orchestrator.service";
import { hashInput } from "../ai/ai-operation.service";

describe("CaseOrchestrator AI boundary", () => {
  it("moves a newly created intake case to classifying and queues deterministic classification", async () => {
    const caseId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    const decision = {
      caseId,
      decisionDate: null,
      decisionType: "UNKNOWN" as const,
      institutionName: "Example Platform",
      jurisdiction: null,
      notificationDate: null,
      relationship: "UNKNOWN" as const,
      sourceEvidenceId: null,
      statedReason: "Policy decision",
    };
    const intakeCase = {
      _id: caseId,
      revision: 0,
      status: "INTAKE" as const,
    };
    const classifyingCase = {
      ...intakeCase,
      revision: 1,
      status: "CLASSIFYING" as const,
    };
    const event = {
      _id: eventId,
      caseId,
      correlationId: "correlation-1",
      payload: {},
      sequence: 1,
      type: "CASE_CREATED" as const,
    };
    const caseModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(intakeCase) })),
    };
    const eventModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(event) })),
    };
    const decisionModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(decision) })),
    };
    const evidenceModel = { findOne: vi.fn() };
    const stateMachine = {
      transition: vi.fn().mockResolvedValue({ case: classifyingCase }),
    };
    const queueProducer = { enqueueAIOperation: vi.fn() };
    const activityPubSub = { publish: vi.fn().mockResolvedValue(undefined) };
    const workflowDispatch = {
      markCompleted: vi.fn().mockResolvedValue(undefined),
    };
    const service = new CaseOrchestratorService(
      caseModel as never,
      eventModel as never,
      evidenceModel as never,
      decisionModel as never,
      stateMachine as never,
      activityPubSub as never,
      queueProducer as never,
      workflowDispatch as never,
    );

    await service.handleCaseEvent({
      caseId: caseId.toString(),
      correlationId: "correlation-1",
      dispatchId: "dispatch-1",
      eventId: eventId.toString(),
      eventSequence: 1,
      idempotencyKey: "case-event-1",
      workflowVersion: "phase-6-v1",
    });

    const input = {
      caseId: caseId.toString(),
      decisionDate: null,
      evidenceRefs: [],
      institutionName: "Example Platform",
      jurisdiction: null,
      notificationDate: null,
      relationship: "UNKNOWN",
      statedReason: "Policy decision",
      decisionType: "UNKNOWN",
    };
    expect(stateMachine.transition).toHaveBeenCalledWith(
      caseId.toString(),
      "CLASSIFYING",
      expect.objectContaining({ actorType: "SYSTEM" }),
      expect.objectContaining({ expectedCurrent: ["INTAKE"] }),
    );
    expect(queueProducer.enqueueAIOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: caseId.toString(),
        expectedRevision: 1,
        inputHash: hashInput(input),
        operation: "classify-case",
      }),
    );
  });
});
