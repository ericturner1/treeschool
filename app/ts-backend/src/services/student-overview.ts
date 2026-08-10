import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  attendanceEntries,
  attendanceEntrySubjects,
  contentDocuments,
  learningYears,
  weeklyPlanDayPdfAssets,
  weeklyPlanDaySubjectGrades,
  weeklyPlanDownloadEvents,
  weeklyPlanItems,
  weeklyPlanJobs,
  weeklyPlanPdfAssets,
  weeklyPlans,
  weeklyPlanSubjectGrades
} from "ts-db";
import { db } from "../db";
import { getManageableStudentProfile } from "./accounts";
import { getPremiumFeatureAccess } from "./entitlements";
import { averageWithExtraCredit } from "./grade-average";
import { translateScoreToGrade } from "./grades";
import { planSubjectKey } from "./plan-subject-key";
import { calculateSchoolYearPacing } from "./school-year-pacing";
import {
  continuingWeekAction,
  shouldPromptForWeeklyPlanDownload
} from "./student-overview-next-action";

const DAY_MS = 86_400_000;

function daysSince(date: string) {
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const attendanceUtc = Date.parse(`${date}T00:00:00.000Z`);
  return Math.max(0, Math.floor((todayUtc - attendanceUtc) / DAY_MS));
}

export async function getStudentOverviewMetrics(input: {
  parentUserId: string;
  profileId: string;
}) {
  const [{ studentProfile }, featureAccess] = await Promise.all([
    getManageableStudentProfile(input.parentUserId, input.profileId),
    getPremiumFeatureAccess(input.parentUserId)
  ]);

  const [learningYear] = await db
    .select({
      id: learningYears.id,
      title: learningYears.title,
      teachingDaysPerWeek: learningYears.teachingDaysPerWeek,
      startDate: learningYears.startDate,
      endDate: learningYears.endDate,
      materialsUpdatedAt: learningYears.materialsUpdatedAt,
      lastPlannedAt: learningYears.lastPlannedAt
    })
    .from(learningYears)
    .where(eq(learningYears.profileId, input.profileId))
    .orderBy(desc(learningYears.startDate), desc(learningYears.createdAt))
    .limit(1);

  if (!learningYear) {
    return {
      premiumAccess: featureAccess.allowed,
      learningProfile: {
        notes: studentProfile.learningProfileNotes,
        subjectStrengths: studentProfile.subjectStrengths,
        updatedAt: studentProfile.learningProfileUpdatedAt?.toISOString() ?? null
      },
      learningYear: null,
      hasLessonPlan: false,
      planProgressPercent: null,
      pacing: null,
      scheduledDayCount: 0,
      overallGrade: null,
      lastAttendance: null,
      nextAction: featureAccess.allowed
        ? {
            kind: "setup" as const,
            label: "Set up your lesson plan",
            description: "Choose Treeschool workbooks or add curriculum you already own.",
            href: `/p/student/${studentProfile.slug ?? input.profileId}/lesson-plan`
          }
        : {
            kind: "upgrade" as const,
            label: "View membership plans",
            description: "Create and manage a complete lesson plan for this student.",
            href: "/pricing"
          }
    };
  }

  const [weeks, documents, planningJobs] = await Promise.all([
    db
      .select({
        id: weeklyPlans.id,
        weekNumber: weeklyPlans.weekNumber,
        status: weeklyPlans.status
      })
      .from(weeklyPlans)
      .where(eq(weeklyPlans.learningYearId, learningYear.id))
      .orderBy(asc(weeklyPlans.weekNumber)),
    db
      .select({
        id: contentDocuments.id,
        analysisStatus: contentDocuments.analysisStatus
      })
      .from(contentDocuments)
      .where(and(
        eq(contentDocuments.learningYearId, learningYear.id),
        isNull(contentDocuments.removedAt)
      )),
    db
      .select({ status: weeklyPlanJobs.status })
      .from(weeklyPlanJobs)
      .where(eq(weeklyPlanJobs.learningYearId, learningYear.id))
  ]);
  const weekIds = weeks.map((week) => week.id);
  const hasLessonPlan = weekIds.length > 0;

  const [
    planItems,
    planAttendance,
    dayGrades,
    legacyGrades,
    lastAttendanceRow,
    weekPdfAssets,
    dayPdfAssets,
    downloadEvents,
    extraCreditRows
  ] = await Promise.all([
    !featureAccess.allowed || weekIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            weeklyPlanId: weeklyPlanItems.weeklyPlanId,
            dayNumber: weeklyPlanItems.dayNumber,
            subjectId: contentDocuments.subjectId,
            subjectLabel: contentDocuments.subjectLabel
          })
          .from(weeklyPlanItems)
          .innerJoin(contentDocuments, eq(contentDocuments.id, weeklyPlanItems.documentId))
          .where(and(
            inArray(weeklyPlanItems.weeklyPlanId, weekIds),
            eq(weeklyPlanItems.includedInPacket, true)
          )),
    !featureAccess.allowed || weekIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            id: attendanceEntries.id,
            weeklyPlanId: attendanceEntries.weeklyPlanId,
            dayNumber: attendanceEntries.weeklyPlanDayNumber
          })
          .from(attendanceEntries)
          .where(and(
            eq(attendanceEntries.profileId, input.profileId),
            eq(attendanceEntries.entryKind, "plan_day"),
            inArray(attendanceEntries.weeklyPlanId, weekIds)
          )),
    !featureAccess.allowed || weekIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            weeklyPlanId: weeklyPlanDaySubjectGrades.weeklyPlanId,
            subjectKey: weeklyPlanDaySubjectGrades.subjectKey,
            score: weeklyPlanDaySubjectGrades.score
          })
          .from(weeklyPlanDaySubjectGrades)
          .where(inArray(weeklyPlanDaySubjectGrades.weeklyPlanId, weekIds)),
    weekIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            weeklyPlanId: weeklyPlanSubjectGrades.weeklyPlanId,
            subjectKey: weeklyPlanSubjectGrades.subjectKey,
            score: weeklyPlanSubjectGrades.grade
          })
          .from(weeklyPlanSubjectGrades)
          .where(inArray(weeklyPlanSubjectGrades.weeklyPlanId, weekIds)),
    featureAccess.allowed
      ? db
          .select({ attendanceDate: attendanceEntries.attendanceDate })
          .from(attendanceEntries)
          .where(eq(attendanceEntries.profileId, input.profileId))
          .orderBy(desc(attendanceEntries.attendanceDate), desc(attendanceEntries.createdAt))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    weekIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ weeklyPlanId: weeklyPlanPdfAssets.weeklyPlanId })
          .from(weeklyPlanPdfAssets)
          .where(inArray(weeklyPlanPdfAssets.weeklyPlanId, weekIds)),
    weekIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ weeklyPlanId: weeklyPlanDayPdfAssets.weeklyPlanId })
          .from(weeklyPlanDayPdfAssets)
          .where(inArray(weeklyPlanDayPdfAssets.weeklyPlanId, weekIds)),
    weekIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ weeklyPlanId: weeklyPlanDownloadEvents.weeklyPlanId })
          .from(weeklyPlanDownloadEvents)
          .where(inArray(weeklyPlanDownloadEvents.weeklyPlanId, weekIds)),
    !featureAccess.allowed
      ? Promise.resolve([])
      : db
          .select({ points: attendanceEntries.extraCreditPoints })
          .from(attendanceEntries)
          .where(and(
            eq(attendanceEntries.profileId, input.profileId),
            eq(attendanceEntries.learningYearId, learningYear.id),
            eq(attendanceEntries.entryKind, "manual")
          ))
  ]);

  const attendanceSubjects = planAttendance.length === 0
    ? []
    : await db
        .select({
          attendanceEntryId: attendanceEntrySubjects.attendanceEntryId,
          subjectKey: attendanceEntrySubjects.subjectKey
        })
        .from(attendanceEntrySubjects)
        .where(inArray(attendanceEntrySubjects.attendanceEntryId, planAttendance.map((entry) => entry.id)));

  const scheduledSubjectsByDay = new Map<string, Set<string>>();
  for (const item of planItems) {
    if (item.dayNumber == null) continue;
    const dayKey = `${item.weeklyPlanId}:${item.dayNumber}`;
    const subjects = scheduledSubjectsByDay.get(dayKey) ?? new Set<string>();
    subjects.add(planSubjectKey({ subjectId: item.subjectId, subjectLabel: item.subjectLabel }));
    scheduledSubjectsByDay.set(dayKey, subjects);
  }

  const attendanceById = new Map(planAttendance.map((entry) => [entry.id, entry]));
  const attendedSubjectsByDay = new Map<string, Set<string>>();
  for (const subject of attendanceSubjects) {
    const attendance = attendanceById.get(subject.attendanceEntryId);
    if (!attendance?.weeklyPlanId || attendance.dayNumber == null) continue;
    const dayKey = `${attendance.weeklyPlanId}:${attendance.dayNumber}`;
    const subjects = attendedSubjectsByDay.get(dayKey) ?? new Set<string>();
    subjects.add(subject.subjectKey);
    attendedSubjectsByDay.set(dayKey, subjects);
  }

  const dayProgressValues = Array.from(scheduledSubjectsByDay.entries()).map(([dayKey, scheduledSubjects]) => {
    const attendedSubjects = attendedSubjectsByDay.get(dayKey) ?? new Set<string>();
    const completedSubjects = Array.from(scheduledSubjects).filter((subjectKey) => attendedSubjects.has(subjectKey)).length;
    if (completedSubjects === scheduledSubjects.size) return 100;
    return Math.min(Math.round((completedSubjects / scheduledSubjects.size) * 100), 90);
  });
  const planProgressPercent = dayProgressValues.length === 0
    ? 0
    : Math.round(dayProgressValues.reduce((sum, value) => sum + value, 0) / dayProgressValues.length);
  const completedTeachingDayCount = dayProgressValues.filter((value) => value === 100).length;
  const pacing = featureAccess.allowed && hasLessonPlan
    ? calculateSchoolYearPacing({
        startDate: learningYear.startDate?.toISOString().slice(0, 10) ?? null,
        endDate: learningYear.endDate?.toISOString().slice(0, 10) ?? null,
        scheduledTeachingDays: dayProgressValues.length,
        completedTeachingDays: completedTeachingDayCount,
        teachingDaysPerWeek: learningYear.teachingDaysPerWeek ?? 5
      })
    : null;

  const dayProgressByWeekId = new Map<string, number[]>();
  for (const [dayKey, scheduledSubjects] of scheduledSubjectsByDay.entries()) {
    const separatorIndex = dayKey.lastIndexOf(":");
    const weeklyPlanId = dayKey.slice(0, separatorIndex);
    const attendedSubjects = attendedSubjectsByDay.get(dayKey) ?? new Set<string>();
    const completedSubjects = Array.from(scheduledSubjects).filter((subjectKey) => attendedSubjects.has(subjectKey)).length;
    const progress = completedSubjects === scheduledSubjects.size
      ? 100
      : Math.min(Math.round((completedSubjects / scheduledSubjects.size) * 100), 90);
    const weekProgress = dayProgressByWeekId.get(weeklyPlanId) ?? [];
    weekProgress.push(progress);
    dayProgressByWeekId.set(weeklyPlanId, weekProgress);
  }
  const planItemWeekIds = new Set(planItems.map((item) => item.weeklyPlanId));
  const nextWeek = weeks.find((week) => {
    if (!planItemWeekIds.has(week.id)) return false;
    const progressValues = dayProgressByWeekId.get(week.id) ?? [];
    const progress = progressValues.length === 0
      ? week.status === "completed" ? 100 : 0
      : Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length);
    return progress < 100;
  }) ?? null;
  const nextWeekProgressValues = nextWeek ? dayProgressByWeekId.get(nextWeek.id) ?? [] : [];
  const nextWeekProgress = nextWeekProgressValues.length === 0
    ? 0
    : Math.round(nextWeekProgressValues.reduce((sum, value) => sum + value, 0) / nextWeekProgressValues.length);
  const downloadedWeekIds = new Set([
    ...downloadEvents.map((event) => event.weeklyPlanId),
    ...weekPdfAssets.map((asset) => asset.weeklyPlanId),
    ...dayPdfAssets.map((asset) => asset.weeklyPlanId)
  ]);
  const documentsProcessing = documents.some((document) =>
    ["queued", "pending", "analyzing"].includes(document.analysisStatus)
  );
  const planningActive = planningJobs.some((job) =>
    ["queued", "retry_wait", "running", "quality_check"].includes(job.status)
  );
  const planningFailed = planningJobs.some((job) => job.status === "failed");
  const materialsChanged = Boolean(
    learningYear.lastPlannedAt &&
      learningYear.materialsUpdatedAt.getTime() > learningYear.lastPlannedAt.getTime()
  );

  let nextAction: {
    kind: "setup" | "planning" | "repair" | "update" | "download" | "attendance" | "complete" | "upgrade";
    label: string;
    description: string;
    href: string;
  };
  const lessonPlanHref = `/p/student/${studentProfile.slug ?? input.profileId}/lesson-plan`;
  if (!featureAccess.allowed) {
    nextAction = hasLessonPlan && weeks[0]
      ? {
          kind: "download",
          label: `Download Week ${weeks[0].weekNumber} lesson plan`,
          description: "Your printable lesson plan is ready whenever you need it.",
          href: `${lessonPlanHref}#week-${weeks[0].weekNumber}`
        }
      : {
          kind: "upgrade",
          label: "View membership plans",
          description: "Unlock live lesson planning, grades, attendance, and progress.",
          href: "/pricing"
        };
  } else if (documents.length === 0 && !hasLessonPlan) {
    nextAction = {
      kind: "setup",
      label: "Set up your lesson plan",
      description: "Choose Treeschool workbooks or add curriculum you already own.",
      href: lessonPlanHref
    };
  } else if (documentsProcessing) {
    nextAction = {
      kind: "setup",
      label: "Finish setting up your lesson plan",
      description: "Your teaching materials are being prepared. Check their progress.",
      href: lessonPlanHref
    };
  } else if (planningActive) {
    nextAction = {
      kind: "planning",
      label: "Check your lesson plan progress",
      description: "Treeschool is building and reviewing your weekly plans.",
      href: lessonPlanHref
    };
  } else if (planningFailed) {
    nextAction = {
      kind: "repair",
      label: "Finish creating your lesson plan",
      description: "One or more planning steps need your attention.",
      href: lessonPlanHref
    };
  } else if (!hasLessonPlan) {
    nextAction = {
      kind: "setup",
      label: "Finish setting up your lesson plan",
      description: "Review your curriculum and create the weekly plan.",
      href: lessonPlanHref
    };
  } else if (materialsChanged) {
    nextAction = {
      kind: "update",
      label: "Update your lesson plan",
      description: "Your teaching materials changed since this plan was created.",
      href: lessonPlanHref
    };
  } else if (nextWeek && shouldPromptForWeeklyPlanDownload({
    weekStatus: nextWeek.status,
    progressPercent: nextWeekProgress,
    hasDownloadRecord: downloadedWeekIds.has(nextWeek.id)
  })) {
    nextAction = {
      kind: "download",
      label: `Download Week ${nextWeek.weekNumber} lesson plan`,
      description: "Get the next printable week ready before teaching begins.",
      href: `${lessonPlanHref}#week-${nextWeek.weekNumber}`
    };
  } else if (nextWeek) {
    const continuingAction = continuingWeekAction({
      weekNumber: nextWeek.weekNumber,
      progressPercent: nextWeekProgress
    });
    nextAction = {
      kind: "attendance",
      ...continuingAction,
      href: `${lessonPlanHref}#week-${nextWeek.weekNumber}`
    };
  } else {
    nextAction = {
      kind: "complete",
      label: "Review your completed lesson plan",
      description: "Every scheduled week in this learning year is complete.",
      href: lessonPlanHref
    };
  }

  const dayGradeKeys = new Set(dayGrades.map((grade) => `${grade.weeklyPlanId}:${grade.subjectKey}`));
  const gradeScores = [
    ...dayGrades.map((grade) => grade.score),
    ...legacyGrades
      .filter((grade) => grade.score != null && !dayGradeKeys.has(`${grade.weeklyPlanId}:${grade.subjectKey}`))
      .map((grade) => grade.score as number)
  ];
  const extraCreditPoints = extraCreditRows
    .map((row) => row.points)
    .filter((points): points is number => points != null);
  const gradeAverage = averageWithExtraCredit(gradeScores, extraCreditPoints);

  return {
    premiumAccess: featureAccess.allowed,
    learningProfile: {
      notes: studentProfile.learningProfileNotes,
      subjectStrengths: studentProfile.subjectStrengths,
      updatedAt: studentProfile.learningProfileUpdatedAt?.toISOString() ?? null
    },
    learningYear: {
      id: learningYear.id,
      title: learningYear.title,
      startDate: learningYear.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: learningYear.endDate?.toISOString().slice(0, 10) ?? null
    },
    hasLessonPlan,
    planProgressPercent: featureAccess.allowed && hasLessonPlan ? planProgressPercent : null,
    pacing,
    scheduledDayCount: dayProgressValues.length,
    overallGrade: featureAccess.allowed ? {
      average: gradeAverage,
      letter: gradeAverage == null
        ? null
        : translateScoreToGrade(studentProfile.gradingScheme, gradeAverage),
      gradedEntries: gradeScores.length + extraCreditPoints.length
    } : null,
    lastAttendance: featureAccess.allowed && lastAttendanceRow
      ? {
          date: lastAttendanceRow.attendanceDate,
          daysSince: daysSince(lastAttendanceRow.attendanceDate)
        }
      : null,
    nextAction
  };
}
