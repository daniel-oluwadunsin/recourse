import { describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

import { WorkflowDispatchService } from "./workflow-dispatch.service";
import { WorkflowDispatchStatus } from "./schemas/workflow-dispatch.schema";

describe("WorkflowDispatchService", () => {
  it("leaves a dispatch pending after Redis failure so reconciliation can retry it", async () => {
    const dispatch = {
      _id: new Types.ObjectId(),
      caseId: new Types.ObjectId(),
      eventId: new Types.ObjectId(),
      eventSequence: 4,
      eventType: "CASE_UPDATED",
      idempotencyKey: "case-event-test",
    };
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const find = vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([dispatch]),
    });
    const dispatchModel = {
      find,
      updateMany: vi.fn().mockResolvedValue({ acknowledged: true }),
      updateOne,
    };
    const enqueueCaseEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error("Redis unavailable"))
      .mockResolvedValueOnce({ duplicateSafe: true, jobId: "case-event-id" });
    const service = new WorkflowDispatchService(
      dispatchModel as never,
      { enqueueCaseEvent } as never,
    );

    expect(await service.publishPending()).toBe(0);
    expect(updateOne).toHaveBeenLastCalledWith(
      { _id: dispatch._id, status: WorkflowDispatchStatus.PENDING },
      { $set: { lastError: "Redis unavailable" } },
    );

    expect(await service.publishPending()).toBe(1);
    expect(updateOne).toHaveBeenLastCalledWith(
      { _id: dispatch._id, status: WorkflowDispatchStatus.PENDING },
      {
        $inc: { attempts: 1 },
        $set: expect.objectContaining({
          status: WorkflowDispatchStatus.ENQUEUED,
        }),
      },
    );
    expect(enqueueCaseEvent).toHaveBeenCalledTimes(2);
  });
});
