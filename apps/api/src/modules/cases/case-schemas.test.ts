import mongoose, { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import { CaseEventSchema } from "./schemas/case-event.schema";
import { CaseSchema } from "./schemas/case.schema";
import { DeadlineSchema } from "./schemas/deadline.schema";
import { DecisionSchema } from "./schemas/decision.schema";
import { InstitutionSchema } from "./schemas/institution.schema";

describe("case persistence schemas", () => {
  it("declares the named query and integrity indexes", () => {
    expect(indexNames(CaseSchema)).toEqual(
      expect.arrayContaining([
        "cases_owner_updated",
        "cases_owner_status_updated",
        "cases_case_key_unique",
        "cases_active_procedure_status",
        "cases_owner_deleted_updated",
      ]),
    );
    expect(indexNames(DecisionSchema)).toContain("decisions_case_unique");
    expect(indexNames(CaseEventSchema)).toEqual(
      expect.arrayContaining([
        "case_events_case_sequence_unique",
        "case_events_case_created",
        "case_events_case_idempotency_unique",
      ]),
    );
    expect(indexNames(InstitutionSchema)).toEqual(
      expect.arrayContaining([
        "institutions_normalized_name_unique",
        "institutions_normalized_aliases",
        "institutions_verified_domains",
      ]),
    );
    expect(indexNames(DeadlineSchema)).toEqual(
      expect.arrayContaining([
        "deadlines_case_due",
        "deadlines_case_status_due",
      ]),
    );

    const idempotencyIndex = CaseEventSchema.indexes().find(
      ([, options]) => options.name === "case_events_case_idempotency_unique",
    );
    expect(idempotencyIndex?.[1]).toMatchObject({
      partialFilterExpression: { idempotencyKey: { $type: "string" } },
      unique: true,
    });
  });

  it("validates controlled case status and protects raw decision fields", async () => {
    const modelName = "Phase3CaseSchemaValidation";
    const model =
      mongoose.models[modelName] ?? mongoose.model(modelName, CaseSchema);
    const invalid = new model({
      caseKey: "RC-SCHEMA-TEST",
      currentStage: "INTAKE",
      ownerId: new Types.ObjectId(),
      status: "NOT_A_CASE_STATUS",
      title: "Schema test",
    });

    await expect(invalid.validate()).rejects.toMatchObject({
      errors: { status: expect.anything() },
    });
    expect(DecisionSchema.path("rawExtractedFields").options.immutable).toBe(
      true,
    );
  });
});

function indexNames(schema: mongoose.Schema): string[] {
  return schema
    .indexes()
    .map(([, options]) => options.name)
    .filter((name): name is string => Boolean(name));
}
