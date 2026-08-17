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
