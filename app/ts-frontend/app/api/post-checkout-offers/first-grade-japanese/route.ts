import { NextRequest, NextResponse } from "next/server";
import { decideFirstGradePostCheckoutOffer } from "../../../../lib/billing/server";

const ACTIONS = new Set([
  "accept_full",
  "decline_full",
  "accept_starter",
  "decline_starter"
]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    sourceCheckoutSessionId?: string;
    action?: "accept_full" | "decline_full" | "accept_starter" | "decline_starter";
  } | null;
  if (
    !body?.sourceCheckoutSessionId ||
    !body.action ||
    !ACTIONS.has(body.action)
  ) {
    return NextResponse.json({ error: "A valid offer decision is required." }, { status: 400 });
  }

  const origin = request.nextUrl.origin;
  const stage = body.action.includes("starter") ? "ds" : "us";
  try {
    const result = await decideFirstGradePostCheckoutOffer({
      sourceCheckoutSessionId: body.sourceCheckoutSessionId,
      action: body.action,
      successUrl: `${origin}/offers/${stage}/first-grade-japanese/complete?source_session_id=${encodeURIComponent(body.sourceCheckoutSessionId)}&upsell_session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/offers/${stage}/first-grade-japanese?session_id=${encodeURIComponent(body.sourceCheckoutSessionId)}&checkout=canceled`
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "We couldn’t update this offer. Your original purchase is safe—please try again or continue without it." },
      { status: 400 }
    );
  }
}
