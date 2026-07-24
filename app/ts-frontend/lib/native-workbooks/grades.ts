export function formatNativeWorkbookGradeRange(min: number, max: number) {
  if (min === max) return min === 0 ? "Kindergarten" : `Grade ${min}`;
  const rangeGrade = (grade: number) => grade === 0 ? "K" : String(grade);
  return `Grades ${rangeGrade(min)}-${rangeGrade(max)}`;
}
