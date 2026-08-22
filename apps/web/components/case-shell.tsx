"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCase, useCaseActivityStream, useEvents } from "../lib/queries";
import { caseEventTitle } from "../lib/case-events";
import {
  ArrowLeft,
  Activity,
  Chart2,
  DocumentText,
  Global,
  Graph,
  MenuBoard,
  MessageQuestion,
  SecuritySafe,
  ShieldTick,
} from "./icons";
import { ErrorState, LinkButton, LoadingState, StatusBadge } from "./ui";
import { CaseHealth } from "./case-health";

const tabs = [
  ["", "Overview", Chart2],
  ["decision", "Decision", DocumentText],
  ["evidence", "Evidence", ShieldTick],
  ["procedure", "Procedure", Global],
  ["graph", "Case graph", Graph],
  ["timeline", "Timeline", MenuBoard],
  ["appeals", "Appeals & actions", SecuritySafe],
  ["responses", "Responses", MessageQuestion],
  ["sources", "Sources", Global],
  ["activity", "Activity", Activity],
] as const;

export function CaseShell({
  caseId,
  children,
}: {
  caseId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const query = useCase(caseId);
  const events = useEvents(caseId);
  const streamStatus = useCaseActivityStream(caseId);
  if (query.isLoading) return <LoadingState label="Loading case workspace" />;
  if (query.isError || !query.data)
    return (
      <ErrorState
        message={
          query.error instanceof Error
            ? query.error.message
            : "This case could not be loaded."
        }
        retry={() => void query.refetch()}
      />
    );
  const item = query.data;
  const processingCopy: Record<string, string> = {
    CASE_ANALYSIS:
      "Recourse is comparing your evidence, requirements, contradictions, and timeline.",
    CLASSIFYING:
      "Recourse is reading the decision and identifying what happened.",
    PROCEDURE_RESOLUTION:
      "Recourse is finding and verifying the current procedure from authoritative sources.",
    REPLANNING:
      "Recourse is reviewing the latest response and deciding what comes next.",
  };
  const latestEvent = events.data?.items.at(-1);
  const isProcessing = item.status in processingCopy;
  const streamLabel =
    streamStatus === "CONNECTED"
      ? "Live updates connected"
      : streamStatus === "RECONNECTING"
        ? "Reconnecting to live updates"
        : streamStatus === "OFFLINE"
          ? "Live updates unavailable"
          : "Connecting to live updates";
  return (
    <div>
      <Link href="/cases" className="back-link">
        <ArrowLeft size={16} /> All cases
      </Link>
      <div className="case-heading">
        <div>
          <p className="eyebrow">Case {item.caseKey}</p>
          <h1 className="display-heading display-heading-sm">{item.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            <span className="text-sm text-pencil-muted">
              Revision {item.revision}
            </span>
            {item.institutionNameRaw ? (
              <span className="text-sm text-pencil-muted">
                · {item.institutionNameRaw}
              </span>
            ) : null}
          </div>
        </div>
        <CaseHealth caseId={caseId} />
      </div>
      {isProcessing ? (
        <div
          className="mt-5 flex flex-col gap-4 rounded-2xl border border-blue/30 bg-blue/5 p-4 md:flex-row md:items-center md:justify-between"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span className="spinner spinner-dark mt-1" aria-hidden="true" />
            <div>
              <p className="font-semibold">Recourse is processing this case</p>
              <p className="mt-1 text-sm leading-6 text-pencil-muted">
                {processingCopy[item.status]}
              </p>
              {latestEvent ? (
                <p className="mt-2 text-xs text-pencil-muted">
                  Latest: {caseEventTitle(latestEvent.type)} ·{" "}
                  {new Date(latestEvent.createdAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-pencil-muted">
              {streamLabel}
            </span>
            <LinkButton href={`/cases/${caseId}/activity`}>
              View live activity
            </LinkButton>
          </div>
        </div>
      ) : null}
      <div className="workspace-grid">
        <nav className="workspace-nav" aria-label="Case workspace navigation">
          {tabs.map(([suffix, label, Icon]) => {
            const href = suffix
              ? `/cases/${caseId}/${suffix}`
              : `/cases/${caseId}`;
            const active = suffix
              ? pathname === href
              : pathname === `/cases/${caseId}`;
            return (
              <Link
                key={label}
                href={href}
                className={`workspace-link ${active ? "workspace-link-active" : ""}`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
