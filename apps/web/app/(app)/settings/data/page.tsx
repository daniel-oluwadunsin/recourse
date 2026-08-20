"use client";

import { useState } from "react";

import { ApiError, deleteAccount } from "../../../../lib/api";
import { Button, Card, Notice, PageHeader } from "../../../../components/ui";

export default function DataPage() {
  return <DataSettings />;
}

function DataSettings() {
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onDelete(): Promise<void> {
    setStatus("deleting");
    setMessage(null);
    try {
      await deleteAccount(password);
      window.location.assign("/");
    } catch (error: unknown) {
      setStatus("error");
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Account deletion could not be completed.",
      );
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Data & privacy"
        description="Your evidence and case records remain under the backend lifecycle and storage policies."
      />
      <Card className="max-w-2xl">
        <h2 className="section-heading">Private evidence</h2>
        <p className="mt-3 text-sm leading-6 text-pencil-muted">
          Original files are stored in private Cloudinary assets. This UI
          requests short-lived download access only when you explicitly open a
          file.
        </p>
        <h2 className="section-heading mt-7">Deletion</h2>
        <p className="mt-3 text-sm leading-6 text-pencil-muted">
          Case and evidence deletion use backend tombstones so late processing
          cannot resurrect data. Use the delete controls in the relevant case
          workspace.
        </p>
        <div className="mt-6 space-y-4">
          <Notice tone="warning">
            Account deletion permanently removes your account, case records,
            evidence metadata, and private storage objects after cleanup. It
            cannot be undone.
          </Notice>
          <label className="field-label" htmlFor="delete-confirmation">
            Type DELETE to confirm
          </label>
          <input
            className="field-input"
            id="delete-confirmation"
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
          <label className="field-label" htmlFor="delete-password">
            Enter your password to re-authenticate
          </label>
          <input
            autoComplete="current-password"
            className="field-input"
            id="delete-password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
          {message ? <Notice tone="danger">{message}</Notice> : null}
          <Button
            disabled={
              confirmation !== "DELETE" || !password || status === "deleting"
            }
            onClick={() => void onDelete()}
            variant="danger"
          >
            {status === "deleting" ? "Deleting account…" : "Delete account"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
