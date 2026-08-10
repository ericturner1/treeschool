import { NextResponse } from "next/server";
import {
  approvePlanPackCurriculum,
  evaluatePlanPackCurriculum
} from "../../../../lib/plan-pack/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      intakeId?: string;
      checkoutSessionId?: string;
      action?: "evaluate" | "approve";
    };
    if (!body.intakeId || !body.checkoutSessionId) {
      return NextResponse.json({ error: "Missing plan-pack details." }, { status: 400 });
    }
    const input = { intakeId: body.intakeId, checkoutSessionId: body.checkoutSessionId };
    return NextResponse.json(
      body.action === "approve"
        ? await approvePlanPackCurriculum(input)
        : await evaluatePlanPackCurriculum(input)
    );
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Could not review the curriculum.") },
      { status: 400 }
    );
  }
}
