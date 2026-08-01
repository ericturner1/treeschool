export const AUTH_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
export const AUTH_SESSION_IDLE_TIMEOUT_SECONDS = 60 * 60 * 24 * 30;
export const AUTH_SESSION_ACTIVITY_COOKIE_NAME = "treeschool_last_activity";
export const AUTH_SESSION_TRACE_COOKIE_NAME = "treeschool_session_trace";
export const AUTH_SESSION_RENEWAL_RETRY_LIMIT = 1;

export function createAuthSessionTraceId() {
  return globalThis.crypto.randomUUID();
}

export function hasAuthSessionGoneIdle(
  lastActivitySeconds: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!lastActivitySeconds) return false;

  const parsed = Number(lastActivitySeconds);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > nowSeconds) return false;

  return nowSeconds - parsed >= AUTH_SESSION_IDLE_TIMEOUT_SECONDS;
}
