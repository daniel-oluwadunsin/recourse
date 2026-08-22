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

  it("reopens review when new evidence finishes processing before approval", async () => {
    const caseId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    const evidenceId = new Types.ObjectId();
    const readyCase = {
      _id: caseId,
      revision: 4,
      status: "READY_TO_APPEAL" as const,
    };
    const analysisCase = {
      ...readyCase,
      revision: 5,
      status: "CASE_ANALYSIS" as const,
    };
    const event = {
      _id: eventId,
      caseId,
      correlationId: "correlation-2",
      payload: { evidenceId: evidenceId.toString() },
      sequence: 9,
      type: "EVIDENCE_PROCESSED" as const,
    };
    const caseModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(readyCase) })),
    };
    const eventModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(event) })),
    };
    const evidenceModel = {
      exists: vi.fn().mockResolvedValue(true),
    };
    const stateMachine = {
      transition: vi.fn().mockResolvedValue({ case: analysisCase }),
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
      { findOne: vi.fn() } as never,
      stateMachine as never,
      activityPubSub as never,
      queueProducer as never,
      workflowDispatch as never,
    );

    await service.handleCaseEvent({
      caseId: caseId.toString(),
      correlationId: "correlation-2",
      dispatchId: "dispatch-2",
      eventId: eventId.toString(),
      eventSequence: 9,
      idempotencyKey: "case-event-2",
      workflowVersion: "phase-10-v1",
    });

    expect(stateMachine.transition).toHaveBeenCalledWith(
      caseId.toString(),
      "CASE_ANALYSIS",
      expect.objectContaining({ actorType: "SYSTEM" }),
      expect.objectContaining({
        expectedCurrent: ["EVIDENCE_COLLECTION", "NEEDS_HUMAN", "READY_TO_APPEAL"],
        payload: expect.objectContaining({
          reason: "NEW_EVIDENCE_REQUIRES_REVIEW",
          triggerEventId: eventId.toString(),
        }),
      }),
    );
    expect(queueProducer.enqueueAIOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: caseId.toString(),
        expectedRevision: analysisCase.revision,
        operation: "analyze-case",
      }),
    );
  });

  it("analyzes ready evidence after procedure resolution ends in human review", async () => {
    const caseId = new Types.ObjectId();
    const eventId = new Types.ObjectId();
    const needsHumanCase = {
      _id: caseId,
      revision: 3,
      status: "NEEDS_HUMAN" as const,
    };
    const analysisCase = {
      ...needsHumanCase,
      revision: 4,
      status: "CASE_ANALYSIS" as const,
    };
    const event = {
      _id: eventId,
      caseId,
      correlationId: "correlation-procedure-review",
      payload: {
        procedureId: new Types.ObjectId().toString(),
        reason: "PROCEDURE_CONFIDENCE_INSUFFICIENT",
      },
      sequence: 5,
      type: "CASE_NEEDS_HUMAN" as const,
    };
    const caseModel = {
      findOne: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue(needsHumanCase),
      })),
    };
    const eventModel = {
      findOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue(event) })),
    };
    const evidenceModel = { exists: vi.fn().mockResolvedValue(true) };
    const stateMachine = {
      transition: vi.fn().mockResolvedValue({ case: analysisCase }),
    };
    const queueProducer = { enqueueAIOperation: vi.fn() };
    const service = new CaseOrchestratorService(
      caseModel as never,
      eventModel as never,
      evidenceModel as never,
      { findOne: vi.fn() } as never,
      stateMachine as never,
      { publish: vi.fn().mockResolvedValue(undefined) } as never,
      queueProducer as never,
      { markCompleted: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await service.handleCaseEvent({
      caseId: caseId.toString(),
      correlationId: event.correlationId,
      dispatchId: "dispatch-procedure-review",
      eventId: eventId.toString(),
      eventSequence: event.sequence,
      idempotencyKey: "case-event-procedure-review",
      workflowVersion: "phase-10-v1",
    });

    expect(stateMachine.transition).toHaveBeenCalledWith(
      caseId.toString(),
      "CASE_ANALYSIS",
      expect.objectContaining({ actorType: "SYSTEM" }),
      expect.objectContaining({
        expectedCurrent: [
          "EVIDENCE_COLLECTION",
          "NEEDS_HUMAN",
          "READY_TO_APPEAL",
        ],
        payload: expect.objectContaining({
          reason: "NEW_EVIDENCE_REQUIRES_REVIEW",
          triggerEventId: eventId.toString(),
        }),
      }),
    );
    expect(queueProducer.enqueueAIOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: caseId.toString(),
        expectedRevision: analysisCase.revision,
        operation: "analyze-case",
      }),
    );
  });
});
