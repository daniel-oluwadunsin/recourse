"use client";

import { useParams } from "next/navigation";
import { useTimeline } from "../../../../../lib/queries";
import { Calendar } from "../../../../../components/icons";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../../../../../components/ui";

export default function TimelinePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const query = useTimeline(caseId);
  if (query.isLoading) return <LoadingState label="Loading timeline" />;
  if (query.isError)
    return (
      <ErrorState
        message="Timeline data is unavailable."
        retry={() => void query.refetch()}
      />
    );
  const events = query.data ?? [];
  return (
    <div>
      <PageHeader
        eyebrow="Timeline"
        title="Case timeline"
        description="Normalized events retain raw date text, precision, confidence, and source references."
      />
      {events.length === 0 ? (
        <EmptyState
          title="No timeline events"
          description="Timeline entries appear after evidence processing produces date-bearing claims."
        />
      ) : (
        <div className="relative space-y-4 before:absolute before:bottom-3 before:left-[17px] before:top-3 before:w-px before:bg-line">
          {events.map((event) => (
            <article key={event.id} className="relative flex gap-4">
              <div className="z-10 mt-1 rounded-full bg-paper p-1 text-blue">
                <Calendar size={25} />
              </div>
              <Card className="flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{event.eventText}</p>
                    <p className="mt-1 text-xs text-pencil-muted">
                      {event.rawDateText || "Date not stated"} ·{" "}
                      {event.datePrecision}
                    </p>
                  </div>
                  <StatusBadge
                    status={`${Math.round(event.confidence * 100)}% confidence`}
                  />
                </div>
                {event.sourceRefs.length ? (
                  <p className="mt-3 text-xs text-pencil-muted">
                    {event.sourceRefs.length} source reference
                    {event.sourceRefs.length === 1 ? "" : "s"}
                  </p>
                ) : null}
              </Card>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
