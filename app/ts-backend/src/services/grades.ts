import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  attendanceEntries,
  contentDocuments,
  learningYears,
  nativeWorkbooks,
  nativeWorkbookVersions,
  weeklyPlanDaySubjectGrades,
  weeklyPlans,
  weeklyPlanSubjectGrades
} from "ts-db";
import { db } from "../db";
import { getManageableStudentProfile } from "./accounts";
import { requirePremiumFeatureAccess } from "./entitlements";
import { averageWithExtraCredit } from "./grade-average";
import {
  curriculumAreaLabel,
  resolveCurriculumAreaKey,
} from "./native-workbook-taxonomy";
import { planSubjectKey } from "./plan-subject-key";

type GradingSchemeId = "us" | "jp";
const CUSTOM_ELECTIVE_PREFIX = "custom_elective:";

function attendanceGradeSubject(input: {
  subjectKey?: string | null;
  subjectLabel?: string | null;
  curriculumAreaKey?: string | null;
}) {
  if (
    input.subjectKey?.startsWith(CUSTOM_ELECTIVE_PREFIX) &&
    input.subjectLabel
  ) {
    return {
      subjectKey: input.subjectKey,
      subjectLabel: input.subjectLabel,
    };
  }
  const curriculumAreaKey = resolveCurriculumAreaKey(
    input.curriculumAreaKey,
    input.subjectLabel,
  );
  return {
    subjectKey: `area:${curriculumAreaKey}`,
    subjectLabel: curriculumAreaLabel(curriculumAreaKey),
  };
}

const gradingSchemes = {
  us: {
    id: "us" as const,
    name: "US letter grades",
    bands: [
      [97, "A+"], [93, "A"], [90, "A-"], [87, "B+"], [83, "B"], [80, "B-"],
      [77, "C+"], [73, "C"], [70, "C-"], [67, "D+"], [63, "D"], [60, "D-"], [0, "F"]
    ] as Array<[number, string]>
  },
  jp: {
    id: "jp" as const,
    name: "Japan 5-point scale",
    bands: [[90, "5"], [80, "4"], [70, "3"], [60, "2"], [0, "1"]] as Array<[number, string]>
  }
};

export function getGradingSchemeDefinition(gradingSchemeId: GradingSchemeId) {
  return gradingSchemes[gradingSchemeId];
}

export function translateScoreToGrade(gradingSchemeId: GradingSchemeId, score: number) {
  const scheme = gradingSchemes[gradingSchemeId];
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  return scheme.bands.find(([minimum]) => normalized >= minimum)?.[1] ?? "";
}

