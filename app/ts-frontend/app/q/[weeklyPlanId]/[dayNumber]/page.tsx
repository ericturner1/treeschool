import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../../lib/auth/server";
import { getPaperPlanQrDestination } from "../../../../lib/paper-plans/server";

type Props = {
  params: Promise<{ weeklyPlanId: string; dayNumber: string }>;
};

export default async function LessonPlanDayQrPage(props: Props) {
  const params = await props.params;
  const dayNumber = Number(params.dayNumber);
  const returnPath = `/q/${encodeURIComponent(params.weeklyPlanId)}/${encodeURIComponent(params.dayNumber)}`;
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect(`/signin?next=${encodeURIComponent(returnPath)}`);
  }
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 7) {
    redirect("/p/dashboard?error=This%20lesson-plan%20day%20link%20is%20invalid.");
  }

  try {
    const destination = await getPaperPlanQrDestination({
      parentUserId: user.id,
      weeklyPlanId: params.weeklyPlanId
    });
    const query = new URLSearchParams({
      weeklyPlanId: destination.weeklyPlanId,
      week: String(destination.weekNumber),
      day: String(dayNumber)
    });
    redirect(
      `/p/student/${destination.profileSlug ?? destination.profileId}/lesson-plan?${query.toString()}#week-${destination.weekNumber}-day-${dayNumber}`
    );
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/p/dashboard?error=This%20lesson-plan%20day%20could%20not%20be%20opened.");
  }
}
