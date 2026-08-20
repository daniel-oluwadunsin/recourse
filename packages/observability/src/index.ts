export type SpanAttribute = string | number | boolean | null;
export type SpanAttributes = Record<string, SpanAttribute>;

export interface RecourseSpan {
  setAttribute(key: string, value: SpanAttribute): void;
  recordException(error: unknown): void;
  end(): void;
}

export interface RecourseObservability {
  startSpan(name: string, attributes?: SpanAttributes): RecourseSpan;
}

export interface MetricsSnapshot {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const metricNamePattern = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/u;

/** Small dependency-free metrics registry for API/worker operational counters. */
export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly snapshots = new Map<string, MetricsSnapshot>();

  increment(
    name: string,
    labels: Record<string, string> = {},
    value = 1,
  ): void {
    if (!metricNamePattern.test(name) || !Number.isFinite(value)) return;
    const key = metricKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
    this.snapshots.set(key, {
      name,
      labels: safeLabels(labels),
      value: this.counters.get(key) ?? value,
    });
  }

  observe(
    name: string,
    value: number,
    labels: Record<string, string> = {},
  ): void {
    if (!metricNamePattern.test(name) || !Number.isFinite(value)) return;
    const key = metricKey(`${name}_last`, labels);
    this.snapshots.set(key, {
      labels: safeLabels(labels),
      name: `${name}_last`,
      value,
    });
  }

  snapshot(): MetricsSnapshot[] {
    return [...this.snapshots.values()].map((item) => ({
      ...item,
      labels: { ...item.labels },
    }));
  }

  toPrometheus(): string {
    const lines: string[] = [];
    for (const item of this.snapshot()) {
      const labels = Object.entries(item.labels)
        .map(([key, value]) => `${key}="${escapePrometheus(value)}"`)
        .join(",");
      lines.push(`${item.name}${labels ? `{${labels}}` : ""} ${item.value}`);
    }
    return `${lines.join("\n")}\n`;
  }
}

interface ExportedSpan {
  traceId: string;
  spanId: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<{
    key: string;
    value: { stringValue?: string; intValue?: string; boolValue?: boolean };
  }>;
  status: { code: number; message?: string };
}

/**
 * Minimal OTLP/HTTP JSON exporter. It keeps the package optional for local
 * development while producing a standard-compatible payload when configured.
 */
export class OtlpHttpObservability implements RecourseObservability {
  constructor(
    private readonly endpoint: string | undefined,
    private readonly headers: Record<string, string> = {},
    private readonly serviceName = "recourse",
  ) {}

  startSpan(name: string, attributes: SpanAttributes = {}): RecourseSpan {
    return new OtlpSpan(
      this.endpoint,
      this.headers,
      this.serviceName,
      name,
      attributes,
    );
  }
}

class OtlpSpan implements RecourseSpan {
  private readonly traceId = randomHex(16);
  private readonly spanId = randomHex(8);
  private readonly started = Date.now();
  private readonly values: SpanAttributes;
  private exception: string | undefined;
  private ended = false;

  constructor(
    private readonly endpoint: string | undefined,
    private readonly headers: Record<string, string>,
    private readonly serviceName: string,
    private readonly name: string,
    attributes: SpanAttributes,
  ) {
    this.values = { ...attributes };
  }

  setAttribute(key: string, value: SpanAttribute): void {
    if (!this.ended && key.length <= 100) this.values[key] = value;
  }

  recordException(error: unknown): void {
    this.exception =
      error instanceof Error
        ? sanitizeDiagnostic(error.message)
        : "operation failed";
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    if (!this.endpoint) return;
    const span: ExportedSpan = {
      attributes: Object.entries(this.values).flatMap(([key, value]) => {
        const safe = attributeValue(value);
        return safe ? [{ key, value: safe }] : [];
      }),
      endTimeUnixNano: String(
        (this.started + Math.max(0, Date.now() - this.started)) * 1_000_000,
      ),
      name: this.name.slice(0, 120),
      spanId: this.spanId,
      startTimeUnixNano: String(this.started * 1_000_000),
      status: this.exception
        ? { code: 2, message: this.exception }
        : { code: 1 },
      traceId: this.traceId,
    };
    const url = this.endpoint.endsWith("/v1/traces")
      ? this.endpoint
      : `${this.endpoint.replace(/\/$/u, "")}/v1/traces`;
    void fetch(url, {
      body: JSON.stringify({
        resourceSpans: [
          {
            resource: {
              attributes: [
                {
                  key: "service.name",
                  value: { stringValue: this.serviceName },
                },
              ],
            },
            scopeSpans: [{ spans: [span] }],
          },
        ],
      }),
      headers: { "content-type": "application/json", ...this.headers },
      method: "POST",
      signal: AbortSignal.timeout(2000),
    }).catch(() => undefined);
  }
}

class NoopSpan implements RecourseSpan {
  setAttribute(_key: string, _value: SpanAttribute): void {
    void _key;
    void _value;
  }

  recordException(_error: unknown): void {
    void _error;
  }

  end(): void {
    return;
  }
}

export class NoopObservability implements RecourseObservability {
  startSpan(_name: string, _attributes?: SpanAttributes): RecourseSpan {
    void _name;
    void _attributes;
    return new NoopSpan();
  }
}

function metricKey(name: string, labels: Record<string, string>): string {
  return `${name}|${Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(",")}`;
}

function safeLabels(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(labels)
      .filter(([key]) => /^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(key))
      .map(([key, value]) => [key, String(value).slice(0, 80)]),
  );
}

function escapePrometheus(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n");
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(values);
  return [...values]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function attributeValue(
  value: SpanAttribute,
): ExportedSpan["attributes"][number]["value"] | null {
  if (typeof value === "string") return { stringValue: value.slice(0, 500) };
  if (typeof value === "number") return { intValue: String(value) };
  if (typeof value === "boolean") return { boolValue: value };
  return null;
}

function sanitizeDiagnostic(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [REDACTED]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu,
      "[REDACTED_TOKEN]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, "[REDACTED_EMAIL]")
    .replace(/[\r\n\t]+/gu, " ")
    .slice(0, 500);
}
