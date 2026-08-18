import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseEnvironment } from "@recourse/config";

import { GroqProvider } from "./groq.provider";

const live = process.env.RUN_LIVE_GROQ_TESTS === "true";

describe.skipIf(!live)("live Groq provider", () => {
  it("returns a validated strict structured response", async () => {
    const environment = parseEnvironment();
    const provider = new GroqProvider(new ConfigService(environment));
    const result = await provider.completeStructured({
      maxCompletionTokens: 100,
      messages: [
        { role: "system", content: "Return only the requested JSON." },
        { role: "user", content: "Set ok to true." },
      ],
      model: environment.GROQ_MODEL_FAST,
      reasoningEffort: "none",
      schema: z.object({ ok: z.boolean() }),
      schemaName: "recourse_live_test",
    });

    expect(result.structuredMode).toBe("strict");
    expect(result.output.ok).toBe(true);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  }, 60_000);
});
