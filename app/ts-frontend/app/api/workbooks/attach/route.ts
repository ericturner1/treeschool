import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { publicErrorMessage } from "../../../../lib/security/request-guards";
import { attachNativeWorkbook } from "../../../../lib/native-workbooks/server";
import { attachPlanPackNativeWorkbook } from "../../../../lib/plan-pack/server";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      workbookId?: string;
      learningYearId?: string;
      intakeId?: string;
      checkoutSessionId?: string;
    };
    if (!body.workbookId) return NextResponse.json({ error: "workbookId is required." }, { status: 400 });
    if (body.intakeId && body.checkoutSessionId) {
      return NextResponse.json(await attachPlanPackNativeWorkbook({
        intakeId: body.intakeId,
        checkoutSessionId: body.checkoutSessionId,
        workbookId: body.workbookId
      }));
    }
    const user = await getCurrentUser();
    if (!user?.id || !body.learningYearId) {
      return NextResponse.json({ error: "Sign in and choose a learning year before adding this workbook." }, { status: 401 });
    }
    return NextResponse.json(await attachNativeWorkbook({
      userId: user.id,
      workbookId: body.workbookId,
      learningYearId: body.learningYearId
    }));
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, "Could not add the workbook.") }, { status: 400 });
  }
}
