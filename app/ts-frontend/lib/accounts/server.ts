import { backendFetch } from "../backend/server";
import type { PrintPageSize } from "../print-page-sizes";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

export type HouseholdProfile = {
  id: string;
  slug: string | null;
  role: "PARENT" | "STUDENT";
  accountRole: "OWNER" | "ADMIN" | "TEACHER" | null;
  isAdmin: boolean;
  firstName: string;
  birthDate: string | null;
  gradeLevel: number | null;
  accessPin: string | null;
  avatarUrl: string | null;
  uiTheme: "playful" | "academic";
  languagePreference: string;
  currentNodeId: string | null;
  gradingScheme: "us" | "jp";
  learningProfileNotes: string | null;
  subjectStrengths: Record<string, string>;
  learningProfileUpdatedAt: string | null;
};

export type AccountPeople = {
  currentUserId: string;
  currentRole: "OWNER" | "ADMIN" | "TEACHER";
  canInvite: boolean;
  teacherUserLimit: number;
  teacherUsersUsed: number;
  teacherLimitReached: boolean;
  members: Array<{
    profileId: string;
    userId: string | null;
    name: string;
    email: string;
    role: "OWNER" | "ADMIN" | "TEACHER";
    activityDateFrom: string;
    activityDateTo: string;
    activityDays: Array<{ date: string; count: number }>;
  }>;
  invitations: Array<{
    id: string;
    name: string;
    email: string;
    role: "TEACHER";
    status: "PENDING";
    expiresAt: string;
  }>;
};

export type TeacherActivity = {
  teacher: {
    profileId: string;
    userId: string | null;
    name: string;
    email: string;
    role: "OWNER" | "ADMIN" | "TEACHER";
  };
  requesterRole: "OWNER" | "ADMIN" | "TEACHER";
  canManageRole: boolean;
  dateFrom: string;
  dateTo: string;
  days: Array<{ date: string; count: number }>;
  summary: {
    totalActions: number;
    gradingActions: number;
    gradesSaved: number;
    gradesRemoved: number;
    attendanceRecorded: number;
    activeDays: number;
  };
  events: Array<{
    id: string;
    eventType: "grade_saved" | "grade_removed" | "attendance_manual";
    subjectLabel: string | null;
    score: number | null;
    studentName: string | null;
    weekNumber: number | null;
    dayNumber: number | null;
    activityTitle: string | null;
    activityType: string | null;
    attendanceDate: string | null;
    minutes: number | null;
    occurredAt: string;
  }>;
};

export type StudentCurriculumAssignment = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  assignedAt?: string;
};

export type StudentCurriculumManagement = {
  student: {
    id: string;
    firstName: string;
    gradeLevel: number | null;
    birthDate: string | null;
    currentNodeId: string | null;
  };
  enrolledCurricula: StudentCurriculumAssignment[];
  availableCurricula: Array<
    StudentCurriculumAssignment & {
      enrolled: boolean;
    }
  >;
};

export type StudentStreakSettings = {
  profileId: string;
  mode: "daily" | "weekly";
  timeZone: string;
  pausedWeekdays: number[];
  pausedWeeks: string[];
  currentCount: number;
  longestCount: number;
  currentPeriodLabel: string;
  currentPeriodPaused: boolean;
  currentPeriodCompleted: boolean;
};

export type StudentGradingScheme = {
  profileId: string;
  gradingScheme: "us" | "jp";
};

export type AccountPreferences = {
  preferredPrintPageSize: PrintPageSize | null;
};

export async function getParentAccountPreferences(userId: string) {
  const response = await backendFetch(
    `${getBackendUrl()}/internal/accounts/preferences?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to load account preferences.");
  }
  return (await response.json()) as AccountPreferences;
}

export async function updateParentAccountPreferences(input: {
  userId: string;
  preferredPrintPageSize: PrintPageSize;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/accounts/preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to update account preferences.");
  }
  return (await response.json()) as AccountPreferences;
}

export async function bootstrapParentAccount(input: {
  userId: string;
  email: string;
  firstName?: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/accounts/bootstrap-parent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to bootstrap parent account.");
  }

  return response.json();
}

export async function canSignInWithParentEmail(email: string) {
  const response = await backendFetch(
    `${getBackendUrl()}/internal/accounts/sign-in-eligibility?email=${encodeURIComponent(email)}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    throw new Error("Could not verify this Treeschool account.");
  }
  const payload = (await response.json()) as { eligible?: boolean };
  return payload.eligible === true;
}

export async function listHouseholdProfiles(userId: string) {
  const response = await backendFetch(
    `${getBackendUrl()}/internal/accounts/profiles?userId=${encodeURIComponent(userId)}`,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch household profiles.");
  }

  const payload = (await response.json()) as {
    profiles: HouseholdProfile[];
  };

  return payload.profiles;
}

