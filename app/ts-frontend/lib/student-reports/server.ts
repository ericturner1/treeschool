import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";
const getBackendUrl = () => process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;

export type StudentReportKind = "attendance" | "report-card";

export async function downloadStudentReport(input: {
  parentUserId: string;
  profileId: string;
  yearId: string;
  reportKind: StudentReportKind;
}) {
  const params = new URLSearchParams({
    parentUserId: input.parentUserId,
    profileId: input.profileId,
    yearId: input.yearId,
  });
  const response = await backendFetch(
    `${getBackendUrl()}/internal/profiles/student/reports/${input.reportKind}?${params}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Could not build this student report.");
  }
  return response;
}
