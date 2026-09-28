import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

async function requireJson<T>(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? fallback);
  return payload as T;
}

export function getMobileMembership(userId: string) {
  return backendFetch(
    `${getBackendUrl()}/internal/billing/apple/membership?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  ).then((response) => requireJson<Record<string, unknown>>(
    response,
    "Could not load the App Store membership."
  ));
}

export function verifyMobileApplePurchase(input: { userId: string; signedTransaction: string }) {
  return backendFetch(`${getBackendUrl()}/internal/billing/apple/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  }).then((response) => requireJson<Record<string, unknown>>(
    response,
    "Could not verify this App Store purchase."
  ));
}

export function forwardAppleSubscriptionNotification(signedPayload: string) {
  return backendFetch(`${getBackendUrl()}/internal/billing/apple-notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedPayload }),
    cache: "no-store"
  }).then((response) => requireJson<Record<string, unknown>>(
    response,
    "Could not process the App Store notification."
  ));
}
