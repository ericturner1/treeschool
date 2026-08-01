import { z } from "zod";
import { authSessionDiagnostics } from "ts-db";
import { db } from "../db";

export const AUTH_SESSION_DIAGNOSTIC_EVENTS = [
  "idle_expired",
  "credentials_missing",
  "refresh_cookie_missing",
  "refresh_unavailable",
  "renewal_unavailable",
  "renewal_failed"
] as const;

const diagnosticSchema = z.object({
  traceId: z.string().uuid().optional().nullable(),
  event: z.enum(AUTH_SESSION_DIAGNOSTIC_EVENTS),
  reason: z.string().trim().max(100).optional().nullable(),
  path: z.string().trim().max(500).optional().nullable(),
  statusCode: z.number().int().min(0).max(599).optional().nullable(),
  metadata: z.record(
    z.union([z.string().max(200), z.number(), z.boolean(), z.null()])
  ).optional().default({})
});

export async function recordAuthSessionDiagnostic(input: unknown) {
  const parsed = diagnosticSchema.parse(input);

  await db.insert(authSessionDiagnostics).values({
    traceId: parsed.traceId ?? null,
    event: parsed.event,
    reason: parsed.reason ?? null,
    path: parsed.path ?? null,
    statusCode: parsed.statusCode ?? null,
    metadataJson: parsed.metadata
  });

  return { recorded: true };
}
