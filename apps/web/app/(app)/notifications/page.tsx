"use client";

import Link from "next/link";
import {
  useMarkNotificationRead,
  useNotifications,
} from "../../../lib/queries";
import {
  Notification as NotificationIcon,
  Check,
} from "../../../components/icons";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "../../../components/ui";

export default function NotificationsPage() {
  const query = useNotifications();
  const markRead = useMarkNotificationRead();
  if (query.isLoading) return <LoadingState label="Loading notifications" />;
  if (query.isError)
    return (
      <ErrorState
        message="Notifications are unavailable."
        retry={() => void query.refetch()}
      />
    );
  const items = query.data ?? [];
  return (
    <div>
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Durable in-app notices created by the backend. Email delivery is shown only when the provider confirms configuration."
      />
      {items.length === 0 ? (
        <EmptyState
          title="No notifications"
          description="Deadline reminders and case activity notices will appear here when the backend creates them."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={item.readAt ? "opacity-70" : ""}>
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-blue/10 p-2 text-blue">
                  <NotificationIcon size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs text-pencil-muted">
                        {new Date(item.createdAt).toLocaleString()} ·{" "}
                        {item.channels.join(" / ")}
                      </p>
                    </div>
                    {item.readAt ? (
                      <span className="text-xs text-pencil-muted">Read</span>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => void markRead.mutateAsync(item.id)}
                        loading={markRead.isPending}
                      >
                        <Check size={16} /> Mark read
                      </Button>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-6">{item.body}</p>
                  {item.caseId ? (
                    <Link
                      href={`/cases/${item.caseId}`}
                      className="mt-3 inline-flex text-sm font-semibold text-blue underline underline-offset-4"
                    >
                      Open case
                    </Link>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
