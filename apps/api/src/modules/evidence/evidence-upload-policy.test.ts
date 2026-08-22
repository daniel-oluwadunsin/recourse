import { describe, expect, it } from "vitest";

import {
  assertEvidenceUploadAllowed,
  evidenceUploadPolicy,
} from "./evidence-upload-policy";

describe("evidence upload policy", () => {
  it("blocks uploads while analysis is running", () => {
    expect(evidenceUploadPolicy("CASE_ANALYSIS", "SCREENSHOT").mode).toBe(
      "BLOCKED",
    );
    expect(() =>
      assertEvidenceUploadAllowed("CASE_ANALYSIS", "SCREENSHOT"),
    ).toThrow("Case analysis is currently running");
  });

  it("locks submitted and approved cases", () => {
    expect(
      evidenceUploadPolicy("AWAITING_USER_APPROVAL", "SUPPORTING_DOCUMENT").mode,
    ).toBe("BLOCKED");
    expect(evidenceUploadPolicy("SUBMITTED", "SUPPORTING_DOCUMENT").mode).toBe(
      "BLOCKED",
    );
  });

  it("allows new evidence before approval and explains that review will reopen", () => {
    const policy = evidenceUploadPolicy("READY_TO_APPEAL", "SUPPORTING_DOCUMENT");
    expect(policy.mode).toBe("ALL");
    expect(policy.message).toContain("reopen case review");
  });

  it("allows only institution responses while waiting for one", () => {
    expect(
      evidenceUploadPolicy("AWAITING_RESPONSE", "INSTITUTION_RESPONSE").mode,
    ).toBe("INSTITUTION_RESPONSE_ONLY");
    expect(() =>
      assertEvidenceUploadAllowed("AWAITING_RESPONSE", "SCREENSHOT"),
    ).toThrow("Upload the institution's response");
  });
});
