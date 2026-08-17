import { describe, expect, it } from "vitest";

import {
  allowedCaseTransitions,
  CaseStateMachineService,
} from "./case-state-machine.service";

describe("CaseStateMachineService", () => {
  it("accepts every transition in the explicit map", () => {
    const service = new CaseStateMachineService(
      undefined as never,
      undefined as never,
      undefined as never,
    );

    for (const [from, targets] of Object.entries(allowedCaseTransitions)) {
      for (const target of targets) {
        expect(
          service.canTransition(
            from as keyof typeof allowedCaseTransitions,
            target,
          ),
        ).toBe(true);
      }
    }
  });

  it("rejects terminal and representative out-of-order transitions", () => {
    const service = new CaseStateMachineService(
      undefined as never,
      undefined as never,
      undefined as never,
    );

    expect(service.canTransition("INTAKE", "RESOLVED")).toBe(false);
    expect(service.canTransition("CLASSIFYING", "READY_TO_APPEAL")).toBe(false);
    expect(service.canTransition("SUBMITTED", "RESOLVED")).toBe(false);
    expect(service.canTransition("RESOLVED", "INTAKE")).toBe(false);
    expect(service.canTransition("EXHAUSTED", "REPLANNING")).toBe(false);
    expect(service.canTransition("NEEDS_HUMAN", "READY_TO_APPEAL")).toBe(false);
  });
});
