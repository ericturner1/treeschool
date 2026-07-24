import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";
const getBackendUrl = () => process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;

export type StudentOverviewMetrics = {
  premiumAccess: boolean;
  learningProfile: {
    notes: string | null;
    subjectStrengths: Record<string, string>;
    updatedAt: string | null;
  };
  learningYear: {
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
  } | null;
  hasLessonPlan: boolean;
  planProgressPercent: number | null;
  pacing: {
    status: "before_start" | "on_track" | "ahead" | "behind" | "complete";
    startDate: string;
    endDate: string;
    scheduledTeachingDays: number;
    completedTeachingDays: number;
    expectedTeachingDays: number;
    behindTeachingDays: number;
    behindWeeks: number;
    aheadTeachingDays: number;
  } | null;
  scheduledDayCount: number;
  overallGrade: {
    average: number | null;
    letter: string | null;
    gradedEntries: number;
  } | null;
  lastAttendance: {
    date: string;
    daysSince: number;
  } | null;
  nextAction: {
    kind: "setup" | "planning" | "repair" | "update" | "download" | "attendance" | "complete" | "upgrade";
    label: string;
    description: string;
    href: string;
  };
};

export async function getStudentOverviewMetrics(input: {
  parentUserId: string;
  profileId: string;
}) {
  const params = new URLSearchParams({
    parentUserId: input.parentUserId,
    profileId: input.profileId
  });
  const response = await backendFetch(
    `${getBackendUrl()}/internal/profiles/student/overview?${params}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch student overview.");
  }
  return (await response.json()) as StudentOverviewMetrics;
}
