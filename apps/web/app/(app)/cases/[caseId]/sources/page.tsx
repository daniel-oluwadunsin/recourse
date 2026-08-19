"use client";

import { useParams } from "next/navigation";
import { useProcedureSources } from "../../../../../lib/queries";
import { Link1 } from "../../../../../components/icons";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../../../../../components/ui";

export default function SourcesPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const query = useProcedureSources(caseId);
  if (query.isLoading) return <LoadingState label="Loading source snapshots" />;
  if (query.isError)
    return (
      <ErrorState
        message="Source provenance is unavailable."
        retry={() => void query.refetch()}
      />
    );
  const sources = query.data ?? [];
  return (
    <div>
      <PageHeader
        eyebrow="Sources"
        title="Source ledger"
        description="Immutable retrieval snapshots and normalized passages used by procedure claims."
      />
      {sources.length === 0 ? (
        <EmptyState
          title="No sources attached"
          description="This case does not have a retrieved procedure source yet."
        />
      ) : (
        <div className="space-y-4">
          {sources.map((source) => (
            <Card key={source.id}>
              <div className="flex items-start gap-3">
                <Link1 size={22} className="mt-1 shrink-0 text-blue" />
                <div className="min-w-0 flex-1">
                  <a
                    href={source.canonicalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="source-link break-all font-semibold"
                  >
                    {source.canonicalUrl}
                  </a>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={source.authorityTier} />
                    <span className="text-xs text-pencil-muted">
                      {source.domain} · retrieved{" "}
                      {new Date(source.retrievedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-pencil-muted">
                    Content hash: {source.contentSha256}
                  </p>
                  <div className="mt-4 space-y-3">
                    {source.paragraphs.map((paragraph) => (
                      <div
                        key={paragraph.paragraphId}
                        className="rounded-xl bg-muted p-4"
                      >
                        <p className="text-[11px] font-bold uppercase tracking-wide text-pencil-muted">
                          {paragraph.paragraphId}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                          {paragraph.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
