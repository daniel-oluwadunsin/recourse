import { getEnvironment } from "@recourse/config";

type RateLimitConfigKey =
  | "API_RATE_LIMIT_LIMIT"
  | "API_RATE_LIMIT_TTL_MS"
  | "AUTH_SIGN_IN_RATE_LIMIT"
  | "AUTH_SIGN_UP_RATE_LIMIT"
  | "AUTH_REFRESH_RATE_LIMIT"
  | "ACCOUNT_DELETION_RATE_LIMIT"
  | "UPLOAD_RATE_LIMIT"
  | "CASE_CREATE_RATE_LIMIT";

let cachedEnvironment: ReturnType<typeof getEnvironment> | undefined;

/**
 * Throttler metadata is declared at module load time, while the typed Nest
 * configuration is resolved by DI. A lazy typed read keeps route limits
 * configurable without reading process.env in controllers.
 */
export function configuredRateLimit(key: RateLimitConfigKey): number {
  cachedEnvironment ??= getEnvironment();
  return cachedEnvironment[key];
}
