import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";
const getBackendUrl = () => process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;

export type StudentAttendancePayload = {
  student: { id: string; firstName: string };
  years: Array<{ id: string; title: string; startDate: string | null; status: string }>;
  selectedYearId: string | null;
  dateFrom: string;
  dateTo: string;
  summary: { learningDays: number; activities: number; minutes: number };
  days: Array<{ date: string; count: number; minutes: number }>;
  subjects: Array<{ subjectKey: string; subjectLabel: string; learningDays: number; activities: number }>;
  entries: Array<{
    id: string; date: string; entryKind: string; activityType: string; subjectLabel: string | null;
    subjectLabels: string[]; weeklyPlanDayNumber: number | null;
    title: string; notes: string | null; minutes: number | null; extraCreditPoints: number | null;
  }>;
};

export type StudentSchoolCalendarPayload = {
  timeZone: string;
  recurringDaysOff: number[];
  holidays: Array<{
    id: string;
    label: string;
    exceptionKind: "holiday" | "school_break" | "vacation" | "personal_day" | "other";
    startDate: string;
    endDate: string;
  }>;
  activityDates: string[];
  streak: {
    mode: "daily" | "weekly";
    timeZone: string;
    currentCount: number;
    longestCount: number;
    lastActiveAt: string | null;
    currentPeriodLabel: string;
    currentPeriodPaused: boolean;
    currentPeriodCompleted: boolean;
    pausedWeekdays: number[];
    pausedWeeks: string[];
  };
};

async function attendanceRequest<T>(method: string, body: Record<string, unknown>) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/attendance`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Failed to update attendance.");
  return payload as T;
}

export async function getStudentAttendance(input: {
  parentUserId: string; profileId: string; yearId?: string | null; dateFrom?: string | null; dateTo?: string | null;
}) {
  const params = new URLSearchParams({ parentUserId: input.parentUserId, profileId: input.profileId });
  if (input.yearId) params.set("yearId", input.yearId);
  if (input.dateFrom) params.set("dateFrom", input.dateFrom);
  if (input.dateTo) params.set("dateTo", input.dateTo);
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/attendance?${params}`, { cache: "no-store" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch attendance.");
  }
  return (await response.json()) as StudentAttendancePayload;
}

export function createManualAttendance(input: Record<string, unknown>) {
  return attendanceRequest("POST", { ...input, entryKind: "manual" });
}

export function createPlanItemAttendance(input: Record<string, unknown>) {
  return attendanceRequest("POST", { ...input, entryKind: "plan_item" });
}

export function createPlanDayAttendance(input: Record<string, unknown>) {
  return attendanceRequest("POST", { ...input, entryKind: "plan_day" });
}

export function setPlanDaySubjectCompletion(input: Record<string, unknown>) {
  return attendanceRequest("POST", { ...input, entryKind: "plan_day_subject" });
}

export function removeAttendance(input: Record<string, unknown>) {
  return attendanceRequest("DELETE", input);
}

export function updateManualAttendance(input: Record<string, unknown>) {
  return attendanceRequest("PATCH", input);
}

export async function getStudentSchoolCalendar(input: {
  parentUserId: string;
  profileId: string;
  dateFrom: string;
  dateTo: string;
}) {
  const params = new URLSearchParams(input);
  const response = await backendFetch(
    `${getBackendUrl()}/internal/profiles/student/calendar?${params}`,
    { cache: "no-store" }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Failed to load the school calendar.");
  return payload as StudentSchoolCalendarPayload;
}

async function calendarRequest<T>(method: "PATCH" | "POST" | "DELETE", body: Record<string, unknown>) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/calendar`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Failed to update the school calendar.");
  return payload as T;
}

export function updateStudentSchoolSchedule(input: {
  parentUserId: string;
  profileId: string;
  timeZone: string;
  recurringDaysOff: number[];
}) {
  return calendarRequest("PATCH", input);
}

export function addStudentCalendarException(input: {
  parentUserId: string;
  profileId: string;
  label: string;
  exceptionKind: "holiday" | "school_break" | "vacation" | "personal_day" | "other";
  startDate: string;
  endDate: string;
}) {
  return calendarRequest("POST", input);
}

export function removeStudentCalendarException(input: {
  parentUserId: string;
  profileId: string;
  exceptionId: string;
}) {
  return calendarRequest("DELETE", input);
}
