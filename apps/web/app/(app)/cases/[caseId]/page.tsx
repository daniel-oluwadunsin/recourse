"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCase,
  useEvents,
  useDeadlines,
  useAnalysis,
  useRequirements,
  useResponses,
} from "../../../../lib/queries";
import {
  Calendar,
  Chart2,
  Clock,
  DocumentText,
  Warning2,
} from "../../../../components/icons";
import {
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  Metric,
  Notice,
  StatusBadge,
} from "../../../../components/ui";

function ResponsesCard({ caseId }: { caseId: string }) {
  const responses = useResponses(caseId);
  if (responses.isLoading)
    return (
      <Card>
        <p className="text-sm text-pencil-muted">Loading inbound responses…</p>
      </Card>
    );
  if (responses.isError)
    return (
      <Card>
        <Notice tone="warning">Inbound response data is unavailable.</Notice>
      </Card>
    );
  if (!responses.data?.length) return null;
  return (
    <Card className="mt-5">
      <p className="eyebrow">Inbound responses</p>
      <h2 className="section-heading mt-1">Observe before replanning</h2>
      <div className="mt-4 space-y-3">
        {responses.data.map((response) => (
          <article
            key={response.id}
            className="rounded-xl border border-line p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {response.subject || "Institution response"}
                </p>
                <p className="mt-1 text-xs text-pencil-muted">
                  {response.fromAddress} ·{" "}
                  {new Date(response.receivedAt).toLocaleString()}
                </p>
              </div>
              <StatusBadge
                status={response.outcome || response.processingStatus}
              />
            </div>
            {response.statedReason ? (
              <p className="mt-3 text-sm leading-6">{response.statedReason}</p>
            ) : null}
            <p className="mt-3 text-xs text-pencil-muted">
              Association: {response.associationStatus} · addressed claims{" "}
              {response.addressedClaimIds.length} · unaddressed claims{" "}
              {response.unaddressedClaimIds.length}
            </p>
            {response.replanNextAction ? (
              <Notice tone="info">
                Next controlled action: {response.replanNextAction}.{" "}
                {response.replanRationale || "Rationale unavailable."}
              </Notice>
            ) : null}
          </article>
        ))}
      </div>
    </Card>
  );
}

