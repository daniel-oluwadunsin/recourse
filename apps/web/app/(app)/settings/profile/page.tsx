"use client";

import { useAuthStore } from "../../../../lib/auth-store";
import { Card, Notice, PageHeader } from "../../../../components/ui";
export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Profile"
        description="Account identity from the authenticated backend session."
      />
      <Card className="max-w-2xl">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-pencil-muted">
              Email
            </dt>
            <dd className="mt-1 font-semibold">
              {user?.email || "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-pencil-muted">
              Role
            </dt>
            <dd className="mt-1 font-semibold">
              {user?.role || "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-pencil-muted">
              Account status
            </dt>
            <dd className="mt-1 font-semibold">
              {user?.status || "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-pencil-muted">
              Email verified
            </dt>
            <dd className="mt-1 font-semibold">
              {user?.emailVerifiedAt
                ? new Date(user.emailVerifiedAt).toLocaleDateString()
                : "Not verified"}
            </dd>
          </div>
        </dl>
        <div className="mt-6">
          <Notice tone="info">
            Profile editing and email verification delivery are not enabled by
            the current backend provider configuration.
          </Notice>
        </div>
      </Card>
    </div>
  );
}
