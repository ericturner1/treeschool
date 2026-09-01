import type { HouseholdProfile } from "../accounts/server";
import type { PaperPlan } from "../paper-plans/server";

export function buildMobileHomePayload(input: {
  students: HouseholdProfile[];
  selectedProfileId: string;
  plan: PaperPlan;
}) {
  const nextWeek = input.plan.weeks.find(
    (week) => week.status !== "completed" && week.status !== "skipped",
  );

  return {
    students: input.students.map((student) => ({
      id: student.id,
      firstName: student.firstName,
    })),
    selectedProfileId: input.selectedProfileId,
    nextWeek: nextWeek
      ? {
          id: nextWeek.id,
          weekNumber: nextWeek.weekNumber,
          title: nextWeek.title,
          downloaded: nextWeek.downloaded,
        }
      : null,
  };
}
