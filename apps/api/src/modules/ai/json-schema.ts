import { z } from "zod";

type JsonSchema = Record<string, unknown>;

/**
 * Converts a Zod schema to the deliberately small JSON Schema subset accepted
 * by Groq strict Structured Outputs. Optional values are represented as null
 * unions by operation schemas, so every property can remain required.
 */
export function toGroqStrictJsonSchema(schema: z.ZodType): JsonSchema {
  const generated = z.toJSONSchema(schema, {
    target: "draft-07",
    unrepresentable: "throw",
    reused: "inline",
  }) as JsonSchema;

  delete generated.$schema;
  normalizeSchemaNode(generated);

  if (generated.type !== "object") {
    throw new Error("Groq strict operation schemas must have an object root.");
  }

  return generated;
}

function normalizeSchemaNode(node: JsonSchema): void {
  if (node.type === "object" || node.properties) {
    const properties = node.properties;
    if (isRecord(properties)) {
      node.required = Object.keys(properties);
      node.additionalProperties = false;
      for (const property of Object.values(properties)) {
        if (isRecord(property)) {
          normalizeSchemaNode(property);
        }
      }
    }
  }

  if (isRecord(node.items)) {
    normalizeSchemaNode(node.items);
  }

  if (Array.isArray(node.anyOf)) {
    for (const branch of node.anyOf) {
      if (isRecord(branch)) {
        normalizeSchemaNode(branch);
      }
    }
  }

  if (Array.isArray(node.oneOf)) {
    for (const branch of node.oneOf) {
      if (isRecord(branch)) {
        normalizeSchemaNode(branch);
      }
    }
  }
}

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
