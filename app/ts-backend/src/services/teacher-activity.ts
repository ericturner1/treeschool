import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  learningYears,
  profiles,
  teacherActivityEvents,
  users,
  weeklyPlanDaySubjectGrades,
  weeklyPlanDownloadEvents,
  weeklyPlans
} from "ts-db";
import { db } from "../db";
import {
  isLessonCompletionActivity,
  selectDistinctRecentActivityEvents,
  summarizeTeacherActivityEvents,
  type TeacherActivityEventType
} from "./teacher-activity-model";

const DAY_MS = 86_400_000;

function utcDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

async function accountMemberForUser(userId: string) {
  const [member] = await db.select({
    profileId: profiles.id,
    accountId: profiles.accountId,
    role: profiles.accountRole
  }).from(profiles).where(and(
    eq(profiles.userId, userId),
    eq(profiles.role, "PARENT")
  )).limit(1);
  if (!member) throw new Error("Account member not found.");
  return {
    ...member,
    role: member.role ?? "OWNER" as const
  };
}

export async function recordTeacherGradeActivity(input: {
  actorUserId: string;
  studentProfileId: string;
  weeklyPlanId: string;
  eventType: TeacherActivityEventType;
  subjectKey: string;
  subjectLabel: string;
  score: number | null;
  previousScore?: number | null;
  dayNumber: number;
  activityTitle?: string | null;
}) {
  const actor = await accountMemberForUser(input.actorUserId);
  const [student] = await db.select({ accountId: profiles.accountId })
    .from(profiles)
    .where(and(
      eq(profiles.id, input.studentProfileId),
      eq(profiles.role, "STUDENT")
    ))
    .limit(1);
  if (!student || student.accountId !== actor.accountId) {
    throw new Error("Student profile does not belong to this account.");
  }
  const [saved] = await db.insert(teacherActivityEvents).values({
    accountId: actor.accountId,
    actorUserId: input.actorUserId,
    actorProfileId: actor.profileId,
    studentProfileId: input.studentProfileId,
    weeklyPlanId: input.weeklyPlanId,
    eventType: input.eventType,
    subjectKey: input.subjectKey,
    subjectLabel: input.subjectLabel,
    score: input.score,
    metadata: {
      dayNumber: input.dayNumber,
      previousScore: input.previousScore ?? null,
      activityTitle: input.activityTitle?.trim() || null
    }
  }).returning({ id: teacherActivityEvents.id });
  return saved!;
}

export async function getTeacherActivityDaysForMembers(input: {
  accountId: string;
  profileIds: string[];
  numberOfDays?: number;
}) {
  const numberOfDays = Math.max(7, Math.min(input.numberOfDays ?? 91, 366));
  const to = startOfUtcDay(new Date());
  const from = new Date(to.getTime() - (numberOfDays - 1) * DAY_MS);
  if (input.profileIds.length === 0) {
    return { dateFrom: utcDay(from), dateTo: utcDay(to), byProfileId: new Map<string, Array<{ date: string; count: number }>>() };
  }
  const rows = await db.select({
    profileId: teacherActivityEvents.actorProfileId,
    occurredAt: teacherActivityEvents.occurredAt
  }).from(teacherActivityEvents).where(and(
    eq(teacherActivityEvents.accountId, input.accountId),
    inArray(teacherActivityEvents.actorProfileId, input.profileIds),
    gte(teacherActivityEvents.occurredAt, from),
    lte(teacherActivityEvents.occurredAt, new Date(to.getTime() + DAY_MS - 1))
  ));
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.profileId) continue;
    const daily = counts.get(row.profileId) ?? new Map<string, number>();
    const day = utcDay(row.occurredAt);
    daily.set(day, (daily.get(day) ?? 0) + 1);
    counts.set(row.profileId, daily);
  }
  return {
    dateFrom: utcDay(from),
    dateTo: utcDay(to),
    byProfileId: new Map(Array.from(counts, ([profileId, daily]) => [
      profileId,
      Array.from(daily, ([date, count]) => ({ date, count })).sort((left, right) => left.date.localeCompare(right.date))
    ]))
  };
}

