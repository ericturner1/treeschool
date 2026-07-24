import { backendFetch } from "../../../../lib/backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

export async function POST(request: Request) {
  const response = await backendFetch(`${getBackendUrl()}/internal/billing/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      "stripe-signature": request.headers.get("stripe-signature") ?? ""
    },
    body: await request.text(),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null);

  return Response.json(payload ?? {}, {
    status: response.status
  });
}