export default function CaseOverviewPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const caseQuery = useCase(caseId);
  const events = useEvents(caseId);
  const deadlines = useDeadlines(caseId);
  const analysis = useAnalysis(caseId);
  const requirements = useRequirements(caseId);
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
  const factorList = readiness?.factors ?? [];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Overview</p>
          <h2 className="section-heading mt-1">
            What Recourse knows right now
          </h2>
        </div>
        <LinkButton href={`/cases/${caseId}/evidence`}>
          Review evidence
        </LinkButton>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <Metric
            label="Current stage"
            value={<StatusBadge status={item.status} />}
            helper="Controlled by the backend state machine"
          />
        </Card>
        <Card>
          <Metric
            label="Readiness"
            value={
              readiness?.score == null ? "—" : `${Math.round(readiness.score)}%`
            }
            helper={
              readiness?.version
                ? `Formula ${readiness.version}`
                : "Not calculated"
            }
          />
        </Card>
        <Card>
          <Metric
            label="Critical gaps"
            value={item.openCriticalGapCount}
            helper="Must be addressed before readiness can rise"
          />
        </Card>
        <Card>
          <Metric
            label="Contradictions"
            value={item.contradictionCount}
            helper="Open candidates remain visible"
          />
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Case record</p>
              <h2 className="section-heading mt-1">Decision context</h2>
            </div>
            <Link
              href={`/cases/${caseId}/decision`}
              className="text-sm font-semibold text-blue underline underline-offset-4"
            >
              Review / correct
            </Link>
          </div>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              [
                "Institution",
                item.institutionNameRaw || "Unknown / unresolved",
              ],
              ["Relationship", item.relationship || "Unknown"],
              ["Decision", item.decisionType || "Unknown"],
              [
                "Decision date",
                item.decisionDate
                  ? new Date(item.decisionDate).toLocaleDateString()
                  : "Unknown",
              ],
              [
                "Notification date",
                item.notificationDate
                  ? new Date(item.notificationDate).toLocaleDateString()
                  : "Unknown",
              ],
              ["Jurisdiction", item.jurisdiction?.countryCode || "Unknown"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-pencil-muted">
                  {label}
                </dt>
                <dd className="mt-1 text-sm">{value}</dd>
              </div>
            ))}
          </dl>
          {item.statedReason ? (
            <div className="mt-5 rounded-xl bg-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-pencil-muted">
                Stated reason
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {item.statedReason}
              </p>
            </div>
          ) : (
            <div className="mt-5">
              <Notice tone="warning">
                No stated reason has been recorded. This is an unresolved field,
                not a reason to infer one.
              </Notice>
            </div>
          )}
        </Card>
        <div className="space-y-5">
          <Card>
            <div className="flex items-center gap-2">
              <Calendar size={19} className="text-blue" />
              <h2 className="section-heading">Deadlines</h2>
            </div>
            {deadlines.isLoading ? (
              <p className="mt-4 text-sm text-pencil-muted">
                Loading verified deadlines…
              </p>
            ) : deadlines.data?.length ? (
              <div className="mt-4 space-y-3">
                {deadlines.data.slice(0, 4).map((deadline) => (
                  <div
                    key={deadline.id}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold">{deadline.type}</p>
                      <p className="text-xs text-pencil-muted">
                        {deadline.explanation ||
                          "Source explanation unavailable"}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={deadline.status} />
                      <p className="mt-1 text-xs text-pencil-muted">
                        {deadline.dueAt
                          ? new Date(deadline.dueAt).toLocaleDateString()
                          : "Unknown date"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No deadline recorded"
                description="A date will appear only when the backend has a verified or explicitly uncertain source."
              />
            )}
          </Card>
          <Card>
            <div className="flex items-center gap-2">
              <Clock size={19} className="text-blue" />
              <h2 className="section-heading">Latest activity</h2>
            </div>
            {events.data?.items?.length ? (
              <div className="mt-4 space-y-3">
                {events.data.items
                  .slice(-5)
                  .reverse()
                  .map((event) => (
                    <div key={event.id} className="flex gap-3 text-sm">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue" />
                      <div>
                        <p className="font-semibold">
                          {event.type.replaceAll("_", " ")}
                        </p>
                        <p className="text-xs text-pencil-muted">
                          {new Date(event.createdAt).toLocaleString()} · event{" "}
                          {event.sequence}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-pencil-muted">
                No events have been returned yet.
              </p>
            )}
          </Card>
        </div>
      </div>
      <Card className="mt-5">
        <div className="flex items-center gap-2">
          <Chart2 size={19} className="text-blue" />
          <h2 className="section-heading">Readiness factors</h2>
        </div>
        {factorList.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {factorList.map((factor) => (
              <div
                key={factor.key}
                className="rounded-xl border border-line p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">
                    {factor.key.replaceAll("_", " ")}
                  </p>
                  <StatusBadge status={factor.status} />
                </div>
                <p className="mt-2 text-sm leading-6 text-pencil-muted">
                  {factor.reason}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Analysis has not run"
            description="Readiness factors will come from the persisted intelligence result after evidence processing."
          />
        )}
      </Card>
      {requirements.data?.some(
        (item) => item.status === "MISSING" && item.critical,
      ) ? (
        <Notice tone="warning">
          <Warning2 size={17} /> Critical evidence requirements are missing.
          Review the Evidence tab before generating an appeal.
        </Notice>
      ) : null}
      <ResponsesCard caseId={caseId} />
      <div className="sr-only">
        <DocumentText />{" "}
      </div>
    </div>
  );
}
