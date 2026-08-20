"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import {
  useActionMutation,
  useAppeals,
  useCreateAction,
  useGenerateAppeal,
} from "../../../../../lib/queries";
import {
  controlledActions,
  capabilities,
  requestedOutcomes,
} from "../../../../../lib/action-options";
import {
  ArrowRight,
  Check,
  Lock1,
  SecuritySafe,
  Warning2,
} from "../../../../../components/icons";
import type { CaseAction } from "../../../../../lib/types";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Notice,
  PageHeader,
  Select,
  StatusBadge,
} from "../../../../../components/ui";

function coverage(value: number) {
  return Math.round(value * 100) + "%";
}

export default function AppealsPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const query = useAppeals(caseId);
  const [outcome, setOutcome] = useState("REVIEW_DECISION");
  const [actionType, setActionType] = useState("SUBMIT_APPEAL");
  const [capability, setCapability] = useState("ASSISTED_PORTAL");
  const [createdAction, setCreatedAction] = useState<CaseAction | null>(null);
  const generate = useGenerateAppeal(caseId);
  const appeals = query.data ?? [];
  const latest = appeals[0];
  const createAction = useCreateAction(caseId, latest?.id ?? "");
  const approveMutation = useActionMutation(caseId, "approve");
  const executeMutation = useActionMutation(caseId, "execute");
  if (query.isLoading) return <LoadingState label="Loading appeals" />;
  if (query.isError)
    return (
      <ErrorState
        message="Appeals are unavailable."
        retry={() => void query.refetch()}
      />
    );
  const create = async () => {
    if (!latest) return;
    setCreatedAction(
      await createAction.mutateAsync({
        actionType,
        capability,
        idempotencyKey: "web-" + crypto.randomUUID(),
      }),
    );
  };
  const approve = async () => {
    if (createdAction)
      setCreatedAction(await approveMutation.mutateAsync(createdAction.id));
  };
  const execute = async () => {
    if (
      createdAction &&
      window.confirm(
        "This calls the real action adapter. Continue only if you understand the capability and destination.",
      )
    )
      setCreatedAction(await executeMutation.mutateAsync(createdAction.id));
  };
  return (
    <div>
      <PageHeader
        eyebrow="Appeals & actions"
        title="Grounded next action"
        description="Arguments are generated from persisted evidence and verified procedure claims. Sending or submitting is separately gated."
      />
      <Card>
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-blue/10 p-3 text-blue">
            <SecuritySafe size={23} />
          </span>
          <div>
            <h2 className="section-heading">
              Generate a grounded appeal draft
            </h2>
            <p className="mt-1 text-sm text-pencil-muted">
              The backend blocks material unsupported assertions. No external
              action is performed by generation.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Requested outcome">
            <Select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            >
              {requestedOutcomes.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            onClick={() => void generate.mutateAsync(outcome)}
            loading={generate.isPending}
          >
            <ArrowRight size={17} /> Generate draft
          </Button>
        </div>
        {generate.isError ? (
          <div className="mt-4">
            <Notice tone="danger">
              {generate.error instanceof Error
                ? generate.error.message
                : "The grounded composer could not complete."}
            </Notice>
          </div>
        ) : null}
      </Card>
      {latest ? (
        <div className="mt-5 space-y-5">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">
                  Draft {latest.sequence}.{latest.version}
                </p>
                <h2 className="section-heading mt-1">{latest.title}</h2>
              </div>
              <StatusBadge status={latest.status} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-muted p-4">
                <p className="text-xs text-pencil-muted">Factual grounding</p>
                <p className="mt-1 text-2xl font-bold">
                  {coverage(latest.factualGroundingCoverage)}
                </p>
              </div>
              <div className="rounded-xl bg-muted p-4">
                <p className="text-xs text-pencil-muted">
                  Procedural grounding
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {coverage(latest.proceduralGroundingCoverage)}
                </p>
              </div>
              <div className="rounded-xl bg-muted p-4">
                <p className="text-xs text-pencil-muted">
                  Unsupported assertions
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {latest.unsupportedAssertionCount}
                </p>
              </div>
            </div>
            {latest.unsupportedAssertionCount > 0 ? (
              <div className="mt-4">
                <Notice tone="danger">
                  <Warning2 size={17} /> This draft is blocked by unsupported
                  material assertions.
                </Notice>
              </div>
            ) : null}
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <p className="eyebrow">Rendered body</p>
                <div className="mt-3 whitespace-pre-wrap rounded-xl border border-line p-4 text-sm leading-7">
                  {latest.renderedBody}
                </div>
              </div>
              <div>
                <p className="eyebrow">Structured arguments</p>
                <div className="mt-3 space-y-3">
                  {latest.structuredArguments.arguments.map(
                    (argument, index) => (
                      <div
                        key={argument.proposition + index}
                        className="rounded-xl border border-line p-4"
                      >
                        <p className="text-sm font-semibold">
                          {argument.proposition}
                        </p>
                        <p className="mt-2 text-xs text-pencil-muted">
                          Claims {argument.supportingClaimIds.length} · evidence{" "}
                          {argument.supportingEvidenceIds.length} · procedure
                          claims {argument.supportingProceduralClaimIds.length}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-start gap-3">
              <Lock1 size={22} className="text-blue" />
              <div>
                <h2 className="section-heading">Create a gated action</h2>
                <p className="mt-1 text-sm text-pencil-muted">
                  Capability is a truthful adapter choice. An institution
                  without a real API is never presented as AUTO_API.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Field label="Action type">
                <Select
                  value={actionType}
                  onChange={(event) => setActionType(event.target.value)}
                >
                  {controlledActions.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Capability">
                <Select
                  value={capability}
                  onChange={(event) => setCapability(event.target.value)}
                >
                  {capabilities.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => void create()}
                  loading={createAction.isPending}
                  disabled={latest.unsupportedAssertionCount > 0}
                >
                  <Lock1 size={17} /> Request approval
                </Button>
              </div>
            </div>
            {latest.unsupportedAssertionCount > 0 ? (
              <p className="mt-3 text-xs text-red">
                Resolve the grounding block before this button is available.
              </p>
            ) : null}
          </Card>
          {createdAction ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Action receipt</p>
                  <h2 className="section-heading mt-1">
                    {createdAction.actionType.replaceAll("_", " ")}
                  </h2>
                  <p className="mt-1 text-sm text-pencil-muted">
                    {createdAction.capability} · adapter{" "}
                    {createdAction.adapterName || "not selected"}
                  </p>
                </div>
                <StatusBadge status={createdAction.status} />
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-pencil-muted">
                    Recommendation
                  </p>
                  <p className="mt-2 text-sm leading-6">
                    {createdAction.recommendation.reason}
                  </p>
                  {createdAction.recommendation.instructions.length > 0 ? (
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-pencil-muted">
                      {createdAction.recommendation.instructions.map(
                        (instruction) => (
                          <li key={instruction}>{instruction}</li>
                        ),
                      )}
                    </ol>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-pencil-muted">
                    Official destination
                  </p>
                  {createdAction.recommendation.officialDestination ? (
                    <a
                      className="mt-2 block break-all font-semibold text-blue hover:underline"
                      href={createdAction.recommendation.officialDestination}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open the verified institution page
                    </a>
                  ) : (
                    <p className="mt-2 text-sm text-pencil-muted">
                      No verified destination is available.
                    </p>
                  )}
                  <p className="text-xs uppercase tracking-wide text-pencil-muted">
                    External reference
                  </p>
                  <p className="mt-2 font-semibold">
                    {createdAction.externalReference ||
                      "Not executed / not verified"}
                  </p>
                  {createdAction.failureMessage ? (
                    <p className="mt-2 text-sm text-red">
                      {createdAction.failureMessage}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {createdAction.status === "AWAITING_APPROVAL" ||
                createdAction.status === "PROPOSED" ? (
                  <Button
                    onClick={() => void approve()}
                    loading={approveMutation.isPending}
                  >
                    <Check size={17} /> Approve action
                  </Button>
                ) : null}
                {createdAction.status === "APPROVED" ||
                createdAction.status === "PREPARED" ? (
                  <Button
                    variant="danger"
                    onClick={() => void execute()}
                    loading={executeMutation.isPending}
                  >
                    Execute real adapter
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-pencil-muted">
                Approval is recorded separately. Execution is a real provider
                boundary and is never implied by this screen.
              </p>
            </Card>
          ) : null}
        </div>
      ) : (
        <div className="mt-5">
          <EmptyState
            title="No appeal draft yet"
            description="Generate a grounded draft after the case has enough verified procedure and evidence context."
          />
        </div>
      )}
    </div>
  );
}
