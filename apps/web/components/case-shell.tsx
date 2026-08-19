"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCase, useCaseActivityStream } from "../lib/queries";
import {
  ArrowLeft,
  Activity,
  Chart2,
  DocumentText,
  Global,
  Graph,
  MenuBoard,
  SecuritySafe,
  ShieldTick,
} from "./icons";
import { ErrorState, LoadingState, StatusBadge } from "./ui";
import { CaseHealth } from "./case-health";

const tabs = [
  ["", "Overview", Chart2],
  ["decision", "Decision", DocumentText],
  ["evidence", "Evidence", ShieldTick],
  ["procedure", "Procedure", Global],
  ["graph", "Case graph", Graph],
  ["timeline", "Timeline", MenuBoard],
  ["appeals", "Appeals & actions", SecuritySafe],
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
  useCaseActivityStream(caseId);
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
