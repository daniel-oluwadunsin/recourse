import { describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

import { RequirementService } from "./requirement.service";

describe("RequirementService procedure grounding", () => {
  it("does not turn an unresolved procedure into evidence requirements", async () => {
    const caseId = new Types.ObjectId();
    const procedureId = new Types.ObjectId();
    const versionId = new Types.ObjectId();
    const caseModel = {
      findOne: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue({
          _id: caseId,
          activeProcedureId: procedureId,
          activeProcedureVersionId: versionId,
        }),
      })),
      updateOne: vi.fn(() => ({ exec: vi.fn().mockResolvedValue({}) })),
    };
    const procedureVersionModel = {
      findById: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue({
          _id: versionId,
          procedureId,
          evidenceRequirements: [
            { critical: true, text: "Irrelevant unverified requirement" },
          ],
        }),
      })),
    };
    const procedureModel = {
      findById: vi.fn(() => ({
        exec: vi.fn().mockResolvedValue({
          _id: procedureId,
          status: "UNRESOLVED",
        }),
      })),
    };
    const matchModel = {
      deleteMany: vi.fn(() => ({ exec: vi.fn().mockResolvedValue({}) })),
      findOneAndUpdate: vi.fn(),
    };
    const service = new RequirementService(
      caseModel as never,
      procedureVersionModel as never,
      procedureModel as never,
      { find: vi.fn() } as never,
      matchModel as never,
      {} as never,
    );

    await expect(service.matchCase(caseId.toString())).resolves.toEqual([]);
    expect(matchModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(matchModel.deleteMany).toHaveBeenCalledWith({ caseId });
    expect(caseModel.updateOne).toHaveBeenCalledWith(
      { _id: caseId, deletedAt: null },
      { $set: { openCriticalGapCount: 0 } },
    );
  });
});
