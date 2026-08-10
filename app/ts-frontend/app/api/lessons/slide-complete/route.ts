import { NextResponse } from "next/server";
import { getCurrentStudentAccess } from "../../../../lib/auth/student-access";
import { markLessonSlideCompleted } from "../../../../lib/lessons/server";

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    profileId?: string;
    lessonId?: string;
    slideId?: string;
  };

  if (!payload.profileId || !payload.lessonId || !payload.slideId) {
    return NextResponse.json({ error: "profileId, lessonId, and slideId are required." }, { status: 400 });
  }

  const access = await getCurrentStudentAccess(payload.profileId);
  if (!access) {
    return NextResponse.json({ error: "Unauthorized student profile." }, { status: 401 });
  }

  try {
    const result = await markLessonSlideCompleted({
      profileId: access.student.id,
      lessonId: payload.lessonId,
      slideId: payload.slideId
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to mark lesson slide complete." },
      { status: 400 }
    );
  }
}
