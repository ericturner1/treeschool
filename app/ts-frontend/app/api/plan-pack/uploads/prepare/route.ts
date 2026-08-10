import { NextResponse } from "next/server";
import { preparePlanPackUploads } from "../../../../../lib/plan-pack/server";
import { publicErrorMessage } from "../../../../../lib/security/request-guards";

export async function POST(request: Request) {
  try {
    return NextResponse.json(await preparePlanPackUploads(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Could not prepare uploads.") }, { status: 400 });
  }
}
