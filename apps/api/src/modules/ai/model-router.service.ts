import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { type EnvironmentConfig } from "@recourse/config";

import { type AIModelPurpose } from "./ai.types";

@Injectable()
export class AIModelRouterService {
  constructor(private readonly config: ConfigService<EnvironmentConfig>) {}

  modelFor(purpose: AIModelPurpose): string {
    switch (purpose) {
      case "FAST":
        return this.config.get("GROQ_MODEL_FAST") ?? "openai/gpt-oss-20b";
      case "REASONING":
        return this.config.get("GROQ_MODEL_REASONING") ?? "openai/gpt-oss-120b";
      case "VISION":
        return this.config.get("GROQ_MODEL_VISION") ?? "qwen/qwen3.6-27b";
    }
  }

  reasoningEffort(): "none" | "low" | "medium" | "high" {
    return this.config.get("GROQ_DEFAULT_REASONING_EFFORT") ?? "medium";
  }
}
