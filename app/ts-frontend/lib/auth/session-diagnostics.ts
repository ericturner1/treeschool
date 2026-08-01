export type AuthSessionDiagnosticEvent =
  | "idle_expired"
  | "credentials_missing"
  | "refresh_cookie_missing"
  | "refresh_unavailable"
  | "renewal_unavailable"
  | "renewal_failed";

export async function recordAuthSessionDiagnostic(input: {
  traceId?: string | null;
  event: AuthSessionDiagnosticEvent;
  reason?: string | null;
  path?: string | null;
  statusCode?: number | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const backendUrl = process.env.INTERNAL_BACKEND_URL;
  const secret = process.env.INTERNAL_API_SECRET;

  if (!backendUrl || !secret) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);

  try {
    await fetch(`${backendUrl.replace(/\/$/, "")}/internal/auth/session-diagnostic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-treeschool-internal-secret": secret
      },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: controller.signal
    });
  } catch {
    // Authentication must never fail because its diagnostics endpoint is down.
  } finally {
    clearTimeout(timeout);
  }
}
