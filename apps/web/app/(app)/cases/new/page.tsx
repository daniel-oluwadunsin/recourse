"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  createTextEvidence,
  useCreateCase,
  uploadEvidence,
} from "../../../../lib/queries";
import { decisionTypes, relationshipTypes } from "../../../../lib/statuses";
import { ArrowLeft, DocumentText, Upload } from "../../../../components/icons";
import {
  Button,
  Card,
  Field,
  LinkButton,
  Notice,
  PageHeader,
  Select,
  TextArea,
  TextInput,
} from "../../../../components/ui";

const schema = z.object({
  title: z.string().trim().min(1, "Give the case a short title.").max(200),
  institutionName: z.string().trim().max(200).optional(),
  relationship: z.string().optional(),
  decisionType: z.string().optional(),
  statedReason: z.string().max(10000).optional(),
  decisionDate: z.string().optional(),
  notificationDate: z.string().optional(),
  countryCode: z.string().trim().max(2).optional(),
  regionCode: z.string().trim().max(20).optional(),
  currency: z
    .union([
      z.literal(""),
      z.string().trim().length(3, "Use a 3-letter currency code."),
    ])
    .optional(),
  amount: z.string().trim().max(50).optional(),
  text: z.string().max(100000).optional(),
});
type Values = z.infer<typeof schema>;

