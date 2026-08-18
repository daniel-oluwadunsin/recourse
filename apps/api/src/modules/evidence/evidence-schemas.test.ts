import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { Evidence, EvidenceSchema } from "./schemas/evidence.schema";
import {
  EvidenceBlock,
  EvidenceBlockSchema,
} from "./schemas/evidence-block.schema";

describe("evidence persistence schemas", () => {
  it("has controlled status validation and query-justified indexes", () => {
    const statusPath = EvidenceSchema.path("processingStatus") as unknown as {
      enumValues?: string[];
    };
    expect(statusPath.enumValues).toEqual(
      expect.arrayContaining(["UPLOADING", "READY", "DELETING", "DELETED"]),
    );
    const names = EvidenceSchema.indexes().map(([, options]) => options.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "evidence_case_created",
        "evidence_case_sha256_unique",
        "evidence_case_deleted_created",
        "evidence_storage_key_unique",
      ]),
    );
    expect(
      EvidenceSchema.indexes().find(
        ([, options]) => options.name === "evidence_case_sha256_unique",
      )?.[1].unique,
    ).toBe(true);
  });

  it("requires core evidence fields and uniquely orders blocks", async () => {
    const model = mongoose.model(
      "EvidenceSchemaValidation",
      EvidenceSchema,
      "evidence_schema_validation",
    );
    await expect(new model({}).validate()).rejects.toBeDefined();
    const blockIndex = EvidenceBlockSchema.indexes().find(
      ([, options]) => options.name === "evidence_blocks_evidence_index_unique",
    );
    expect(blockIndex?.[1].unique).toBe(true);
    expect(Evidence).toBeDefined();
    expect(EvidenceBlock).toBeDefined();
  });
});
