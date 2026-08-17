import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../packages/config/src/index";
import {
  createRequestId,
  getRequestContext,
  withRequestContext,
} from "../packages/logger/src/index";

describe("Phase 1 foundation", () => {
  it("applies only safe local configuration defaults", () => {
    const environment = parseEnvironment({});

    expect(environment.APP_ENV).toBe("local");
    expect(environment.API_PORT).toBe(4000);
    expect(environment.REDIS_URL).toBe("redis://localhost:6379");
    expect(environment.GROQ_API_KEY).toBeUndefined();
    expect(environment.TAVILY_API_KEY).toBeUndefined();
  });

  it("rejects malformed required configuration", () => {
    expect(() => parseEnvironment({ API_PORT: "not-a-port" })).toThrow();
  });

  it("keeps request and correlation IDs available through async work", async () => {
    const requestId = createRequestId();
    const correlationId = createRequestId();

    await withRequestContext({ requestId, correlationId }, async () => {
      expect(getRequestContext()).toEqual({ requestId, correlationId });
    });
  });
});
