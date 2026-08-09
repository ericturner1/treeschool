import { normalizePlanSubjectLabel, planSubjectKey } from "./plan-subject-key";

export function averageWithExtraCredit(scores: number[], extraCreditPoints: number[]) {
  if (scores.length === 0) return null;
  const points = extraCreditPoints.reduce((sum, value) => sum + value, 0);
  return Math.min(100, Math.round((scores.reduce((sum, value) => sum + value, 0) + points) / scores.length));
}

export function resolveExtraCreditSubjectKey(
  extraCredit: { subjectKey?: string | null; subjectLabel: string },
  gradedSubjects: Array<{ subjectKey: string; subjectLabel: string }>
) {
  const normalizedLabel = normalizePlanSubjectLabel(extraCredit.subjectLabel);
  const matchingSubject = gradedSubjects.find(
    (subject) => normalizePlanSubjectLabel(subject.subjectLabel) === normalizedLabel
  );
  return matchingSubject?.subjectKey
    ?? extraCredit.subjectKey
    ?? planSubjectKey({ subjectLabel: extraCredit.subjectLabel });
}
