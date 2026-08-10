import { NextRequest, NextResponse } from "next/server";
import { decideManagedFunnelOneClickOffer } from "../../../../lib/billing/server";
import { getPublicAppOrigin } from "../../../../lib/security/public-origin";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

function safeLocalPath(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value.slice(0, 500)
    : "/";
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sourceCheckoutSessionId = typeof body?.sourceCheckoutSessionId === "string"
    ? body.sourceCheckoutSessionId.trim()
    : "";
  const funnelStepId = typeof body?.funnelStepId === "string" ? body.funnelStepId.trim() : "";
  if (!sourceCheckoutSessionId || !funnelStepId) {
    return NextResponse.json({ error: "This offer link is incomplete." }, { status: 400 });
  }
  const appBaseUrl = getPublicAppOrigin(request.nextUrl);
  try {
    return NextResponse.json(await decideManagedFunnelOneClickOffer({
      sourceCheckoutSessionId,
      funnelStepId,
      appBaseUrl,
      cancelPath: safeLocalPath(body?.currentPath)
    }));
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not add this offer.") },
      { status: 400 }
    );
  }
}
