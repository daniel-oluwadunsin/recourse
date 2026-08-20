import * as Sentry from "@sentry/node";

import { parseEnvironment } from "@recourse/config";

const config = parseEnvironment();

if (config.SENTRY_DSN) {
  Sentry.init({
    beforeSend(event) {
      // Sentry is useful for failures, but it must not become a private-data
      // export. Keep only bounded request metadata and no user/cookie/body data.
      if (event.request) {
        event.request = {
          method: event.request.method,
          url: safeUrl(event.request.url),
        };
      }
      delete event.user;
      delete event.extra;
      delete event.breadcrumbs;
      return event;
    },
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT,
    release: config.SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
  });
}

export function captureServerException(
  exception: unknown,
  tags: Record<string, string> = {},
): void {
  if (!config.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) scope.setTag(key, value);
    Sentry.captureException(
      exception instanceof Error
        ? exception
        : new Error("Unhandled server error"),
    );
  });
}

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}
