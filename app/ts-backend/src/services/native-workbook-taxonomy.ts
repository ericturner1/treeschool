export const CURRICULUM_AREA_KEYS = [
  "language_arts",
  "mathematics",
  "science",
  "social_studies",
  "world_languages",
  "arts_and_music",
  "physical_education_and_health",
  "technology_and_practical_skills",
  "agriculture",
  "business_and_entrepreneurship",
  "religious_studies",
  "other"
] as const;

export type CurriculumAreaKey = typeof CURRICULUM_AREA_KEYS[number];

export const CURRICULUM_AREA_LABELS: Record<CurriculumAreaKey, string> = {
  language_arts: "Language Arts",
  mathematics: "Mathematics",
  science: "Science",
  social_studies: "Social Studies",
  world_languages: "World Languages",
  arts_and_music: "Arts & Music",
  physical_education_and_health: "Physical Education & Health",
  technology_and_practical_skills: "Technology & Practical Skills",
  agriculture: "Agriculture",
  business_and_entrepreneurship: "Business & Entrepreneurship",
  religious_studies: "Religious Studies",
  other: "Other"
};

export function normalizeCurriculumAreaKey(value: unknown): CurriculumAreaKey {
  const candidate = String(value ?? "").trim().toLowerCase();
  if (!CURRICULUM_AREA_KEYS.includes(candidate as CurriculumAreaKey)) {
    throw new Error("Choose a valid curriculum area.");
  }
  return candidate as CurriculumAreaKey;
}