export async function getTeacherActivity(input: {
  requesterUserId: string;
  teacherProfileId: string;
}) {
  const requester = await accountMemberForUser(input.requesterUserId);
  const [teacher] = await db.select({
    profileId: profiles.id,
    userId: profiles.userId,
    name: profiles.firstName,
    email: users.email,
    role: profiles.accountRole
  }).from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(
      eq(profiles.id, input.teacherProfileId),
      eq(profiles.accountId, requester.accountId),
      eq(profiles.role, "PARENT")
    ))
    .limit(1);
  if (!teacher) throw new Error("Teacher not found.");

  const to = startOfUtcDay(new Date());
  const from = new Date(to.getTime() - 364 * DAY_MS);
  const events = await db.select().from(teacherActivityEvents).where(and(
    eq(teacherActivityEvents.accountId, requester.accountId),
    eq(teacherActivityEvents.actorProfileId, input.teacherProfileId),
    gte(teacherActivityEvents.occurredAt, from),
    lte(teacherActivityEvents.occurredAt, new Date(to.getTime() + DAY_MS - 1))
  )).orderBy(desc(teacherActivityEvents.occurredAt));

  const studentIds = Array.from(new Set(events.map((event) => event.studentProfileId).filter((id): id is string => Boolean(id))));
  const weekIds = Array.from(new Set(events.map((event) => event.weeklyPlanId).filter((id): id is string => Boolean(id))));
  const [students, weeks] = await Promise.all([
    studentIds.length === 0 ? [] : db.select({ id: profiles.id, name: profiles.firstName })
      .from(profiles).where(inArray(profiles.id, studentIds)),
    weekIds.length === 0 ? [] : db.select({ id: weeklyPlans.id, weekNumber: weeklyPlans.weekNumber })
      .from(weeklyPlans).where(inArray(weeklyPlans.id, weekIds))
  ]);
  const studentNames = new Map(students.map((student) => [student.id, student.name]));
  const weekNumbers = new Map(weeks.map((week) => [week.id, week.weekNumber]));
  const daily = new Map<string, number>();
  for (const event of events) {
    const day = utcDay(event.occurredAt);
    daily.set(day, (daily.get(day) ?? 0) + 1);
  }
  const activeDays = daily.size;
  const summary = summarizeTeacherActivityEvents(events);

  return {
    teacher: {
      profileId: teacher.profileId,
      userId: teacher.userId,
      name: teacher.name,
      email: teacher.email,
      role: teacher.role ?? "OWNER"
    },
    requesterRole: requester.role,
    canManageRole: requester.role === "OWNER"
      ? teacher.role !== "OWNER"
      : requester.role === "ADMIN" && teacher.role === "TEACHER",
    dateFrom: utcDay(from),
    dateTo: utcDay(to),
    days: Array.from(daily, ([date, count]) => ({ date, count })).sort((left, right) => left.date.localeCompare(right.date)),
    summary: {
      ...summary,
      activeDays
    },
    events: events.slice(0, 100).map((event) => ({
      id: event.id,
      eventType: event.eventType as TeacherActivityEventType,
      subjectLabel: event.subjectLabel,
      score: event.score,
      studentName: event.studentProfileId ? studentNames.get(event.studentProfileId) ?? null : null,
      weekNumber: event.weeklyPlanId ? weekNumbers.get(event.weeklyPlanId) ?? null : null,
      dayNumber: typeof event.metadata?.dayNumber === "number" ? event.metadata.dayNumber : null,
      activityTitle: typeof event.metadata?.activityTitle === "string" ? event.metadata.activityTitle : null,
      activityType: typeof event.metadata?.activityType === "string" ? event.metadata.activityType : null,
      attendanceDate: typeof event.metadata?.attendanceDate === "string" ? event.metadata.attendanceDate : null,
      minutes: typeof event.metadata?.minutes === "number" ? event.metadata.minutes : null,
      pointsAmount: typeof event.metadata?.pointsAmount === "number" ? event.metadata.pointsAmount : null,
      pointsReason: typeof event.metadata?.pointsReason === "string" ? event.metadata.pointsReason : null,
      pointSingularName: typeof event.metadata?.pointSingularName === "string" ? event.metadata.pointSingularName : null,
      pointPluralName: typeof event.metadata?.pointPluralName === "string" ? event.metadata.pointPluralName : null,
      occurredAt: event.occurredAt.toISOString()
    }))
  };
}

