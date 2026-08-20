"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../../../../../lib/api";
import { EvidenceUploader } from "../../../../../components/evidence-uploader";
import {
  useDeleteEvidence,
  useEvidence,
  useEvidenceBlocks,
  useClaims,
  useVerifyEvidenceClaims,
} from "../../../../../lib/queries";
import type { Evidence } from "../../../../../lib/types";
import {
  DocumentText,
  Eye,
  Trash,
  Upload,
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

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function ClaimsPanel({ caseId }: { caseId: string }) {
  const claims = useClaims(caseId);
  if (claims.isLoading)
    return <LoadingState label="Loading extracted claims" />;
  if (claims.isError)
    return (
      <ErrorState
        message="Case claims are unavailable."
        retry={() => void claims.refetch()}
      />
    );
  if (!claims.data?.length)
    return (
      <EmptyState
        title="No claims extracted"
        description="Claims appear after the evidence-processing and intelligence jobs complete."
      />
    );
  return (
    <Card className="mt-5">
      <p className="eyebrow">Extracted claims</p>
      <h2 className="section-heading mt-1">Claim ledger</h2>
      <p className="mt-2 text-sm text-pencil-muted">
        Each claim keeps its evidence status and source references. Inference
        and user assertions are not presented as verified facts.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {claims.data.map((claim) => (
          <article key={claim.id} className="rounded-xl border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">{claim.text}</p>
              <StatusBadge status={claim.status} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-pencil-muted">
              <span>{claim.normalizedType || "Unclassified"}</span>
              <span>·</span>
              <span>{Math.round(claim.confidence * 100)}% confidence</span>
              <span>·</span>
              <span>{claim.resolutionStatus}</span>
            </div>
            {claim.sourceRefs.length ? (
              <p className="mt-3 text-xs text-pencil-muted">
                {claim.sourceRefs.length} provenance reference
                {claim.sourceRefs.length === 1 ? "" : "s"}
              </p>
            ) : (
              <p className="mt-3 text-xs text-pencil-muted">
                No source reference returned.
              </p>
            )}
          </article>
        ))}
      </div>
    </Card>
  );
}

function EvidenceDetail({
  caseId,
  evidence,
  onDeleted,
}: {
  caseId: string;
  evidence: Evidence;
  onDeleted: () => void;
}) {
  const blocks = useEvidenceBlocks(caseId, evidence.id);
  const remove = useDeleteEvidence(caseId);
  const verifyClaims = useVerifyEvidenceClaims(caseId);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const download = async () => {
    setDownloadError(null);
    try {
      const result = await apiFetch<{
        url: string;
        expiresAt: string;
        filename: string;
      }>(`/cases/${caseId}/evidence/${evidence.id}/download`);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Download unavailable.",
      );
    }
  };
  const deleteEvidence = async () => {
    if (
      !window.confirm(
        "Delete this evidence? Its processing record will remain a tombstone.",
      )
    )
      return;
    await remove.mutateAsync(evidence.id);
    onDeleted();
  };
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="rounded-xl bg-blue/10 p-3 text-blue">
            <DocumentText size={22} />
          </span>
          <div>
            <h2 className="font-semibold">
              {evidence.label ||
                evidence.originalFilename ||
                "Untitled evidence"}
            </h2>
            <p className="mt-1 text-xs text-pencil-muted">
              {evidence.mimeType} · {formatBytes(evidence.byteSize)} · SHA-256{" "}
              {evidence.sha256 ? `${evidence.sha256.slice(0, 12)}…` : "pending"}
            </p>
          </div>
        </div>
        <StatusBadge status={evidence.processingStatus} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={download}
          disabled={evidence.processingStatus === "DELETED"}
        >
          <Eye size={17} /> Open private copy
        </Button>
        {evidence.processingStatus === "READY" ? (
          <Button
            variant="secondary"
            loading={verifyClaims.isPending}
            onClick={() => verifyClaims.mutate(evidence.id)}
          >
            Confirm extraction matches document
          </Button>
        ) : null}
        <Button
          variant="danger"
          onClick={deleteEvidence}
          loading={remove.isPending}
        >
          <Trash size={17} /> Delete
        </Button>
      </div>
      {downloadError ? (
        <div className="mt-4">
          <Notice tone="danger">{downloadError}</Notice>
        </div>
      ) : null}
      {verifyClaims.isSuccess ? (
        <div className="mt-4">
          <Notice tone="success">
            Confirmed {verifyClaims.data.verifiedClaimCount} extracted claim(s)
            against this document. This does not verify external truth.
          </Notice>
        </div>
      ) : null}
      {verifyClaims.isError ? (
        <div className="mt-4">
          <Notice tone="warning">
            {verifyClaims.error instanceof Error
              ? verifyClaims.error.message
              : "Claim confirmation failed."}
          </Notice>
        </div>
      ) : null}
      {evidence.processingErrorCode ? (
        <div className="mt-4">
          <Notice tone="warning">
            <Warning2 size={17} /> Extraction reported{" "}
            <strong>{evidence.processingErrorCode}</strong>. No claims should be
            treated as present until the evidence is ready.
          </Notice>
        </div>
      ) : null}
      <div className="mt-6">
        <p className="eyebrow">Extracted blocks</p>
        {blocks.isLoading ? (
          <LoadingState label="Loading provenance blocks" />
        ) : blocks.isError ? (
          <ErrorState
            message="Extracted blocks are unavailable."
            retry={() => void blocks.refetch()}
          />
        ) : blocks.data?.length ? (
          <div className="mt-3 max-h-[520px] space-y-3 overflow-auto pr-2">
            {blocks.data.map((block, index) => (
              <article
                key={block.id ?? `${block.blockIndex}-${index}`}
                className="rounded-xl border border-line p-4"
              >
                <div className="flex justify-between text-xs text-pencil-muted">
                  <span>Block {block.blockIndex ?? index + 1}</span>
                  <span>
                    {block.pageNumber == null
                      ? "No page number"
                      : `Page ${block.pageNumber}`}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {block.text}
                </p>
                {block.provenance ? (
                  <pre className="mt-3 whitespace-pre-wrap text-[11px] text-pencil-muted">
                    {JSON.stringify(block.provenance, null, 2)}
                  </pre>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No extracted blocks"
            description="The parser has not produced text blocks yet, or this format is unsupported."
          />
        )}
      </div>
    </Card>
  );
}

export default function EvidencePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const query = useEvidence(caseId);
  const [selected, setSelected] = useState<Evidence | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  if (query.isLoading) return <LoadingState label="Loading evidence" />;
  if (query.isError)
    return (
      <ErrorState
        message={
          query.error instanceof Error
            ? query.error.message
            : "Evidence is unavailable."
        }
        retry={() => void query.refetch()}
      />
    );
  const items = query.data?.items ?? [];
  return (
    <div>
      <PageHeader
        eyebrow="Evidence"
        title="Evidence ledger"
        description="Private files, processing status, hashes, and extracted text with block/page provenance."
        action={
          <Button type="button" onClick={() => setShowUploader(true)}>
            <Upload size={17} /> Add evidence
          </Button>
        }
      />
      {showUploader ? (
        <EvidenceUploader
          caseId={caseId}
          onCancel={() => setShowUploader(false)}
          onComplete={(evidence) => {
            setSelected(evidence);
            setShowUploader(false);
            void query.refetch();
          }}
        />
      ) : null}
      {items.length === 0 ? (
        <EmptyState
          title="No evidence attached"
          description="Upload a decision notice, supporting document, email, text, or screenshot directly to this case."
          action={
            <Button type="button" onClick={() => setShowUploader(true)}>
              Upload evidence
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[.85fr_1.3fr]">
            <div className="space-y-2">
              {items.map((evidence) => (
                <button
                  key={evidence.id}
                  onClick={() => setSelected(evidence)}
                  className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === evidence.id ? "border-blue bg-muted" : "border-line hover:bg-muted"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold">
                      {evidence.label ||
                        evidence.originalFilename ||
                        "Untitled evidence"}
                    </span>
                    <StatusBadge status={evidence.processingStatus} />
                  </div>
                  <p className="mt-2 text-xs text-pencil-muted">
                    {evidence.kind} · {formatBytes(evidence.byteSize)} ·{" "}
                    {evidence.extractionMethod || "Extraction pending"}
                  </p>
                </button>
              ))}
            </div>
            {selected ? (
              <EvidenceDetail
                caseId={caseId}
                evidence={selected}
                onDeleted={() => {
                  setSelected(null);
                  void query.refetch();
                }}
              />
            ) : (
              <EmptyState
                title="Select evidence"
                description="Choose a file to inspect extracted blocks and provenance."
              />
            )}
          </div>
          <ClaimsPanel caseId={caseId} />
        </>
      )}
    </div>
  );
}
