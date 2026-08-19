import { Card, Notice, PageHeader } from "../../../../components/ui";
import { Lock1, ShieldTick } from "../../../../components/icons";
export default function SecurityPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Security"
        description="How this session and your case data are protected."
      />
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <ShieldTick size={25} className="text-green" />
          <h2 className="section-heading mt-4">Session protection</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-pencil-muted">
            <li>Access tokens are held in memory only.</li>
            <li>
              Refresh tokens stay in an HttpOnly cookie and rotate on refresh.
            </li>
            <li>Every case API call is owner-scoped by the backend.</li>
          </ul>
        </Card>
        <Card>
          <Lock1 size={25} className="text-blue" />
          <h2 className="section-heading mt-4">Action protection</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-pencil-muted">
            <li>
              Appeal drafts are blocked when material assertions are
              unsupported.
            </li>
            <li>External actions require a persisted approval state.</li>
            <li>
              Execution receipts are displayed only after adapter response and
              verification.
            </li>
          </ul>
        </Card>
      </div>
      <div className="mt-5">
        <Notice tone="warning">
          Security settings such as password change and session revocation are
          not exposed by the current API surface. No client-side control is
          pretending they are complete.
        </Notice>
      </div>
    </div>
  );
}
