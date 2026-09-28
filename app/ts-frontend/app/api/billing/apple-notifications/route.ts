import { forwardAppleSubscriptionNotification } from "../../../../lib/mobile/apple-subscriptions";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { signedPayload?: string } | null;
  if (!body?.signedPayload) {
    return Response.json({ error: "signedPayload is required." }, { status: 400 });
  }
  try {
    return Response.json(await forwardAppleSubscriptionNotification(body.signedPayload));
  } catch {
    return Response.json({ error: "Could not process the App Store notification." }, { status: 400 });
  }
}
