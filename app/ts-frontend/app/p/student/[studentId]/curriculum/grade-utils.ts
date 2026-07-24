const gradeBands = [
  { min: 97, letter: "A+" },
  { min: 93, letter: "A" },
  { min: 90, letter: "A−" },
  { min: 87, letter: "B+" },
  { min: 83, letter: "B" },
  { min: 80, letter: "B−" },
  { min: 77, letter: "C+" },
  { min: 73, letter: "C" },
  { min: 70, letter: "C−" },
  { min: 67, letter: "D+" },
  { min: 63, letter: "D" },
  { min: 60, letter: "D−" },
  { min: 57, letter: "F+" },
  { min: 53, letter: "F" },
  { min: 0, letter: "F−" }
];

export function letterGrade(value: string | number | null | undefined) {
  if (value == null || String(value).trim() === "") return null;
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  return gradeBands.find((band) => score >= band.min)?.letter ?? null;
}
