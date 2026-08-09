const MANUAL_ACTIVITY_TYPES = new Set([
  "field_trip",
  "co_op",
  "project",
  "library",
  "sport",
  "subject",
  "other"
]);

export type ManualAttendanceFields = {
  attendanceDate: string;
  activityType: string;
  subjectLabel?: string | null;
  title: string;
  notes?: string | null;
  minutes?: number | null;
  extraCreditPoints?: number | null;
};

function trimmedOptional(value: string | null | undefined, maximum: number, fieldName: string) {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > maximum) {
    throw new Error(`${fieldName} is too long.`);
  }
  return normalized;
}

function attendanceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Choose a valid learning date.");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Choose a valid learning date.");
  }
  return value;
}

function activityType(value: string) {
  if (!MANUAL_ACTIVITY_TYPES.has(value)) {
    throw new Error("Choose a valid learning activity type.");
  }
  return value;
}

function minutes(value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 1440) {
    throw new Error("Minutes must be a whole number between 1 and 1,440.");
  }
  return value;
}

function extraCreditPoints(value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("Extra credit must be a whole number between 1 and 100 points.");
  }
  return value;
}

export function normalizeManualAttendanceFields(input: ManualAttendanceFields) {
  const title = input.title.trim();
  if (!title) throw new Error("Add a short description of the learning activity.");
  if (title.length > 240) throw new Error("The learning activity description is too long.");

  const subjectLabel = trimmedOptional(input.subjectLabel, 120, "The subject");
  const bonusPoints = extraCreditPoints(input.extraCreditPoints);
  if (bonusPoints != null && !subjectLabel) {
    throw new Error("Choose a subject before adding extra credit.");
  }

  return {
    attendanceDate: attendanceDate(input.attendanceDate),
    activityType: activityType(input.activityType),
    subjectLabel,
    title,
    notes: trimmedOptional(input.notes, 4000, "The notes"),
    minutes: minutes(input.minutes),
    extraCreditPoints: bonusPoints
  };
}