export async function getRecentAccountActivity(input: {
  requesterUserId: string;
  studentProfileId: string;
  limit?: number;
  includePdfDownloads?: boolean;
}) {
  const requester = await accountMemberForUser(input.requesterUserId);
  const [student] = await db.select({
    accountId: profiles.accountId,
    name: profiles.firstName
  }).from(profiles).where(and(
    eq(profiles.id, input.studentProfileId),
    eq(profiles.role, "STUDENT")
  )).limit(1);
  if (!student || student.accountId !== requester.accountId) {
    throw new Error("Student profile does not belong to this account.");
  }

  const limit = Math.max(1, Math.min(input.limit ?? 10, 10));
  const teacherCandidates = await db.select().from(teacherActivityEvents).where(and(
    eq(teacherActivityEvents.accountId, requester.accountId),
    eq(teacherActivityEvents.studentProfileId, input.studentProfileId),
    inArray(teacherActivityEvents.eventType, [
      "lesson_completed",
      "grade_saved",
      "points_awarded",
      "points_used"
    ])
  )).orderBy(desc(teacherActivityEvents.occurredAt)).limit(Math.max(50, limit * 5));
  const downloadRows = input.includePdfDownloads
    ? await db.select({
      id: weeklyPlanDownloadEvents.id,
      actorUserId: weeklyPlanDownloadEvents.downloadedByUserId,
      weeklyPlanId: weeklyPlanDownloadEvents.weeklyPlanId,
      format: weeklyPlanDownloadEvents.format,
      layout: weeklyPlanDownloadEvents.layout,
      occurredAt: weeklyPlanDownloadEvents.downloadedAt
    }).from(weeklyPlanDownloadEvents)
      .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanDownloadEvents.weeklyPlanId))
      .innerJoin(learningYears, eq(learningYears.id, weeklyPlans.learningYearId))
      .where(eq(learningYears.profileId, input.studentProfileId))
      .orderBy(desc(weeklyPlanDownloadEvents.downloadedAt))
      .limit(Math.max(50, limit * 5))
    : [];
  const downloadCandidates = downloadRows.map((event) => ({
    id: `week-pdf:${event.id}`,
    accountId: requester.accountId,
    actorUserId: event.actorUserId,
    actorProfileId: null,
    studentProfileId: input.studentProfileId,
    weeklyPlanId: event.weeklyPlanId,
    eventType: "week_pdf_downloaded",
    subjectKey: null,
    subjectLabel: null,
    score: null,
    metadata: {
      downloadEventId: event.id,
      format: event.format,
      layout: event.layout
    } as Record<string, unknown>,
    occurredAt: event.occurredAt
  }));
  const candidates = [...teacherCandidates, ...downloadCandidates]
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
  const completionCandidates = candidates.filter((event) =>
    event.eventType !== "grade_saved" || isLessonCompletionActivity(event)
  );
  const events = selectDistinctRecentActivityEvents(completionCandidates, limit);

  const actorProfileIds = Array.from(new Set(
    events
      .map((event) => event.actorProfileId)
      .filter((profileId): profileId is string => Boolean(profileId))
  ));
  const actorUserIds = Array.from(new Set(
    events
      .map((event) => event.actorUserId)
      .filter((userId): userId is string => Boolean(userId))
  ));
  const weekIds = Array.from(new Set(
    events
      .map((event) => event.weeklyPlanId)
      .filter((weekId): weekId is string => Boolean(weekId))
  ));
  const [actors, userActors, grades, weeks] = await Promise.all([
    actorProfileIds.length === 0
      ? []
      : db.select({ id: profiles.id, name: profiles.firstName })
        .from(profiles)
        .where(inArray(profiles.id, actorProfileIds)),
    actorUserIds.length === 0
      ? []
      : db.select({ userId: profiles.userId, name: profiles.firstName })
        .from(profiles)
        .where(and(
          inArray(profiles.userId, actorUserIds),
          eq(profiles.role, "PARENT")
        )),
    weekIds.length === 0
      ? []
      : db.select({
        weeklyPlanId: weeklyPlanDaySubjectGrades.weeklyPlanId,
        dayNumber: weeklyPlanDaySubjectGrades.dayNumber,
        subjectKey: weeklyPlanDaySubjectGrades.subjectKey,
        title: weeklyPlanDaySubjectGrades.title,
        score: weeklyPlanDaySubjectGrades.score
      }).from(weeklyPlanDaySubjectGrades)
        .where(inArray(weeklyPlanDaySubjectGrades.weeklyPlanId, weekIds)),
    weekIds.length === 0
      ? []
      : db.select({ id: weeklyPlans.id, weekNumber: weeklyPlans.weekNumber })
        .from(weeklyPlans)
        .where(inArray(weeklyPlans.id, weekIds))
  ]);
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));
  const actorNamesByUserId = new Map(userActors.map((actor) => [actor.userId, actor.name]));
  const weekNumbers = new Map(weeks.map((week) => [week.id, week.weekNumber]));
  const gradeContexts = new Map(grades.map((grade) => [
    `${grade.weeklyPlanId}:${grade.dayNumber}:${grade.subjectKey}`,
    { title: grade.title, score: grade.score }
  ]));

  return {
    events: events.map((event) => {
      const dayNumber = typeof event.metadata?.dayNumber === "number"
        ? event.metadata.dayNumber
        : null;
      const storedTitle = typeof event.metadata?.activityTitle === "string"
        ? event.metadata.activityTitle.trim() || null
        : null;
      const gradeContext = event.weeklyPlanId && event.subjectKey && dayNumber != null
        ? gradeContexts.get(`${event.weeklyPlanId}:${dayNumber}:${event.subjectKey}`) ?? null
        : null;
      const lessonTitle = storedTitle ?? gradeContext?.title ?? null;
      const subjectAreaLabel = event.subjectLabel;
      return {
        id: event.id,
        type: event.eventType === "grade_saved" ? "lesson_completed" : event.eventType,
        actorName: event.actorProfileId
          ? actorNames.get(event.actorProfileId) ?? "A teacher"
          : event.actorUserId
            ? actorNamesByUserId.get(event.actorUserId) ?? "A teacher"
            : "A teacher",
        studentName: student.name,
        // Older mobile builds use subjectLabel as the lesson label.
        subjectLabel: isLessonCompletionActivity(event)
          ? lessonTitle ?? subjectAreaLabel
          : subjectAreaLabel,
        subjectAreaLabel,
        lessonTitle,
        weekNumber: event.weeklyPlanId
          ? weekNumbers.get(event.weeklyPlanId) ?? null
          : null,
        dayNumber,
        score: event.score ?? gradeContext?.score ?? null,
        pointsAmount: typeof event.metadata?.pointsAmount === "number"
          ? event.metadata.pointsAmount
          : null,
        pointsReason: typeof event.metadata?.pointsReason === "string"
          ? event.metadata.pointsReason
          : null,
        pointSingularName: typeof event.metadata?.pointSingularName === "string"
          ? event.metadata.pointSingularName
          : null,
        pointPluralName: typeof event.metadata?.pointPluralName === "string"
          ? event.metadata.pointPluralName
          : null,
        occurredAt: event.occurredAt.toISOString()
      };
    })
  };
}
