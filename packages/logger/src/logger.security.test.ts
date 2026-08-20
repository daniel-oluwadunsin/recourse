import { describe, expect, it } from "vitest";

import { sanitizeLogText, sanitizeLogValue } from "./index";

describe("structured logger privacy boundary", () => {
  it("redacts credentials and private content recursively", () => {
    expect(
      sanitizeLogValue({
        password: "correct horse battery staple",
        token: "eyJheader.payload.signature",
        nested: { email: "person@example.com", body: "private evidence" },
        requestId: "req-123",
      }),
    ).toEqual({
      password: "[REDACTED]",
      token: "[REDACTED]",
      nested: { email: "[REDACTED]", body: "[REDACTED]" },
      requestId: "req-123",
    });
  });

  it("removes bearer tokens and email addresses from free-form messages", () => {
    const sanitized = sanitizeLogText(
      "Authorization Bearer abc.def and contact person@example.com",
    );
    expect(sanitized).not.toContain("abc.def");
    expect(sanitized).not.toContain("person@example.com");
    expect(sanitized).toContain("[REDACTED]");
    expect(sanitized).toContain("[REDACTED_EMAIL]");
  });
});
