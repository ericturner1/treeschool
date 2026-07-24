import { NextResponse } from "next/server";
import { preparePlanPackUploads } from "../../../../../lib/plan-pack/server";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await preparePlanPackUploads(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare uploads." }, { status: 400 });
  }
}
