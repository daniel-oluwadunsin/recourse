"use client";

import Link from "next/link";
import { useCases } from "../../../lib/queries";
import { Calendar, Check, Clock, Warning2 } from "../../../components/icons";
import {
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadingState,
  Metric,
  PageHeader,
  StatusBadge,
} from "../../../components/ui";

export default function DashboardPage() {
  const query = useCases();
  const items = query.data?.items ?? [];
  if (query.isLoading) return <LoadingState label="Loading dashboard" />;
  if (query.isError)
    return (
      <ErrorState
        message={
          query.error instanceof Error
            ? query.error.message
            : "Dashboard data is unavailable."
        }
        retry={() => void query.refetch()}
      />
    );
  return (
    <div>
      <PageHeader
        eyebrow="Your workspace"
        title="Dashboard"
        description="A live view of your cases, deadlines, and evidence readiness."
        action={<LinkButton href="/cases/new">Start a case</LinkButton>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <Metric
            label="Visible cases"
            value={items.length}
            helper="From the current live page"
          />
        </Card>
        <Card>
          <Metric
            label="Needs attention"
            value={
              items.filter((item) =>
                ["NEEDS_HUMAN", "REPLANNING"].includes(item.status),
              ).length
            }
            helper="Cases that require your input"
          />
        </Card>
        <Card>
          <Metric
            label="Ready to appeal"
            value={
              items.filter((item) => item.status === "READY_TO_APPEAL").length
            }
            helper="No action is sent automatically"
          />
        </Card>
        <Card>
          <Metric
            label="Open gaps"
            value={items.reduce(
              (total, item) =>
                total +
                (item.readiness?.computedAt ? item.openCriticalGapCount : 0),
              0,
            )}
            helper={`${items.filter((item) => !item.readiness?.computedAt).length} case${items.filter((item) => !item.readiness?.computedAt).length === 1 ? "" : "s"} not analyzed`}
          />
        </Card>
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h2 className="section-heading mt-1">Your cases</h2>
            </div>
            <Link
              href="/cases"
              className="text-sm font-semibold text-blue underline underline-offset-4"
            >
              View all
            </Link>
          </div>
          {items.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No cases yet"
                description="Start with the decision notice or a short description. Recourse will keep later uncertainty explicit."
                action={
                  <LinkButton href="/cases/new">
                    Create your first case
                  </LinkButton>
                }
              />
            </div>
          ) : (
            <div className="mt-5 space-y-2">
              {items.slice(0, 6).map((item) => (
                <Link
                  key={item.id}
                  href={`/cases/${item.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-line p-4 transition hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-pencil-muted">
                      {item.institutionNameRaw || "Institution unresolved"} ·
                      updated {new Date(item.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={item.status} />
                    <span className="text-xs text-pencil-muted">
                      {item.readiness?.computedAt
                        ? `${item.openCriticalGapCount} gap${item.openCriticalGapCount === 1 ? "" : "s"}`
                        : "Not analyzed"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <p className="eyebrow">What to review</p>
          <h2 className="section-heading mt-1">Signals, not guesses</h2>
          <div className="mt-5 space-y-4 text-sm">
            <div className="flex gap-3">
              <Warning2 size={19} className="text-red" />
              <span>
                <strong>Contradictions</strong>
                <br />
                <span className="text-pencil-muted">
                  Conflicting claims remain visible until resolved.
                </span>
              </span>
            </div>
            <div className="flex gap-3">
              <Calendar size={19} className="text-blue" />
              <span>
                <strong>Deadlines</strong>
                <br />
                <span className="text-pencil-muted">
                  Only verified or explicitly uncertain dates appear.
                </span>
              </span>
            </div>
            <div className="flex gap-3">
              <Clock size={19} className="text-blue" />
              <span>
                <strong>Processing</strong>
                <br />
                <span className="text-pencil-muted">
                  Uploads and jobs keep their actual backend status.
                </span>
              </span>
            </div>
            <div className="flex gap-3">
              <Check size={19} className="text-green" />
              <span>
                <strong>Approval</strong>
                <br />
                <span className="text-pencil-muted">
                  External actions are gated and never implied.
                </span>
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
