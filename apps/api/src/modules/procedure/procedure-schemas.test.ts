import { describe, expect, it } from "vitest";

import { ProcedureSchema } from "./schemas/procedure.schema";
import { ProcedureVersionSchema } from "./schemas/procedure-version.schema";
import { ProceduralClaimSchema } from "./schemas/procedural-claim.schema";
import { RetrievalRunSchema } from "../retrieval/schemas/retrieval-run.schema";
import { SourceSnapshotSchema } from "../retrieval/schemas/source-snapshot.schema";

describe("procedural persistence schemas", () => {
  it("declares provenance, version, conflict, and query indexes", () => {
    expect(indexNames(RetrievalRunSchema)).toEqual(
      expect.arrayContaining([
        "retrieval_runs_case_created",
        "retrieval_runs_provider_operation_status",
      ]),
    );
    expect(indexNames(SourceSnapshotSchema)).toEqual(
      expect.arrayContaining([
        "source_snapshots_url_content_unique",
        "source_snapshots_url_retrieved",
        "source_snapshots_content_hash",
        "source_snapshots_domain_authority",
      ]),
    );
    expect(indexNames(ProcedureSchema)).toContain("procedures_scope_unique");
    expect(indexNames(ProcedureVersionSchema)).toContain(
      "procedure_versions_procedure_version_unique",
    );
    expect(indexNames(ProceduralClaimSchema)).toContain(
      "procedural_claims_version_key_unique",
    );
  });
});

function indexNames(schema: {
  indexes(): Array<[unknown, { name?: string }]>;
}): string[] {
  return schema
    .indexes()
    .map(([, options]) => options.name)
    .filter((name): name is string => Boolean(name));
}
