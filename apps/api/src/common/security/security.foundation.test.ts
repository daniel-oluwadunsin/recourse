import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { type EnvironmentConfig } from "@recourse/config";

import { MalwareScanError, MalwareScanService } from "./malware-scan.service";
import {
  UsageBudgetExceededError,
  UsageBudgetService,
} from "./usage-budget.service";

function config(
  values: Partial<EnvironmentConfig>,
): ConfigService<EnvironmentConfig> {
  return new ConfigService({
    RATE_LIMIT_STORAGE: "memory",
    REDIS_PREFIX: "test:",
    AI_MAX_OPERATIONS_PER_CASE_DAY: 2,
    TAVILY_MAX_PROCEDURE_RESOLUTIONS_PER_CASE_DAY: 1,
    EMAIL_MAX_OUTBOUND_PER_USER_DAY: 1,
    ...values,
  } as EnvironmentConfig);
}

describe("Phase 12 security foundations", () => {
  it("enforces bounded daily usage in the test-only memory mode", async () => {
    const budget = new UsageBudgetService(config({}));

    await budget.consumeAiCase("case-1");
    await budget.consumeAiCase("case-1");
    await expect(budget.consumeAiCase("case-1")).rejects.toBeInstanceOf(
      UsageBudgetExceededError,
    );
    await expect(budget.consumeAiCase("case-2")).resolves.toBeUndefined();
  });

  it("does not silently claim malware scanning when no scanner is configured", async () => {
    const optional = new MalwareScanService(
      config({ MALWARE_SCAN_REQUIRED: false }),
    );
    await expect(
      optional.scan({
        bytes: Buffer.from("safe"),
        filename: "a.txt",
        mimeType: "text/plain",
      }),
    ).resolves.toBe("SKIPPED");

    const required = new MalwareScanService(
      config({ MALWARE_SCAN_REQUIRED: true }),
    );
    await expect(
      required.scan({
        bytes: Buffer.from("safe"),
        filename: "a.txt",
        mimeType: "text/plain",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("accepts only an explicit clean scanner result and rejects infected files", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ clean: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ infected: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const scanner = new MalwareScanService(
      config({ MALWARE_SCANNER_URL: "https://scanner.example/scan" }),
    );

    await expect(
      scanner.scan({
        bytes: Buffer.from("safe"),
        filename: "a.txt",
        mimeType: "text/plain",
      }),
    ).resolves.toBe("CLEAN");
    await expect(
      scanner.scan({
        bytes: Buffer.from("bad"),
        filename: "b.txt",
        mimeType: "text/plain",
      }),
    ).rejects.toMatchObject({
      code: "MALWARE_DETECTED",
    } satisfies Partial<MalwareScanError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
