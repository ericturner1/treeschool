import { NextRequest, NextResponse } from "next/server";
import { decideManagedFunnelOneClickOffer } from "../../../../lib/billing/server";

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
  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
  try {
    return NextResponse.json(await decideManagedFunnelOneClickOffer({
      sourceCheckoutSessionId,
      funnelStepId,
      appBaseUrl,
      cancelPath: safeLocalPath(body?.currentPath)
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add this offer." },
      { status: 400 }
    );
  }
}
