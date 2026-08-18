import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { isValidObjectId, Model, Types } from "mongoose";

import { type AIProviderError, type AIUsage } from "./ai.types";
import { AIRun, type AIRunDocument } from "./schemas/ai-run.schema";

export interface AIRunStartInput {
  caseId: string | null;
  evidenceId: string | null;
  operation: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  inputRefs: string[];
  inputHashes: string[];
  reasoningEffort: string | null;
}

@Injectable()
export class AIRunService {
  constructor(@InjectModel(AIRun.name) private readonly model: Model<AIRun>) {}

  async start(input: AIRunStartInput): Promise<AIRunDocument> {
    const [run] = await this.model.create([
      {
        caseId: toObjectIdOrNull(input.caseId),
        evidenceId: toObjectIdOrNull(input.evidenceId),
        errorCode: null,
        errorMessage: null,
        inputHashes: input.inputHashes,
        inputRefs: input.inputRefs,
        latencyMs: null,
        model: input.model,
        operation: input.operation,
        output: null,
        promptVersion: input.promptVersion,
        provider: "groq",
        providerRequestId: null,
        reasoningEffort: input.reasoningEffort,
        schemaVersion: input.schemaVersion,
        status: "RUNNING",
        usage: null,
      },
    ]);

    if (!run) {
      throw new Error("AIRun creation returned no document.");
    }
    return run;
  }

  async succeed(
    run: AIRunDocument,
    input: {
      output: Record<string, unknown>;
      latencyMs: number;
      usage: AIUsage;
      providerRequestId: string | null;
    },
  ): Promise<void> {
    await this.model.updateOne(
      { _id: run._id, status: "RUNNING" },
      {
        $set: {
          errorCode: null,
          errorMessage: null,
          latencyMs: input.latencyMs,
          output: input.output,
          providerRequestId: input.providerRequestId,
          status: "SUCCEEDED",
          usage: input.usage,
        },
      },
    );
  }

  async fail(run: AIRunDocument, error: unknown): Promise<void> {
    const providerError = error as Partial<AIProviderError>;
    const code =
      typeof providerError.code === "string"
        ? providerError.code
        : "AI_OPERATION_FAILED";
    const message =
      error instanceof Error ? error.message : "AI operation failed.";
    await this.model.updateOne(
      { _id: run._id, status: "RUNNING" },
      {
        $set: {
          errorCode: code.slice(0, 100),
          errorMessage: message.replace(/\s+/gu, " ").slice(0, 500),
          status: "FAILED",
        },
      },
    );
  }
}

function toObjectIdOrNull(value: string | null): Types.ObjectId | null {
  return value && isValidObjectId(value) ? new Types.ObjectId(value) : null;
}
