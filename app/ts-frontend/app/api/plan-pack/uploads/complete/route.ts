import { NextResponse } from "next/server";
import { completePlanPackStagedUpload } from "../../../../../lib/plan-pack/server";
import { publicErrorMessage } from "../../../../../lib/security/request-guards";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await completePlanPackStagedUpload(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Could not complete uploads.") }, { status: 400 });
  }
}
