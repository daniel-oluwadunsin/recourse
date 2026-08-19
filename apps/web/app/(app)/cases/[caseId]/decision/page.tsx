"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useCase, useUpdateCase } from "../../../../../lib/queries";
import { decisionTypes, relationshipTypes } from "../../../../../lib/statuses";
import {
  Card,
  ErrorState,
  Field,
  LoadingState,
  Notice,
  Select,
  TextArea,
  TextInput,
  Button,
  StatusBadge,
} from "../../../../../components/ui";

const schema = z.object({
  institutionName: z.string().max(200).nullable(),
  relationship: z.string().nullable(),
  decisionType: z.string().nullable(),
  statedReason: z.string().max(10000).nullable(),
  decisionDate: z.string().nullable(),
  notificationDate: z.string().nullable(),
  countryCode: z.string().max(2).nullable(),
  regionCode: z.string().max(20).nullable(),
});
type Values = z.infer<typeof schema>;

export default function DecisionPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const query = useCase(caseId);
  const update = useUpdateCase(caseId);
  const [saved, setSaved] = useState(false);
  const item = query.data;
  const effective = item?.decision?.effectiveFields ?? {};
  const raw = item?.decision?.rawExtractedFields ?? {};
  const jurisdiction = effective.jurisdiction as
    { countryCode?: string; regionCode?: string } | null | undefined;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      institutionName: String(effective.institutionName ?? ""),
      relationship: String(effective.relationship ?? ""),
      decisionType: String(effective.decisionType ?? ""),
      statedReason: String(effective.statedReason ?? ""),
      decisionDate: effective.decisionDate
        ? new Date(String(effective.decisionDate)).toISOString().slice(0, 10)
        : "",
      notificationDate: effective.notificationDate
        ? new Date(String(effective.notificationDate))
            .toISOString()
            .slice(0, 10)
        : "",
      countryCode: String(jurisdiction?.countryCode ?? ""),
      regionCode: String(jurisdiction?.regionCode ?? ""),
    },
  });
  if (query.isLoading) return <LoadingState label="Loading decision" />;
  if (query.isError || !item)
    return (
      <ErrorState
        message="The decision record could not be loaded."
        retry={() => void query.refetch()}
      />
    );
  const submit = async (values: Values) => {
    setSaved(false);
    await update.mutateAsync({
      expectedRevision: item.revision,
      corrections: {
        institutionName: values.institutionName || null,
        relationship: values.relationship || null,
        decisionType: values.decisionType || null,
        statedReason: values.statedReason || null,
        decisionDate: values.decisionDate || null,
        notificationDate: values.notificationDate || null,
        jurisdiction:
          values.countryCode || values.regionCode
            ? {
                countryCode: values.countryCode?.toUpperCase() || null,
                regionCode: values.regionCode || null,
                source: "USER_CORRECTED",
              }
            : null,
      },
    });
    setSaved(true);
  };
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Decision</p>
          <h2 className="section-heading mt-1">Review extracted fields</h2>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <Notice tone="info">
        Corrections are stored separately from raw extracted values. The
        original record remains inspectable in the event history.
      </Notice>
      {saved ? (
        <div className="mt-4">
          <Notice tone="success">
            Correction saved to the live case record.
          </Notice>
        </div>
      ) : null}
      <form className="mt-5 space-y-5" onSubmit={form.handleSubmit(submit)}>
        <Card>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Institution"
              error={form.formState.errors.institutionName?.message}
            >
              <TextInput {...form.register("institutionName")} />
            </Field>
            <Field label="Relationship">
              <Select {...form.register("relationship")}>
                <option value="">Unknown</option>
                {relationshipTypes.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Decision type">
              <Select {...form.register("decisionType")}>
                <option value="">Unknown</option>
                {decisionTypes.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Decision date">
              <TextInput type="date" {...form.register("decisionDate")} />
            </Field>
            <Field label="Notification date">
              <TextInput type="date" {...form.register("notificationDate")} />
            </Field>
            <Field label="Country code">
              <TextInput maxLength={2} {...form.register("countryCode")} />
            </Field>
            <Field label="Region code">
              <TextInput {...form.register("regionCode")} />
            </Field>
          </div>
          <Field label="Stated reason">
            <TextArea {...form.register("statedReason")} />
          </Field>
          <div className="mt-5 flex justify-end">
            <Button type="submit" loading={update.isPending}>
              Save correction
            </Button>
          </div>
        </Card>
      </form>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <p className="eyebrow">Original extraction</p>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-pencil-muted">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </Card>
        <Card>
          <p className="eyebrow">Effective projection</p>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6">
            {JSON.stringify(effective, null, 2)}
          </pre>
        </Card>
      </div>
    </div>
  );
}