export default function NewCasePage() {
  const router = useRouter();
  const create = useCreateCase();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      relationship: "UNKNOWN",
      decisionType: "UNKNOWN",
      countryCode: "",
    },
  });
  const submit = async (values: Values) => {
    setError(null);
    setProgress(0);
    try {
      setStage("Creating case");
      const created = await create.mutateAsync({
        title: values.title,
        institutionName: values.institutionName || null,
        relationship: values.relationship || null,
        decisionType: values.decisionType || null,
        statedReason: values.statedReason || null,
        decisionDate: values.decisionDate || null,
        notificationDate: values.notificationDate || null,
        financialImpact:
          values.amount || values.currency
            ? {
                amount: values.amount || null,
                currency: values.currency?.toUpperCase() || null,
              }
            : null,
        jurisdiction:
          values.countryCode || values.regionCode
            ? {
                countryCode: values.countryCode?.toUpperCase() || null,
                regionCode: values.regionCode || null,
                source: "USER_ENTERED",
              }
            : null,
      });
      const caseId = created.id;
      setCreatedCaseId(caseId);
      if (values.text?.trim()) {
        setStage("Saving private notes");
        await createTextEvidence(caseId, values.text);
      }
      if (file) {
        setStage("Uploading private evidence");
        const kind = file.type.startsWith("image/")
          ? "SCREENSHOT"
          : "DECISION_NOTICE";
        await uploadEvidence(caseId, file, kind, setProgress, file.name);
      }
      setStage("Opening workspace");
      router.push(`/cases/${caseId}`);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "The case could not be created.",
      );
      setStage(null);
    }
  };
  return (
    <div>
      <Link href="/cases" className="back-link">
        <ArrowLeft size={16} /> Cancel
      </Link>
      <PageHeader
        eyebrow="New case"
        title="Start with the record you have"
        description="Enter what is known now. You can correct extracted decision fields later without destroying the original values."
      />
      <form onSubmit={handleSubmit(submit)}>
        <div className="grid gap-5 lg:grid-cols-[1.35fr_.8fr]">
          <div className="space-y-5">
            <Card>
              <h2 className="section-heading">Decision context</h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field label="Case title" error={errors.title?.message}>
                  <TextInput
                    placeholder="Account suspended after identity review"
                    {...register("title")}
                  />
                </Field>
                <Field
                  label="Institution or platform"
                  error={errors.institutionName?.message}
                  hint="If it is not in the trusted catalog, it will remain unresolved."
                >
                  <TextInput
                    placeholder="Name as shown in the notice"
                    {...register("institutionName")}
                  />
                </Field>
                <Field label="Your relationship">
                  <Select {...register("relationship")}>
                    <option value="">Unknown</option>
                    {relationshipTypes.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Decision type">
                  <Select {...register("decisionType")}>
                    <option value="">Unknown</option>
                    {decisionTypes.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Decision date">
                  <TextInput type="date" {...register("decisionDate")} />
                </Field>
                <Field label="Notification date">
                  <TextInput type="date" {...register("notificationDate")} />
                </Field>
                <Field label="Jurisdiction country" hint="ISO 3166-1 alpha-2">
                  <TextInput
                    maxLength={2}
                    placeholder="US"
                    {...register("countryCode")}
                  />
                </Field>
                <Field label="Region / state">
                  <TextInput
                    placeholder="Optional"
                    {...register("regionCode")}
                  />
                </Field>
              </div>
              <Field
                label="Stated reason"
                hint="Use the institution's wording when possible."
              >
                <TextArea
                  placeholder="What reason did the notice give?"
                  {...register("statedReason")}
                />
              </Field>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field label="Financial amount">
                  <TextInput placeholder="Optional" {...register("amount")} />
                </Field>
                <Field label="Currency" error={errors.currency?.message}>
                  <TextInput
                    maxLength={3}
                    placeholder="USD"
                    {...register("currency")}
                  />
                </Field>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3">
                <DocumentText size={22} className="text-blue" />
                <div>
                  <h2 className="section-heading">Add notes or evidence</h2>
                </div>
              </div>
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <Field
                  label="Quick notes"
                  hint="Saved as a text evidence block after case creation."
                >
                  <TextArea
                    placeholder="Paste the notice, timeline, or what happened…"
                    {...register("text")}
                  />
                </Field>
                <div>
                  <span className="field-label">
                    Upload a document or screenshot
                  </span>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-2 flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line p-5 text-center transition hover:border-blue hover:bg-muted"
                  >
                    <Upload size={28} className="text-blue" />
                    <span className="font-semibold">
                      {file ? file.name : "Choose a file"}
                    </span>
                    <span className="text-xs text-pencil-muted">
                      PDF, DOCX, EML, text, or supported image
                    </span>
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    className="sr-only"
                    accept=".pdf,.docx,.eml,.txt,.png,.jpg,.jpeg,.webp"
                    onChange={(event) =>
                      setFile(event.target.files?.[0] ?? null)
                    }
                  />
                  {file ? (
                    <p className="mt-2 text-xs text-pencil-muted">
                      {(file.size / 1024 / 1024).toFixed(2)} MB · MIME{" "}
                      {file.type || "unknown"}
                    </p>
                  ) : null}
                </div>
              </div>
              {stage ? (
                <div className="mt-5">
                  <div className="flex justify-between text-xs text-pencil-muted">
                    <span>{stage}</span>
                    <span>{file || progress ? `${progress}%` : ""}</span>
                  </div>
                  <div className="progress-track mt-2">
                    <div
                      className="progress-value"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
          <aside className="space-y-5">
            <Card>
              <p className="eyebrow">Before you submit</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-pencil-muted">
                <li>
                  Original evidence is preserved; corrections become separate
                  user-provided values.
                </li>
                <li>
                  Unknown institution names are not treated as verified domains.
                </li>
                <li>No external appeal is sent from intake.</li>
              </ul>
            </Card>
            {error ? (
              <Notice tone="danger">
                <div>
                  <p>{error}</p>
                  {createdCaseId ? (
                    <p className="mt-2">
                      The case was created. Continue to its evidence page to
                      retry the upload without creating a duplicate case.
                    </p>
                  ) : null}
                </div>
              </Notice>
            ) : null}
            {createdCaseId && error ? (
              <LinkButton
                href={`/cases/${createdCaseId}/evidence`}
                className="w-full justify-center"
              >
                Continue to case evidence
              </LinkButton>
            ) : null}
            <Button
              type="submit"
              loading={isSubmitting || create.isPending || Boolean(stage)}
              disabled={Boolean(createdCaseId)}
              className="w-full"
            >
              Create case
            </Button>
            <p className="text-center text-xs text-pencil-muted">
              You can review and correct the classification next.
            </p>
          </aside>
        </div>
      </form>
    </div>
  );
}
