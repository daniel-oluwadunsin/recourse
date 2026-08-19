import { Card, Notice, PageHeader } from "../../../../components/ui";
export default function DataPage() {
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
        <div className="mt-6">
          <Notice tone="info">
            A complete account export/delete endpoint is not present in the
            backend contract yet, so it is not simulated here.
          </Notice>
        </div>
      </Card>
    </div>
  );
}
