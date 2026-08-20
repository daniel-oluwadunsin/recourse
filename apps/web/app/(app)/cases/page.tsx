"use client";

import Link from "next/link";
import { useState } from "react";
import { useCases, useDeadlines } from "../../../lib/queries";
import { caseStatuses } from "../../../lib/statuses";
import { Filter, SearchNormal1 } from "../../../components/icons";
import {
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  PageHeader,
  Select,
  StatusBadge,
  TextInput,
} from "../../../components/ui";

function DeadlineCell({ caseId }: { caseId: string }) {
  const query = useDeadlines(caseId);
  const deadline =
    query.data?.find((item) => item.status === "OPEN") ?? query.data?.[0];
  if (query.isLoading)
    return <span className="text-pencil-muted">Loading…</span>;
  return (
    <span className={deadline?.status === "EXPIRED" ? "text-red" : ""}>
      {deadline?.dueAt
        ? new Date(deadline.dueAt).toLocaleDateString()
        : "Not established"}
    </span>
  );
}

export default function CasesPage() {
  const [status, setStatus] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const query = useCases({
    status: status || undefined,
    institutionId: institutionId || undefined,
  });
  const items = query.data?.items ?? [];
  return (
    <div>
      <PageHeader
        eyebrow="Case registry"
        title="Cases"
        description="Owner-scoped cases from the live API, ordered by most recently updated."
        action={<LinkButton href="/cases/new">New case</LinkButton>}
      />
      <Card>
        <div className="grid gap-4 md:grid-cols-[1fr_220px_1fr] md:items-end">
          <label className="field">
            <span className="field-label">
              <SearchNormal1 size={14} className="mr-1 inline" /> Institution ID
            </span>
            <TextInput
              value={institutionId}
              onChange={(event) => setInstitutionId(event.target.value)}
              placeholder="Optional verified ID"
            />
          </label>
          <label className="field">
            <span className="field-label">
              <Filter size={14} className="mr-1 inline" /> Status
            </span>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {caseStatuses.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </label>
          <p className="text-xs leading-5 text-pencil-muted">
            Institution filters accept a persisted institution ID. Unknown names
            stay unresolved; this screen does not invent a catalog.
          </p>
        </div>
      </Card>
      <div className="mt-6">
        {query.isLoading ? (
          <LoadingState label="Loading cases" />
        ) : query.isError ? (
          <ErrorState
            message={
              query.error instanceof Error
                ? query.error.message
                : "Cases are unavailable."
            }
            retry={() => void query.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No matching cases"
            description={
              status || institutionId
                ? "Try clearing the filter or create a new case."
                : "Create a case from a decision notice, text, or screenshot."
            }
            action={<LinkButton href="/cases/new">Create case</LinkButton>}
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Status</th>
                  <th>Readiness</th>
                  <th>Deadline</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="case-row">
                    <td>
                      <Link
                        href={`/cases/${item.id}`}
                        className="case-row-link font-semibold text-blue underline underline-offset-4"
                        aria-label={`Open case: ${item.title}`}
                      >
                        {item.title}
                      </Link>
                      <div className="mt-1 text-xs text-pencil-muted">
                        {item.caseKey} ·{" "}
                        {item.institutionNameRaw || "Institution unresolved"}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      {!item.readiness?.computedAt ||
                      item.readiness.score == null ? (
                        <span className="text-pencil-muted">
                          Not calculated
                        </span>
                      ) : (
                        `${Math.round(item.readiness.score)}%`
                      )}
                      <div className="mt-1 text-xs text-pencil-muted">
                        {item.readiness?.computedAt
                          ? `${item.openCriticalGapCount} critical gap${item.openCriticalGapCount === 1 ? "" : "s"}`
                          : "Gaps not analyzed"}
                      </div>
                    </td>
                    <td>
                      <DeadlineCell caseId={item.id} />
                    </td>
                    <td className="text-pencil-muted">
                      {new Date(item.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
