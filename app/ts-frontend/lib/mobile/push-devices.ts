import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";
const getBackendUrl = () => process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;

export type MobilePushDeviceInput = {
  userId: string;
  token: string;
  environment: "sandbox" | "production";
  bundleId: string;
};

async function pushDeviceRequest(method: "POST" | "DELETE", input: MobilePushDeviceInput) {
  const response = await backendFetch(`${getBackendUrl()}/internal/mobile/push-devices`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? "Could not update notification settings for this phone.");
  }
  return payload as { registered?: boolean; unregistered?: boolean };
}

export function registerMobilePushDevice(input: MobilePushDeviceInput) {
  return pushDeviceRequest("POST", input);
}

export function unregisterMobilePushDevice(input: MobilePushDeviceInput) {
  return pushDeviceRequest("DELETE", input);
}
