"use client";

import {
  useAnalysis,
  useCase,
  useDeadlines,
  useProcedure,
  useRequirements,
  useContradictions,
} from "../lib/queries";
import { Warning2, Check, Clock } from "./icons";
import { Card, StatusBadge } from "./ui";

export function CaseHealth({ caseId }: { caseId: string }) {
  const caseQuery = useCase(caseId);
  const analysis = useAnalysis(caseId);
  const procedure = useProcedure(caseId);
  const requirements = useRequirements(caseId);
  const contradictions = useContradictions(caseId);
  const deadlines = useDeadlines(caseId);
  const item = caseQuery.data;
  const readiness = analysis.data?.readiness ?? item?.readiness;
  const healthCalculated = Boolean(readiness?.computedAt);
  const criticalGaps =
    analysis.data?.openCriticalGapCount ?? item?.openCriticalGapCount;
  const openContradictions =
    analysis.data?.contradictionCount ?? item?.contradictionCount;
  const openDeadline = deadlines.data?.find(
    (deadline) => deadline.status === "OPEN",
  );
  return (
    <Card className="health-panel">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Case health</p>
        <span className="text-xs text-pencil-muted">Backend-derived</span>
      </div>
      <div className="health-score">
        <span className="health-score-number">
          {healthCalculated && readiness?.score != null
            ? `${Math.round(readiness.score)}%`
            : "—"}
        </span>
        <span className="text-xs text-pencil-muted">Readiness</span>
      </div>
      <div className="space-y-3 text-sm">
        <div className="health-row">
          <span>
            <Warning2 size={17} /> Critical gaps
          </span>
          <strong>{healthCalculated ? (criticalGaps ?? 0) : "—"}</strong>
        </div>
        <div className="health-row">
          <span>
            <Warning2 size={17} /> Open contradictions
          </span>
          <strong>{healthCalculated ? (openContradictions ?? 0) : "—"}</strong>
        </div>
        <div className="health-row">
          <span>
            <Check size={17} /> Procedure
          </span>
          <StatusBadge
            status={procedure.data?.procedure?.status ?? "NOT_AVAILABLE"}
          />
        </div>
        <div className="health-row">
          <span>
            <Clock size={17} /> Next deadline
          </span>
          <strong>
            {openDeadline?.dueAt
              ? new Date(openDeadline.dueAt).toLocaleDateString()
              : procedure.data?.procedure?.status === "ACTIVE"
                ? "None established"
                : "Not established"}
          </strong>
        </div>
      </div>
      {!healthCalculated ? (
        <p className="mt-4 text-xs leading-5 text-pencil-muted">
          Readiness, gaps, and contradictions have not been calculated because
          case analysis has not completed.
        </p>
      ) : null}
      {requirements.isFetching || contradictions.isFetching ? (
        <p className="mt-4 text-xs text-pencil-muted">
          Refreshing health signals…
        </p>
      ) : null}
    </Card>
  );
}
