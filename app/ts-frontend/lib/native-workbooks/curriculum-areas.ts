export const CURRICULUM_AREAS = [
  { value: "language_arts", label: "Language Arts" },
  { value: "mathematics", label: "Mathematics" },
  { value: "science", label: "Science" },
  { value: "social_studies", label: "Social Studies" },
  { value: "world_languages", label: "World Languages" },
  { value: "arts_and_music", label: "Arts & Music" },
  { value: "physical_education_and_health", label: "Physical Education & Health" },
  { value: "technology_and_practical_skills", label: "Technology & Practical Skills" },
  { value: "agriculture", label: "Agriculture" },
  { value: "business_and_entrepreneurship", label: "Business & Entrepreneurship" },
  { value: "religious_studies", label: "Religious Studies" },
  { value: "other", label: "Other" }
] as const;

export type CurriculumAreaKey = typeof CURRICULUM_AREAS[number]["value"];

export function curriculumAreaLabel(value: string) {
  return CURRICULUM_AREAS.find((area) => area.value === value)?.label ?? "Other";
}
