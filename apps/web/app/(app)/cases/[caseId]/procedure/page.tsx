"use client";

import { useParams } from "next/navigation";
import { useProcedure, useRetryProcedure } from "../../../../../lib/queries";
import {
  Global,
  Link1,
  Refresh2,
  Warning2,
} from "../../../../../components/icons";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
} from "../../../../../components/ui";

export default function ProcedurePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const query = useProcedure(caseId);
  const retry = useRetryProcedure(caseId);
  if (query.isLoading)
    return <LoadingState label="Loading verified procedure" />;
  if (query.isError)
    return (
      <ErrorState
        message={
          query.error instanceof Error
            ? query.error.message
            : "Procedure data is unavailable."
        }
        retry={() => void query.refetch()}
      />
    );
  const data = query.data;
  const recovery = data?.review.reason ? (
    <div className="mt-5">
      <Notice tone="warning">
        Procedure resolution stopped safely because{" "}
        {formatReason(data.review.reason)}.
        {data.review.retriable
          ? " Review the decision details and retrieved sources, then retry. Recourse will run retrieval and provenance validation again; it will not bypass validation."
          : " Review the decision details, sources, and activity log. This failure cannot be bypassed automatically."}
      </Notice>
      {data.review.retriable ? (
        <Button
          className="mt-4"
          loading={retry.isPending}
          onClick={() => retry.mutate()}
        >
          <Refresh2 size={17} /> Retry procedure resolution
        </Button>
      ) : null}
      {retry.isError ? (
        <p className="mt-3 text-sm text-red">
          {retry.error instanceof Error
            ? retry.error.message
            : "Procedure retry could not be started."}
        </p>
      ) : null}
      {retry.isSuccess ? (
        <p className="mt-3 text-sm text-green">
          Retry started. Live case activity will update this screen.
        </p>
      ) : null}
    </div>
  ) : null;
  if (!data?.procedure)
    return (
      <div>
        <PageHeader
          eyebrow="Procedure"
          title="Procedure resolution"
          description="Recourse only treats extracted source pages as procedural evidence after retrieval and verification."
        />
        <EmptyState
          title="No procedure attached yet"
          description="The case has not reached a verified, scope-matching procedure. Search failures are not replaced with model memory."
        />
        {recovery}
      </div>
    );
  return (
    <div>
      <PageHeader
        eyebrow="Procedure"
        title={data.procedure.institutionName || "Resolved procedure"}
        description={`${data.procedure.relationship} · ${data.procedure.decisionType}${data.procedure.jurisdictionKey ? ` · ${data.procedure.jurisdictionKey}` : ""}`}
      />
      <Notice
        tone={
          data.procedure.status === "RESOLVED"
            ? "success"
            : data.procedure.status === "CONFLICTED"
              ? "warning"
              : "info"
        }
      >
        {data.procedure.status === "RESOLVED"
          ? "This procedure is attached to the case because its persisted scope matches."
          : `Procedure status is ${data.procedure.status}. Review conflicts and verification before relying on it.`}
      </Notice>
      {recovery}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-pencil-muted">
            Status
          </p>
          <div className="mt-2">
            <StatusBadge status={data.procedure.status} />
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-pencil-muted">
            Last verified
          </p>
          <p className="mt-2 font-semibold">
            {data.procedure.lastVerifiedAt
              ? new Date(data.procedure.lastVerifiedAt).toLocaleString()
              : "Unknown"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-pencil-muted">
            Current version
          </p>
          <p className="mt-2 font-semibold">
            {data.version?.version ?? "Not available"}
          </p>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <Card>
          <div className="flex items-center gap-2">
            <Global size={20} className="text-blue" />
            <h2 className="section-heading">Verified procedural claims</h2>
          </div>
          {data.claims.length ? (
            <div className="mt-4 space-y-3">
              {data.claims.map((claim) => (
                <article
                  key={claim.id}
                  className="rounded-xl border border-line p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-pencil-muted">
                      {claim.type}
                    </span>
                    <StatusBadge status={claim.verificationStatus} />
                  </div>
                  <p className="mt-2 text-sm leading-6">{claim.humanText}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-pencil-muted">
                    <span>
                      Confidence {Math.round(claim.confidence * 100)}%
                    </span>
                    <span>·</span>
                    <span>{claim.authorityTier}</span>
                  </div>
                  {claim.verificationExplanation ? (
                    <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-pencil-muted">
                      {claim.verificationExplanation}
                    </p>
                  ) : null}
                  {claim.support.length ? (
                    <div className="mt-3 text-xs text-pencil-muted">
                      Supported by {claim.support.length} source passage
                      {claim.support.length === 1 ? "" : "s"}.
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No claims extracted"
              description="The source snapshot exists, but no verified procedural claims have been persisted."
            />
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-2">
            <Link1 size={20} className="text-blue" />
            <h2 className="section-heading">Source snapshots</h2>
          </div>
          {data.sources.length ? (
            <div className="mt-4 space-y-3">
              {data.sources.map((source) => (
                <article
                  key={source.id}
                  className="rounded-xl border border-line p-4"
                >
                  <a
                    href={source.canonicalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="source-link break-all text-sm font-semibold"
                  >
                    {source.canonicalUrl}
                  </a>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge status={source.authorityTier} />
                    <span className="text-xs text-pencil-muted">
                      Retrieved{" "}
                      {new Date(source.retrievedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-pencil-muted">
                    Hash {source.contentSha256.slice(0, 16)}… ·{" "}
                    {source.paragraphs.length} normalized passage
                    {source.paragraphs.length === 1 ? "" : "s"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No source snapshots"
              description="Search snippets are never displayed as procedural proof."
            />
          )}
        </Card>
      </div>
      {data.claims.some((claim) =>
        ["CONTRADICTED", "AMBIGUOUS"].includes(claim.verificationStatus),
      ) ? (
        <div className="mt-5">
          <Notice tone="warning">
            <Warning2 size={17} /> Conflicting or ambiguous procedural claims
            are present. Review source passages before taking action.
          </Notice>
        </div>
      ) : null}
    </div>
  );
}

function formatReason(reason: string | null): string {
  if (!reason) return "the procedure could not be verified";
  const descriptions: Record<string, string> = {
    AI_INPUT_TOO_LARGE:
      "the retrieved source packet exceeded the provider's safe input limit",
    CACHED_PROCEDURE_UNRESOLVED: "the cached procedure is not verified",
    GROQ_REQUEST_FAILED: "the AI provider rejected the structured request",
    GROQ_STRUCTURED_OUTPUT_REJECTED:
      "the AI provider could not produce valid structured output",
    INVALID_PROVIDER_JSON: "the provider returned invalid structured data",
    NO_AUTHORITATIVE_SOURCES: "no authoritative source was established",
    OUTPUT_PROVENANCE_INVALID:
      "the generated claims cited source paragraphs that were not supplied",
    PROCEDURE_CONFIDENCE_INSUFFICIENT:
      "the verified source support was below the required confidence threshold",
    PROCEDURE_CONFLICTED: "the retrieved procedural sources conflict",
    PROVIDER_SCHEMA_MISMATCH:
      "the provider response did not match the required schema",
    SAFETY_BUDGET_EXHAUSTED:
      "this case reached its daily retrieval safety limit; retry after the UTC daily reset",
  };
  return descriptions[reason] ?? reason.toLowerCase().replaceAll("_", " ");
}
