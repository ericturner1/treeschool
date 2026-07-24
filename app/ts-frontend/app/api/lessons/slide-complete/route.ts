import { NextResponse } from "next/server";
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

  try {
    const result = await markLessonSlideCompleted({
      profileId: payload.profileId,
      lessonId: payload.lessonId,
      slideId: payload.slideId
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mark lesson slide complete." },
      { status: 500 }
    );
  }
}
