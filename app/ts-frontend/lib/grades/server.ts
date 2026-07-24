import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";
const getBackendUrl = () => process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;

export type StudentGradesPayload = {
  student: { id: string; firstName: string; gradingScheme: "us" | "jp" };
  gradingScheme: { id: "us" | "jp"; name: string };
  years: Array<{
    id: string; title: string; totalWeeks: number; startDate: string | null; status: string;
    gradedEntries: number; overallAverage: number | null; grade: string | null;
  }>;
  selectedYear: StudentGradesPayload["years"][number] | null;
  subjects: Array<{
    subjectId: string | null; subjectKey: string; subjectLabel: string; gradedEntries: number;
    averageScore: number | null; grade: string | null;
  }>;
  selectedSubject: StudentGradesPayload["subjects"][number] | null;
  entries: Array<{
    weeklyPlanId: string; weekNumber: number; dayNumber: number | null; source: "day" | "legacy"; weekStatus: string; subjectId: string | null;
    subjectKey: string; subjectLabel: string; planTitle: string | null; score: number | null;
    assessmentRecommended: boolean; grade: string | null; completedAt: string | null; updatedAt: string;
  }>;
};

export async function getStudentGrades(input: {
  parentUserId: string; profileId: string; yearId?: string | null; subjectKey?: string | null;
}) {
  const params = new URLSearchParams({ parentUserId: input.parentUserId, profileId: input.profileId });
  if (input.yearId) params.set("yearId", input.yearId);
  if (input.subjectKey) params.set("subjectKey", input.subjectKey);
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/grades?${params}`, { cache: "no-store" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch student grades.");
  }
  return (await response.json()) as StudentGradesPayload;
}