export async function listAccountPeople(userId: string) {
  const response = await backendFetch(
    `${getBackendUrl()}/internal/accounts/people?userId=${encodeURIComponent(userId)}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to load account members.");
  }
  return (await response.json()) as AccountPeople;
}

export async function getAccountTeacherActivity(input: {
  userId: string;
  profileId: string;
}) {
  const params = new URLSearchParams({
    userId: input.userId,
    profileId: input.profileId
  });
  const response = await backendFetch(
    `${getBackendUrl()}/internal/accounts/people/activity?${params.toString()}`,
    { cache: "no-store" }
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to load teacher activity.");
  }
  return (await response.json()) as TeacherActivity;
}

export async function updateOwnAccountName(input: { userId: string; name: string }) {
  const response = await backendFetch(`${getBackendUrl()}/internal/accounts/people/name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to update your name.");
  }
  return response.json() as Promise<{ profileId: string; name: string }>;
}

export async function createAccountInvitation(input: {
  userId: string;
  name: string;
  email: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/accounts/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to invite that person.");
  }
  return response.json() as Promise<{
    id: string;
    name: string;
    email: string;
    role: "TEACHER";
    expiresAt: string;
  }>;
}

export async function updateAccountMemberRole(input: {
  userId: string;
  profileId: string;
  role: "ADMIN" | "TEACHER";
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/accounts/people/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to update the account role.");
  }
  return response.json() as Promise<{ profileId: string; role: "ADMIN" | "TEACHER" }>;
}

export async function createStudentHouseholdProfile(input: {
  parentUserId: string;
  firstName: string;
  birthDate: string;
  gradeLevel: number;
  accessPin?: string;
  learningProfileNotes?: string;
  subjectStrengths?: Record<string, string>;
  recurringDaysOff?: number[];
  calendarTimeZone?: string;
  calendarExceptions?: Array<{
    label: string;
    exceptionKind?: "holiday" | "school_break" | "vacation" | "personal_day" | "other";
    startDate: string;
    endDate: string;
  }>;
  successUrl: string;
  cancelUrl: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to create student profile.");
  }

  return response.json() as Promise<
    | { kind: "created"; profile: { id: string } | null }
    | { kind: "checkout"; url: string; paymentCopy: string }
  >;
}

export async function updateStudentLearningProfile(input: {
  parentUserId: string;
  profileId: string;
  learningProfileNotes: string;
  subjectStrengths: Record<string, string>;
  schoolYearStartDate?: string | null;
  schoolYearEndDate?: string | null;
  updateSchoolYear?: boolean;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/learning-profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to update student profile.");
  }
  return response.json();
}

export async function prepareStudentProfilePhotoUpload(input: {
  parentUserId: string;
  profileId: string;
  contentType: string;
  sizeBytes: number;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/photo/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Could not prepare the student photo upload.");
  }
  return response.json() as Promise<{ objectPath: string; uploadUrl: string; contentType: string }>;
}

export async function completeStudentProfilePhotoUpload(input: {
  parentUserId: string;
  profileId: string;
  objectPath: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/photo/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Could not save the student photo.");
  }
  return response.json() as Promise<{ profileId: string; avatarUrl: string }>;
}

export async function discardStudentProfilePhotoUpload(input: {
  parentUserId: string;
  profileId: string;
  objectPath: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/photo/discard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Could not discard the student photo upload.");
  }
  return response.json() as Promise<{ discarded: boolean }>;
}

export async function syncStudentProfileToAge(input: {
  parentUserId: string;
  profileId: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/sync-age`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to sync vocabulary to age.");
  }

  return response.json();
}

export async function getStudentCurriculumManagement(input: {
  parentUserId: string;
  profileId: string;
  languageCode?: string;
}) {
  const params = new URLSearchParams({
    parentUserId: input.parentUserId,
    profileId: input.profileId
  });

  if (input.languageCode) {
    params.set("languageCode", input.languageCode);
  }

  const response = await backendFetch(
    `${getBackendUrl()}/internal/profiles/student/curriculum?${params.toString()}`,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch student curriculum.");
  }

  return (await response.json()) as StudentCurriculumManagement;
}

export async function addCurriculumToStudent(input: {
  parentUserId: string;
  profileId: string;
  nodeId: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/curriculum`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to add curriculum.");
  }

  return response.json();
}

export async function removeCurriculumFromStudent(input: {
  parentUserId: string;
  profileId: string;
  nodeId: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/curriculum`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to remove curriculum.");
  }

  return response.json();
}

export async function getStudentStreakSettings(input: {
  parentUserId: string;
  profileId: string;
}) {
  const params = new URLSearchParams({
    parentUserId: input.parentUserId,
    profileId: input.profileId
  });

  const response = await backendFetch(
    `${getBackendUrl()}/internal/profiles/student/streaks?${params.toString()}`,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch streak settings.");
  }

  return (await response.json()) as StudentStreakSettings;
}

export async function updateStudentStreakSettings(input: {
  parentUserId: string;
  profileId: string;
  mode: "daily" | "weekly";
  timeZone?: string;
  pausedWeekdays?: number[];
  pausedWeeks?: string[];
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/streaks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to update streak settings.");
  }

  return (await response.json()) as StudentStreakSettings;
}

export async function updateStudentGradingScheme(input: {
  parentUserId: string;
  profileId: string;
  gradingScheme: "us" | "jp";
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/grading-scheme`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to update grading scheme.");
  }

  return (await response.json()) as StudentGradingScheme;
}
