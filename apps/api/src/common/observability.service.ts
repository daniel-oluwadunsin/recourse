import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  MetricsRegistry,
  NoopObservability,
  OtlpHttpObservability,
  type RecourseObservability,
} from "@recourse/observability";

import { type EnvironmentConfig } from "@recourse/config";

@Injectable()
export class ApplicationObservabilityService {
  readonly metrics = new MetricsRegistry();
  readonly tracing: RecourseObservability;

  constructor(config: ConfigService<EnvironmentConfig>) {
    const endpoint = config.get("OTEL_EXPORTER_OTLP_ENDPOINT");
    this.tracing = endpoint
      ? new OtlpHttpObservability(
          endpoint,
          parseHeaders(config.get("OTEL_EXPORTER_OTLP_HEADERS")),
          config.get("OTEL_SERVICE_NAME") ?? "recourse-api",
        )
      : new NoopObservability();
  }
}

function parseHeaders(value: string | undefined): Record<string, string> {
  if (!value) return {};
  return Object.fromEntries(
    value.split(",").flatMap((entry) => {
      const separator = entry.indexOf("=");
      if (separator < 1) return [];
      return [
        [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()],
      ];
    }),
  );
}
