import { NextResponse } from "next/server";
import { recordPublicFunnelEvent } from "../../../../lib/funnels/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await recordPublicFunnelEvent(body as Record<string, unknown>);
    return NextResponse.json({ recorded: true });
  } catch {
    return NextResponse.json(
      { error: "Could not record funnel activity." },
      { status: 400 }
    );
  }
}
