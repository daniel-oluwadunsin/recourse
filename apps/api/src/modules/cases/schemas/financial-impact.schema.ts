import { Schema, SchemaTypes, Types } from "mongoose";

import { type FinancialImpact } from "@recourse/contracts";

export interface FinancialImpactPersistence {
  amount: Types.Decimal128 | null;
  currency: string | null;
}

export const FinancialImpactSchema = new Schema<FinancialImpactPersistence>(
  {
    amount: { default: null, type: SchemaTypes.Decimal128 },
    currency: { default: null, type: String },
  },
  { _id: false, id: false },
);

export function toPublicFinancialImpact(
  value: FinancialImpactPersistence | null | undefined,
): FinancialImpact | null {
  if (!value) {
    return null;
  }

  return {
    amount: value.amount?.toString() ?? null,
    currency: value.currency ?? null,
  };
}
