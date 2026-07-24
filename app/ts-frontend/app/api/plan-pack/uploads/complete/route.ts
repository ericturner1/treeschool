import { NextResponse } from "next/server";
import { completePlanPackStagedUpload } from "../../../../../lib/plan-pack/server";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await completePlanPackStagedUpload(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not complete uploads." }, { status: 400 });
  }
}
