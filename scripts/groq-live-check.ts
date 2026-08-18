import { ConfigService } from "@nestjs/config";
import { z } from "zod";

import { parseEnvironment } from "@recourse/config";

import { GroqProvider } from "../apps/api/src/modules/ai/groq.provider";

const responseSchema = z.object({
  ok: z.boolean(),
  value: z.string(),
});

async function main(): Promise<void> {
  const environment = parseEnvironment();
  const provider = new GroqProvider(new ConfigService(environment));
  const health = await provider.healthCheck();
  if (!health.configured) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const result = await provider.completeStructured({
    maxCompletionTokens: 100,
    messages: [
      {
        role: "system",
        content:
          "Return the requested JSON object exactly. Do not include reasoning.",
      },
      { role: "user", content: "Set ok to true and value to live-check." },
    ],
    model: environment.GROQ_MODEL_FAST,
    reasoningEffort: "none",
    schema: responseSchema,
    schemaName: "recourse_groq_live_check",
  });

  if (!result.output.ok || result.output.value !== "live-check") {
    throw new Error(
      "Groq strict structured-output check returned an unexpected value.",
    );
  }
  process.stdout.write(
    JSON.stringify({
      configured: health.configured,
      model: result.model,
      providerRequestId: result.providerRequestId,
      structuredMode: result.structuredMode,
      usage: result.usage,
    }) + "\n",
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