export async function getStudentGrades(input: {
  parentUserId: string;
  profileId: string;
  yearId?: string | null;
  subjectKey?: string | null;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  const { studentProfile } = await getManageableStudentProfile(input.parentUserId, input.profileId);
  const scheme = getGradingSchemeDefinition(studentProfile.gradingScheme);
  const yearRows = await db
    .select()
    .from(learningYears)
    .where(eq(learningYears.profileId, input.profileId))
    .orderBy(desc(learningYears.startDate), desc(learningYears.createdAt));

  const selectedYear = yearRows.find((year) => year.id === input.yearId) ?? yearRows[0] ?? null;
  const documentSubjects = yearRows.length === 0
    ? []
    : await db.select({
        yearId: contentDocuments.learningYearId,
        subjectId: contentDocuments.subjectId,
        subjectLabel: contentDocuments.subjectLabel,
        documentLabel: contentDocuments.label,
        curriculumAreaKey: nativeWorkbooks.curriculumAreaKey,
      })
      .from(contentDocuments)
      .leftJoin(
        nativeWorkbookVersions,
        eq(nativeWorkbookVersions.id, contentDocuments.nativeWorkbookVersionId),
      )
      .leftJoin(
        nativeWorkbooks,
        eq(nativeWorkbooks.id, nativeWorkbookVersions.workbookId),
      )
      .where(inArray(contentDocuments.learningYearId, yearRows.map((year) => year.id)));
  const curriculumAreaByYearAndSubject = new Map<string, string>();
  for (const document of documentSubjects) {
    const subjectLabel = document.subjectLabel ?? document.documentLabel;
    curriculumAreaByYearAndSubject.set(
      `${document.yearId}:${planSubjectKey({
        subjectId: document.subjectId,
        subjectLabel,
      })}`,
      resolveCurriculumAreaKey(document.curriculumAreaKey, subjectLabel),
    );
  }
  const legacyRows = await db
    .select({
      yearId: learningYears.id,
      weeklyPlanId: weeklyPlans.id,
      weekNumber: weeklyPlans.weekNumber,
      weekStatus: weeklyPlans.status,
      completedAt: weeklyPlans.completedAt,
      subjectId: weeklyPlanSubjectGrades.subjectId,
      subjectKey: weeklyPlanSubjectGrades.subjectKey,
      subjectLabel: weeklyPlanSubjectGrades.subjectLabel,
      planTitle: weeklyPlanSubjectGrades.planTitle,
      score: weeklyPlanSubjectGrades.grade,
      updatedAt: weeklyPlanSubjectGrades.updatedAt
    })
    .from(weeklyPlanSubjectGrades)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanSubjectGrades.weeklyPlanId))
    .innerJoin(learningYears, eq(learningYears.id, weeklyPlans.learningYearId))
    .where(eq(learningYears.profileId, input.profileId))
    .orderBy(asc(weeklyPlans.weekNumber), asc(weeklyPlanSubjectGrades.subjectLabel));
  const dayRows = await db.select({
    yearId: learningYears.id,
    weeklyPlanId: weeklyPlans.id,
    weekNumber: weeklyPlans.weekNumber,
    weekStatus: weeklyPlans.status,
    completedAt: weeklyPlans.completedAt,
    dayNumber: weeklyPlanDaySubjectGrades.dayNumber,
    subjectId: weeklyPlanDaySubjectGrades.subjectId,
    subjectKey: weeklyPlanDaySubjectGrades.subjectKey,
    subjectLabel: weeklyPlanDaySubjectGrades.subjectLabel,
    planTitle: weeklyPlanDaySubjectGrades.title,
    score: weeklyPlanDaySubjectGrades.score,
    assessmentRecommended: weeklyPlanDaySubjectGrades.assessmentRecommended,
    updatedAt: weeklyPlanDaySubjectGrades.updatedAt
  }).from(weeklyPlanDaySubjectGrades)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, weeklyPlanDaySubjectGrades.weeklyPlanId))
    .innerJoin(learningYears, eq(learningYears.id, weeklyPlans.learningYearId))
    .where(eq(learningYears.profileId, input.profileId))
    .orderBy(
      asc(weeklyPlans.weekNumber),
      asc(weeklyPlanDaySubjectGrades.dayNumber),
      asc(weeklyPlanDaySubjectGrades.subjectLabel)
    );
  const extraCreditRows = await db.select({
    id: attendanceEntries.id,
    yearId: attendanceEntries.learningYearId,
    subjectKey: attendanceEntries.subjectKey,
    subjectLabel: attendanceEntries.subjectLabel,
    curriculumAreaKey: attendanceEntries.curriculumAreaKey,
    title: attendanceEntries.title,
    points: attendanceEntries.extraCreditPoints,
    attendanceDate: attendanceEntries.attendanceDate
  }).from(attendanceEntries)
    .where(and(
      eq(attendanceEntries.profileId, input.profileId),
      eq(attendanceEntries.entryKind, "manual")
    ))
    .orderBy(asc(attendanceEntries.attendanceDate), asc(attendanceEntries.createdAt));
  const dayGradeKeys = new Set(dayRows.map((row) => `${row.weeklyPlanId}:${row.subjectKey}`));
  const detailedRows = [
    ...dayRows.map((row) => ({ ...row, source: "day" as const })),
    ...legacyRows
      .filter((row) => !dayGradeKeys.has(`${row.weeklyPlanId}:${row.subjectKey}`))
      .map((row) => ({
        ...row,
        dayNumber: null,
        assessmentRecommended: false,
        source: "legacy" as const
      }))
  ];
  const allRows = detailedRows.map((row) => {
    const curriculumAreaKey = resolveCurriculumAreaKey(
      curriculumAreaByYearAndSubject.get(`${row.yearId}:${row.subjectKey}`),
      row.subjectLabel,
    );
    return {
      ...row,
      curriculumAreaKey,
      subjectKey: `area:${curriculumAreaKey}`,
      subjectLabel: curriculumAreaLabel(curriculumAreaKey),
    };
  });

  const rowsForYear = selectedYear ? allRows.filter((row) => row.yearId === selectedYear.id) : [];
  const extraCreditForYear = selectedYear
    ? extraCreditRows.filter(
        (row) =>
          row.yearId === selectedYear.id &&
          row.points != null &&
          (row.subjectKey || row.curriculumAreaKey || row.subjectLabel),
      )
    : [];
  const subjectMap = new Map<string, {
    subjectId: string | null;
    subjectKey: string;
    subjectLabel: string;
    scores: number[];
    extraCreditPoints: number[];
  }>();
  for (const row of rowsForYear) {
    const current = subjectMap.get(row.subjectKey) ?? {
      subjectId: null,
      subjectKey: row.subjectKey,
      subjectLabel: row.subjectLabel,
      scores: [],
      extraCreditPoints: []
    };
    if (row.score != null) current.scores.push(row.score);
    subjectMap.set(row.subjectKey, current);
  }
  const extraCreditSubjectKeys = new Map<string, string>();
  for (const row of extraCreditForYear) {
    const { subjectKey, subjectLabel } = attendanceGradeSubject(row);
    extraCreditSubjectKeys.set(row.id, subjectKey);
    const current = subjectMap.get(subjectKey) ?? {
      subjectId: null,
      subjectKey,
      subjectLabel,
      scores: [],
      extraCreditPoints: []
    };
    current.extraCreditPoints.push(row.points!);
    subjectMap.set(subjectKey, current);
  }

  const subjects = Array.from(subjectMap.values())
    .filter((subject) => subject.scores.length > 0 || subject.extraCreditPoints.length > 0)
    .map((subject) => {
      const averageScore = averageWithExtraCredit(subject.scores, subject.extraCreditPoints);
      return {
        subjectId: subject.subjectId,
        subjectKey: subject.subjectKey,
        subjectLabel: subject.subjectLabel,
        gradedEntries: subject.scores.length + subject.extraCreditPoints.length,
        averageScore,
        grade: averageScore == null ? null : translateScoreToGrade(scheme.id, averageScore)
      };
    })
    .sort((left, right) => left.subjectLabel.localeCompare(right.subjectLabel));

  const years = yearRows.map((year) => {
    const yearScores = allRows.filter((row) => row.yearId === year.id && row.score != null).map((row) => row.score as number);
    const yearExtraCredit = extraCreditRows
      .filter((row) => row.yearId === year.id && row.points != null)
      .map((row) => row.points!);
    const overallAverage = averageWithExtraCredit(yearScores, yearExtraCredit);
    return {
      id: year.id,
      title: year.title,
      totalWeeks: year.totalWeeks,
      startDate: year.startDate ? year.startDate.toISOString().slice(0, 10) : null,
      status: year.status,
      gradedEntries: yearScores.length + yearExtraCredit.length,
      overallAverage,
      grade: overallAverage == null ? null : translateScoreToGrade(scheme.id, overallAverage)
    };
  });

  const entries = rowsForYear
    .filter((row) => row.score != null && (!input.subjectKey || row.subjectKey === input.subjectKey))
    .map((row) => ({
      entryId: null,
      weeklyPlanId: row.weeklyPlanId,
      weekNumber: row.weekNumber,
      dayNumber: row.dayNumber,
      source: row.source,
      isExtraCredit: false,
      extraCreditPoints: null,
      weekStatus: row.weekStatus,
      subjectId: row.subjectId,
      subjectKey: row.subjectKey,
      subjectLabel: row.subjectLabel,
      planTitle: row.planTitle,
      assessmentRecommended: row.assessmentRecommended,
      score: row.score,
      grade: row.score == null ? null : translateScoreToGrade(scheme.id, row.score),
      completedAt: row.completedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString()
    }));
  const extraCreditEntries = extraCreditForYear
    .map((row) => {
      const subjectKey = extraCreditSubjectKeys.get(row.id)!;
      const { subjectLabel } = attendanceGradeSubject(row);
      return {
        entryId: row.id,
        weeklyPlanId: null,
        weekNumber: null,
        dayNumber: null,
        source: "extra_credit" as const,
        isExtraCredit: true,
        extraCreditPoints: row.points,
        weekStatus: "recorded",
        subjectId: null,
        subjectKey,
        subjectLabel,
        planTitle: row.title,
        assessmentRecommended: false,
        score: null,
        grade: null,
        completedAt: null,
        updatedAt: `${row.attendanceDate}T00:00:00.000Z`
      };
    })
    .filter((row) => !input.subjectKey || row.subjectKey === input.subjectKey);

  return {
    student: { id: studentProfile.id, firstName: studentProfile.firstName, gradingScheme: scheme.id },
    gradingScheme: { id: scheme.id, name: scheme.name },
    years,
    selectedYear: selectedYear ? years.find((year) => year.id === selectedYear.id) ?? null : null,
    subjects,
    selectedSubject: input.subjectKey ? subjects.find((subject) => subject.subjectKey === input.subjectKey) ?? null : null,
    entries: [...entries, ...extraCreditEntries]
  };
}
