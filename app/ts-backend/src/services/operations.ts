import { env } from "../db";

export async function notifyOperationsFailure(input: {
  kind: string;
  message: string;
  identifiers?: Record<string, string | number | null>;
}) {
  const payload = {
    service: "ts-backend",
    severity: "error",
    timestamp: new Date().toISOString(),
    ...input
  };

  console.error("Treeschool operation needs attention", payload);
  if (!env.ADMIN_ALERT_WEBHOOK_URL) return;

  await fetch(env.ADMIN_ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).catch((error) => console.error("Could not deliver operations alert", error));
}
