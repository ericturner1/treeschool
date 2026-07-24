import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth/server";
import { setLessonDisposition } from "../../../../lib/paper-plans/server";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser?.id) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const body = (await request.json()) as {
    weeklyPlanItemId?: string;
    disposition?: "include" | "already_mastered" | "save_for_later" | "remove";
  };
  if (!body.weeklyPlanItemId || !body.disposition) {
    return NextResponse.json(
      { error: "weeklyPlanItemId and disposition are required." },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await setLessonDisposition({
      parentUserId: currentUser.id,
      weeklyPlanItemId: body.weeklyPlanItemId,
      disposition: body.disposition
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the lesson." },
      { status: 400 }
    );
  }
}
