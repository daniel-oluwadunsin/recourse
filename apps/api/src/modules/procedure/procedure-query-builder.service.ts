import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

import {
  type DecisionType,
  type ProcedureScope,
  type RelationshipType,
} from "@recourse/contracts";

export interface ProcedureQueryInput {
  caseId: string;
  institutionId: string | null;
  institutionName: string | null;
  verifiedOfficialDomains: string[];
  relationship: RelationshipType;
  decisionType: DecisionType;
  jurisdictionKey: string | null;
}

export interface ProcedureQueryPlan {
  scope: ProcedureScope;
  scopeKey: string;
  queries: string[];
  includeDomains: string[];
  queryHash: string;
}

@Injectable()
export class ProcedureQueryBuilderService {
  build(input: ProcedureQueryInput): ProcedureQueryPlan {
    const scope: ProcedureScope = {
      institutionId: input.institutionId,
      institutionName: input.institutionName,
      relationship: input.relationship,
      decisionType: input.decisionType,
      jurisdictionKey: input.jurisdictionKey,
    };
    const scopeKey = createHash("sha256")
      .update(JSON.stringify(scope))
      .digest("hex");
    const institution = input.institutionName ?? "the platform";
    const jurisdiction = input.jurisdictionKey
      ? ` ${input.jurisdictionKey}`
      : "";
    const decision = decisionQueryTerms(input.decisionType);
    const queries = unique([
      `${institution} ${decision} ${input.relationship.toLowerCase()} appeal review procedure${jurisdiction}`,
      `${institution} appeal review policy ${decision}${jurisdiction}`,
      `${institution} official help appeal ${decision}`,
    ]).map((query) => query.slice(0, 399));
    const queryHash = createHash("sha256")
      .update(
        JSON.stringify({
          scope,
          queries,
          includeDomains: input.verifiedOfficialDomains,
        }),
      )
      .digest("hex");
    return {
      scope,
      scopeKey,
      queries,
      includeDomains: input.verifiedOfficialDomains.slice(0, 10),
      queryHash,
    };
  }
}

function unique(values: string[]): string[] {
  return [
    ...new Set(
      values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean),
    ),
  ];
}

function decisionQueryTerms(value: DecisionType): string {
  if (value === "PAYMENT_HOLD") {
    return "payout hold payment restriction account review";
  }
  return value.toLowerCase().replace(/_/g, " ");
}
