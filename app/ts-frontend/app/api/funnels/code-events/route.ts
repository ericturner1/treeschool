import { NextResponse } from "next/server";
import { recordPublicCodeFunnelEvent } from "../../../../lib/funnels/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await recordPublicCodeFunnelEvent(body as Record<string, unknown>);
    return NextResponse.json({ recorded: true });
  } catch {
    return NextResponse.json(
      { error: "Could not record funnel activity." },
      { status: 400 }
    );
  }
}
