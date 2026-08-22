"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import {
  useAnalysis,
  useAnswerOpenFacts,
  useApproveAnalysis,
  useCase,
  useEvents,
  useRetryAnalysis,
} from "../../../../lib/queries";
import type {
  CaseAnalysis,
  CaseEvent,
  CaseRecord,
  UnresolvedFact,
} from "../../../../lib/types";
import {
  caseEventDescription,
  caseEventTitle,
} from "../../../../lib/case-events";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LinkButton,
  LoadingState,
  Notice,
  StatusBadge,
  TextArea,
} from "../../../../components/ui";

function isUnresolvedFact(value: unknown): value is UnresolvedFact {
  return (
    typeof value === "object" &&
    value !== null &&
    "fact" in value &&
    "resolutionOwner" in value &&
    "resolutionAction" in value &&
    "blocking" in value
  );
}

function statusGuidance(status: CaseRecord["status"]): {
  title: string;
  description: string;
} {
  const guidance: Record<
    CaseRecord["status"],
    { title: string; description: string }
  > = {
    INTAKE: {
      title: "Add the decision and supporting documents",
      description: "Start with the notice or message that caused this case.",
    },
    CLASSIFYING: {
      title: "Recourse is reading the decision",
      description:
        "The important details are being identified automatically.",
    },
    PROCEDURE_RESOLUTION: {
      title: "Recourse is checking the correct process",
      description:
        "The relevant official review route and deadlines are being verified.",
    },
    EVIDENCE_COLLECTION: {
      title: "Add the evidence that supports your case",
      description:
        "You can still add documents, screenshots, emails, or notes.",
    },
    CASE_ANALYSIS: {
      title: "Your case is being reviewed",
      description:
        "Recourse is comparing the decision, evidence, timeline, and requirements.",
    },
    READY_TO_APPEAL: {
      title: "Your case is ready for the next review step",
      description:
        "Review the evidence and procedure before preparing an appeal.",
    },
    AWAITING_USER_APPROVAL: {
      title: "Your approval is needed",
      description:
        "Review the prepared action before anything consequential can happen.",
    },
    SUBMITTED: {
      title: "Your case has been submitted",
      description:
        "The submitted evidence packet is locked while Recourse waits for a response.",
    },
    AWAITING_RESPONSE: {
      title: "Waiting for the institution's response",
      description:
        "Upload the response when it arrives so Recourse can review what happens next.",
    },
    RESPONSE_RECEIVED: {
      title: "A response has been received",
      description:
        "Recourse is preparing the next review based on the response.",
    },
    REPLANNING: {
      title: "Recourse is deciding what to do next",
      description:
        "The latest response is being compared with the existing case record.",
    },
    RESOLVED: {
      title: "This case is resolved",
      description:
        "The desired outcome has been confirmed from the available record.",
    },
    EXHAUSTED: {
      title: "This case is closed",
      description: "The available review routes have been exhausted.",
    },
    NEEDS_HUMAN: {
      title: "Your review is needed",
      description:
        "Recourse cannot safely continue until the highlighted issue is resolved.",
    },
  };
  return guidance[status];
}

