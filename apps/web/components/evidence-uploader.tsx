"use client";

import { useRef, useState } from "react";

import type { Evidence, EvidenceKind } from "../lib/types";
import { createTextEvidence, uploadEvidence } from "../lib/queries";
import { DocumentText, Upload } from "./icons";
import { Button, Card, Field, Notice, Select, TextArea, TextInput } from "./ui";

const evidenceKinds: Array<{ value: EvidenceKind; label: string }> = [
  { value: "DECISION_NOTICE", label: "Decision notice" },
  { value: "SUPPORTING_DOCUMENT", label: "Supporting document" },
  { value: "SCREENSHOT", label: "Screenshot" },
  { value: "EMAIL", label: "Email" },
  { value: "INSTITUTION_RESPONSE", label: "Institution response" },
  { value: "OTHER", label: "Other" },
];

export function EvidenceUploader({
  caseId,
  fixedKind,
  onComplete,
  onCancel,
}: {
  caseId: string;
  fixedKind?: EvidenceKind;
  onComplete: (evidence: Evidence) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<EvidenceKind>(
    fixedKind ?? "SUPPORTING_DOCUMENT",
  );
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== null;

  const submitFile = async () => {
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setError(null);
    setProgress(0);
    setStage("Uploading private evidence");
    try {
      const evidence = await uploadEvidence(
        caseId,
        file,
        kind,
        setProgress,
        label.trim() || file.name,
      );
      setStage("Upload complete; processing has been queued");
      onComplete(evidence);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Upload failed.");
      setStage(null);
    }
  };

  const submitText = async () => {
    if (!text.trim()) {
      setError("Enter the evidence text before saving.");
      return;
    }
    setError(null);
    setStage("Saving text evidence");
    try {
      const evidence = await createTextEvidence(
        caseId,
        text,
        label.trim() || "Pasted evidence",
        kind,
      );
      setStage("Text saved; processing has been queued");
      onComplete(evidence);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Text evidence could not be saved.",
      );
      setStage(null);
    }
  };

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Add to this case</p>
          <h2 className="section-heading mt-1">Upload evidence</h2>
          <p className="mt-2 max-w-2xl text-sm text-pencil-muted">
            Files remain private. After upload, background processing extracts
            text and preserves block-level provenance.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
        >
          Close
        </Button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            {fixedKind ? null : (
              <Field label="Evidence type">
                <Select
                  value={kind}
                  onChange={(event) =>
                    setKind(event.target.value as EvidenceKind)
                  }
                  disabled={busy}
                >
                  {evidenceKinds.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field
              label="Label"
              hint="Optional; the filename is used by default."
            >
              <TextInput
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                maxLength={200}
                placeholder="e.g. Suspension notice"
                disabled={busy}
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-2 flex min-h-36 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line p-5 text-center transition hover:border-blue hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload size={26} className="text-blue" />
            <span className="font-semibold">
              {file ? file.name : "Choose a file"}
            </span>
            <span className="text-xs text-pencil-muted">
              PDF, DOCX, EML, TXT, PNG, JPEG, GIF, or WebP
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            aria-label="Evidence file"
            accept=".pdf,.docx,.eml,.txt,.png,.jpg,.jpeg,.gif,.webp"
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          {file ? (
            <p className="mt-2 text-xs text-pencil-muted">
              {(file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
              {file.type || "Unknown MIME type"}
            </p>
          ) : null}
          <Button
            type="button"
            className="mt-4"
            onClick={submitFile}
            loading={busy}
          >
            <Upload size={17} /> Upload file
          </Button>
        </div>

        <div className="border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="flex items-center gap-2">
            <DocumentText size={20} className="text-blue" />
            <h3 className="font-semibold">Or paste text</h3>
          </div>
          <Field
            label="Evidence text"
            hint="Use this for a notice, email, or timeline that you can copy as text."
          >
            <TextArea
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={100000}
              placeholder="Paste the source text exactly as received…"
              disabled={busy}
            />
          </Field>
          <Button
            type="button"
            variant="secondary"
            onClick={submitText}
            loading={busy}
          >
            Save text evidence
          </Button>
        </div>
      </div>

      {stage ? (
        <div className="mt-5" aria-live="polite">
          <div className="flex justify-between text-xs text-pencil-muted">
            <span>{stage}</span>
            <span>{file ? `${progress}%` : ""}</span>
          </div>
          <div className="progress-track mt-2">
            <div className="progress-value" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
    </Card>
  );
}
