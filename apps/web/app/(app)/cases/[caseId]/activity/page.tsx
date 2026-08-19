"use client";

import { useParams } from "next/navigation";
import { useEvents } from "../../../../../lib/queries";
import { Activity, Refresh2 } from "../../../../../components/icons";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "../../../../../components/ui";

export default function ActivityPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const query = useEvents(caseId);
  if (query.isLoading)
    return <LoadingState label="Loading persisted activity" />;
  if (query.isError)
    return (
      <ErrorState
        message="Activity could not be loaded."
        retry={() => void query.refetch()}
      />
    );
  const events = query.data?.items ?? [];
  return (
    <div>
      <PageHeader
        eyebrow="Activity"
        title="Case activity"
        description="This feed is sourced from append-only persisted events. Live SSE updates invalidate this list; MongoDB replay recovers after reconnects."
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            <Refresh2 size={17} /> Refresh
          </Button>
        }
      />
      {events.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Events will appear as the case is created, corrected, processed, and reviewed."
        />
      ) : (
        <div className="space-y-3">
          {events
            .slice()
            .reverse()
            .map((event) => (
              <Card key={event.id}>
                <div className="flex gap-3">
                  <span className="rounded-xl bg-blue/10 p-2 text-blue">
                    <Activity size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {event.type.replaceAll("_", " ")}
                      </p>
                      <span className="text-xs text-pencil-muted">
                        #{event.sequence} ·{" "}
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-pencil-muted">
                      Actor: {event.actorType}
                      {event.correlationId
                        ? ` · correlation ${event.correlationId}`
                        : ""}
                    </p>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-blue">
                        View safe event payload
                      </summary>
                      <pre className="mt-2 overflow-auto rounded-lg bg-muted p-3 text-xs leading-5">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
