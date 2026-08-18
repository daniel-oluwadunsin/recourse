import { describe, expect, it } from "vitest";
import { z } from "zod";

import { toGroqStrictJsonSchema } from "./json-schema";

describe("Groq strict JSON Schema conversion", () => {
  it("marks every object property required and closes nested objects", () => {
    const schema = z.object({
      name: z.string(),
      optionalValue: z.string().nullable(),
      nested: z.object({ value: z.number() }),
      items: z.array(z.object({ label: z.string() })),
    });

    const json = toGroqStrictJsonSchema(schema);

    expect(json.required).toEqual(["name", "optionalValue", "nested", "items"]);
    expect(json.additionalProperties).toBe(false);
    expect(json.properties).toMatchObject({
      nested: {
        required: ["value"],
        additionalProperties: false,
      },
      items: {
        items: {
          required: ["label"],
          additionalProperties: false,
        },
      },
    });
  });
});
