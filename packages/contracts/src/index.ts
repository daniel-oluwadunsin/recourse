import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "CONFLICT",
  "FORBIDDEN",
  "TOO_MANY_REQUESTS",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string(),
  checks: z.record(z.string(), z.literal("ok")),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
