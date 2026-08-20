"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { EvidenceUploader } from "../../../../../components/evidence-uploader";
import { Upload } from "../../../../../components/icons";
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
import { useResponses } from "../../../../../lib/queries";

export default function ResponsesPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const responses = useResponses(caseId);
  const [showUploader, setShowUploader] = useState(false);

  if (responses.isLoading)
    return <LoadingState label="Loading institution responses" />;
  if (responses.isError)
    return (
      <ErrorState
        message="Institution responses are unavailable."
        retry={() => void responses.refetch()}
      />
    );

  const items = responses.data ?? [];
  return (
    <div>
      <PageHeader
        eyebrow="Responses"
        title="Institution responses"
        description="Forwarded email and uploaded response documents are associated with this case, analyzed, and used to update the next legitimate step."
        action={
          <Button type="button" onClick={() => setShowUploader(true)}>
            <Upload size={17} /> Add response
          </Button>
        }
      />
      {showUploader ? (
        <EvidenceUploader
          caseId={caseId}
          fixedKind="INSTITUTION_RESPONSE"
          onCancel={() => setShowUploader(false)}
          onComplete={() => {
            setShowUploader(false);
            void responses.refetch();
          }}
        />
      ) : null}
      <Notice tone="info">
        An uploaded response is not treated as a successful appeal submission.
        It is evidence received from the institution. Email replies are matched
        only through the case-specific reply address.
      </Notice>
      {items.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="No response received"
            description="Upload a copied response, screenshot, or document here, or forward the institution email to the case-specific reply address when one is provided."
            action={
              <Button type="button" onClick={() => setShowUploader(true)}>
                Add institution response
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {items.map((response) => (
            <Card key={response.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">
                    Received {new Date(response.receivedAt).toLocaleString()}
                  </p>
                  <h2 className="section-heading mt-1">
                    {response.subject || "Uploaded institution response"}
                  </h2>
                  <p className="mt-1 text-sm text-pencil-muted">
                    From {response.fromAddress}
                  </p>
                </div>
                <StatusBadge status={response.processingStatus} />
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-muted p-4">
                  <p className="text-xs text-pencil-muted">Outcome</p>
                  <p className="mt-1 font-semibold">
                    {response.outcome?.replaceAll("_", " ") ||
                      "Pending analysis"}
                  </p>
                </div>
                <div className="rounded-xl bg-muted p-4">
                  <p className="text-xs text-pencil-muted">Confidence</p>
                  <p className="mt-1 font-semibold">
                    {response.outcomeConfidence == null
                      ? "Pending"
                      : `${Math.round(response.outcomeConfidence * 100)}%`}
                  </p>
                </div>
                <div className="rounded-xl bg-muted p-4">
                  <p className="text-xs text-pencil-muted">Next action</p>
                  <p className="mt-1 font-semibold">
                    {response.replanNextAction?.replaceAll("_", " ") ||
                      "Pending"}
                  </p>
                </div>
              </div>
              {response.statedReason ? (
                <p className="mt-4 text-sm leading-6">
                  <strong>Stated reason:</strong> {response.statedReason}
                </p>
              ) : null}
              {response.requestedEvidence.length ? (
                <div className="mt-4">
                  <p className="text-sm font-semibold">Requested evidence</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-pencil-muted">
                    {response.requestedEvidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {response.replanRationale ? (
                <div className="mt-4">
                  <Notice tone="info">{response.replanRationale}</Notice>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