function ActivityPreview({
  caseId,
  events,
}: {
  caseId: string;
  events: CaseEvent[];
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Recent updates</p>
          <h2 className="section-heading mt-1">What has happened</h2>
        </div>
        <LinkButton href={`/cases/${caseId}/activity`}>
          See all updates
        </LinkButton>
      </div>
      {events.length ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          {events
            .slice(-4)
            .reverse()
            .map((event) => (
              <div key={event.id} className="flex gap-3 text-sm">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue" />
                <div>
                  <p className="font-semibold">{caseEventTitle(event.type)}</p>
                  <p className="mt-1 leading-6 text-pencil-muted">
                    {caseEventDescription(event)}
                  </p>
                  <p className="mt-1 text-xs text-pencil-muted">
                    {new Date(event.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-pencil-muted">
          Updates will appear here as Recourse reviews the case.
        </p>
      )}
    </Card>
  );
}

function DecisionSummary({
  caseId,
  item,
}: {
  caseId: string;
  item: CaseRecord;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Your case</p>
          <h2 className="section-heading mt-1">What happened</h2>
        </div>
        <Link
          href={`/cases/${caseId}/decision`}
          className="text-sm font-semibold text-blue underline underline-offset-4"
        >
          Review details
        </Link>
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-pencil-muted">
            Institution
          </dt>
          <dd className="mt-1 text-sm">
            {item.institutionNameRaw || "Not recorded yet"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-pencil-muted">
            Decision
          </dt>
          <dd className="mt-1 text-sm">
            {item.decisionType || "Not classified yet"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-pencil-muted">
            When it happened
          </dt>
          <dd className="mt-1 text-sm">
            {item.decisionDate
              ? new Date(item.decisionDate).toLocaleDateString()
              : "Date not recorded"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-pencil-muted">
            Your relationship
          </dt>
          <dd className="mt-1 text-sm">
            {item.relationship || "Not recorded yet"}
          </dd>
        </div>
      </dl>
      <div className="mt-5 rounded-xl bg-muted p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-pencil-muted">
          Reason given
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
          {item.statedReason || "No reason has been recorded yet."}
        </p>
      </div>
    </Card>
  );
}

function NextStepCard({
  item,
  analysisFailed,
}: {
  item: CaseRecord;
  analysisFailed: boolean;
}) {
  const guidance = statusGuidance(item.status);
  return (
    <Card className="border-blue/30">
      <p className="eyebrow">Next step</p>
      <h2 className="section-heading mt-1">{guidance.title}</h2>
      <p className="mt-3 text-sm leading-6 text-pencil-muted">
        {guidance.description}
      </p>
      {analysisFailed ? (
        <Notice tone="warning">
          The last review stopped before producing a result. Review the
          updates, then retry when ready.
        </Notice>
      ) : null}
      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <StatusBadge status={item.status} />
        <span className="text-pencil-muted">Case revision {item.revision}</span>
      </div>
    </Card>
  );
}

function AnalysisGuidance({
  caseId,
  analysis,
}: {
  caseId: string;
  analysis: CaseAnalysis;
}) {
  const answerFacts = useAnswerOpenFacts(caseId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const userFacts = analysis.unresolvedFacts.filter(
    (fact) => fact.resolutionOwner === "USER" && fact.userQuestion,
  );
  const otherFacts = analysis.unresolvedFacts.filter(
    (fact) => fact.resolutionOwner !== "USER" || !fact.userQuestion,
  );
  const complete =
    userFacts.length > 0 &&
    userFacts.every((fact) => answers[fact.userQuestion!]?.trim());

  return (
    <div className="space-y-5">
      {userFacts.length ? (
        <Card className="border-blue/30">
          <p className="eyebrow">Your input needed</p>
          <h2 className="section-heading mt-1">A few questions for you</h2>
          <p className="mt-2 text-sm leading-6 text-pencil-muted">
            Answer only what you know. If you do not know, say so—never guess.
            Your answers become clearly marked case evidence.
          </p>
          <form
            className="mt-5 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!complete) return;
              answerFacts.mutate(
                userFacts.map((fact) => ({
                  question: fact.userQuestion!,
                  answer: answers[fact.userQuestion!]!.trim(),
                })),
              );
            }}
          >
            {userFacts.map((fact, index) => (
              <Field
                key={`${fact.fact}-${index}`}
                label={fact.userQuestion!}
                hint={fact.resolutionAction}
              >
                <TextArea
                  value={answers[fact.userQuestion!] ?? ""}
                  maxLength={4000}
                  placeholder="Write what you know…"
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [fact.userQuestion!]: event.target.value,
                    }))
                  }
                />
              </Field>
            ))}
            {answerFacts.isError ? (
              <Notice tone="warning">
                {answerFacts.error instanceof Error
                  ? answerFacts.error.message
                  : "The answers could not be recorded."}
              </Notice>
            ) : null}
            {answerFacts.isSuccess ? (
              <Notice tone="info">
                Answers saved. Recourse is reviewing the case again.
              </Notice>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={!complete}
                loading={answerFacts.isPending}
              >
                Save answers
              </Button>
              <LinkButton href={`/cases/${caseId}/evidence`}>
                Add supporting evidence
              </LinkButton>
            </div>
          </form>
        </Card>
      ) : null}

      {analysis.centralIssues.length || analysis.recommendedNextSteps.length ? (
        <Card>
          <p className="eyebrow">Case review</p>
          <h2 className="section-heading mt-1">What Recourse found</h2>
          {analysis.centralIssues.length ? (
            <ul className="mt-4 space-y-2 text-sm leading-6">
              {analysis.centralIssues.slice(0, 3).map((issue) => (
                <li key={issue} className="rounded-xl bg-muted p-3">
                  {issue}
                </li>
              ))}
            </ul>
          ) : null}
          {analysis.recommendedNextSteps.length ? (
            <div className="mt-5 border-t border-line pt-5">
              <p className="text-sm font-semibold">Suggested next steps</p>
              <ol className="mt-3 space-y-3">
                {analysis.recommendedNextSteps.slice(0, 3).map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-6">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue/10 text-xs font-bold text-blue">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </Card>
      ) : null}

      {otherFacts.length ? (
        <details className="paper-card">
          <summary className="cursor-pointer font-semibold">
            See other open questions ({otherFacts.length})
          </summary>
          <div className="mt-4 space-y-3">
            {otherFacts.map((fact) => (
              <div key={fact.fact} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{fact.fact}</p>
                  <StatusBadge
                    status={fact.blocking ? "BLOCKING" : fact.resolutionOwner}
                  />
                </div>
                <p className="mt-1 text-sm text-pencil-muted">
                  {fact.resolutionAction}
                </p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function ReadinessDetails({
  factors,
}: {
  factors: NonNullable<CaseRecord["readiness"]>["factors"];
}) {
  if (!factors.length) {
    return (
      <EmptyState
        title="Readiness is not available yet"
        description="It will appear after the case has finished reviewing the available evidence."
      />
    );
  }
  return (
    <details className="paper-card">
      <summary className="cursor-pointer font-semibold">
        See what affects case readiness
      </summary>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {factors.map((factor) => (
          <div key={factor.key} className="rounded-xl border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{factor.key.replaceAll("_", " ")}</p>
              <StatusBadge status={factor.status} />
            </div>
            <p className="mt-2 text-sm leading-6 text-pencil-muted">
              {factor.reason}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function CaseOverviewPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const caseQuery = useCase(caseId);
  const events = useEvents(caseId);
  const analysis = useAnalysis(caseId);
  const retryAnalysis = useRetryAnalysis(caseId);
  const approveAnalysis = useApproveAnalysis(caseId);
  if (caseQuery.isLoading) return <LoadingState label="Loading overview" />;
  if (caseQuery.isError || !caseQuery.data)
    return (
      <ErrorState
        message={
          caseQuery.error instanceof Error
            ? caseQuery.error.message
            : "Case unavailable."
        }
        retry={() => void caseQuery.refetch()}
      />
    );

  const item = caseQuery.data;
  const readiness = analysis.data?.readiness ?? item.readiness;
  const analysisSnapshot = analysis.data?.analysis ?? null;
  const rawFacts = (analysisSnapshot?.unresolvedFacts ?? []) as unknown[];
  const analysisUsesCurrentFormat = rawFacts.every(isUnresolvedFact);
  const legacyAnalysis = Boolean(analysisSnapshot && !analysisUsesCurrentFormat);
  const blockingFacts = analysisUsesCurrentFormat
    ? (rawFacts as UnresolvedFact[]).filter(
        (fact) => fact.resolutionOwner !== "INSTITUTION",
      )
    : [];
  const healthCalculated = Boolean(readiness?.computedAt);
  const analysisApprovable =
    item.status === "NEEDS_HUMAN" &&
    analysisUsesCurrentFormat &&
    blockingFacts.length === 0 &&
    Boolean(readiness?.computedAt) &&
    (readiness?.score ?? 0) >= 70 &&
    (readiness?.caps.length ?? 0) === 0;
  const latestEvent = events.data?.items.at(-1);
  const analysisFailed =
    latestEvent?.type === "CASE_NEEDS_HUMAN" &&
    latestEvent.payload.reason === "CASE_ANALYSIS_FAILED";
  const procedureReviewIncomplete =
    latestEvent?.type === "CASE_NEEDS_HUMAN" &&
    typeof latestEvent.payload.procedureId === "string" &&
    latestEvent.payload.procedureId.length > 0 &&
    !healthCalculated;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Case overview</p>
          <h2 className="section-heading mt-1">Your case at a glance</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-pencil-muted">
            A simple summary of what happened, what Recourse found, and what
            you can do next.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {analysisApprovable ? (
            <Button
              loading={approveAnalysis.isPending}
              onClick={() => approveAnalysis.mutate()}
            >
              Accept and continue
            </Button>
          ) : (item.status === "NEEDS_HUMAN" ||
              item.status === "EVIDENCE_COLLECTION" ||
              item.status === "CASE_ANALYSIS" ||
              (item.status === "READY_TO_APPEAL" &&
                (legacyAnalysis || blockingFacts.length > 0))) &&
            (healthCalculated || analysisFailed || procedureReviewIncomplete) ? (
            <Button
              loading={retryAnalysis.isPending}
              onClick={() => retryAnalysis.mutate()}
              variant="secondary"
            >
              {analysisFailed
                ? "Retry review"
                : procedureReviewIncomplete
                  ? "Complete review"
                  : "Review again"}
            </Button>
          ) : null}
          <LinkButton href={`/cases/${caseId}/evidence`}>
            Review evidence
          </LinkButton>
        </div>
      </div>

      {retryAnalysis.isError ? (
        <Notice tone="warning">
          {retryAnalysis.error instanceof Error
            ? retryAnalysis.error.message
            : "The case review could not be started."}
        </Notice>
      ) : null}
      {approveAnalysis.isError ? (
        <Notice tone="warning">
          {approveAnalysis.error instanceof Error
            ? approveAnalysis.error.message
            : "Your approval could not be recorded."}
        </Notice>
      ) : null}
      {legacyAnalysis ? (
        <Notice tone="warning">
          This case needs to be reviewed again before an appeal can be prepared.
        </Notice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <DecisionSummary caseId={caseId} item={item} />
        <NextStepCard item={item} analysisFailed={analysisFailed} />
      </div>

      <ActivityPreview caseId={caseId} events={events.data?.items ?? []} />

      {analysisSnapshot && analysisUsesCurrentFormat ? (
        <AnalysisGuidance caseId={caseId} analysis={analysisSnapshot} />
      ) : null}

      <ReadinessDetails factors={readiness?.factors ?? []} />
    </div>
  );
}
