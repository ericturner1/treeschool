import { NextResponse } from "next/server";
import { capturePublicFunnelLead } from "../../../../lib/funnels/server";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await capturePublicFunnelLead(await request.json()));
  } catch {
    return NextResponse.json(
      { error: "We couldn’t save your details. Please try again." },
      { status: 400 }
    );
  }
}
