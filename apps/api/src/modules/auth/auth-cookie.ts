import { type ConfigService } from "@nestjs/config";
import { type CookieOptions } from "express";

import { type EnvironmentConfig } from "@recourse/config";

export function getRefreshCookieOptions(
  config: ConfigService<EnvironmentConfig>,
): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    maxAge: durationToMilliseconds(config.get("JWT_REFRESH_TTL") ?? "30d"),
    path: config.get("AUTH_COOKIE_PATH") ?? "/api/v1/auth",
    sameSite: config.get("AUTH_COOKIE_SAME_SITE") ?? "lax",
    secure: config.get("AUTH_COOKIE_SECURE") ?? false,
  };
  const domain = config.get("AUTH_COOKIE_DOMAIN");

  if (domain) {
    options.domain = domain;
  }

  return options;
}

export function getRefreshCookieName(
  config: ConfigService<EnvironmentConfig>,
): string {
  return config.get("AUTH_COOKIE_NAME") ?? "recourse_refresh";
}

function durationToMilliseconds(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration: ${duration}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === "d"
      ? 86400000
      : unit === "h"
        ? 3600000
        : unit === "m"
          ? 60000
          : 1000;
  return amount * multiplier;
}
