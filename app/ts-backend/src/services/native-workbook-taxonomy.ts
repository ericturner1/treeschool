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

export function curriculumAreaLabel(value: unknown) {
  const key = normalizeCurriculumAreaKey(value);
  return CURRICULUM_AREA_LABELS[key];
}

export function inferCurriculumAreaKey(value: unknown): CurriculumAreaKey {
  const label = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD");

  if (!label) return "other";
  if (/\b(agriculture|farming|horticulture)\b/.test(label)) return "agriculture";
  if (/\b(business|entrepreneur|commerce|marketing)\b/.test(label)) {
    return "business_and_entrepreneurship";
  }
  if (/\b(religion|religious|bible|theology|faith)\b/.test(label)) {
    return "religious_studies";
  }
  if (/国語|\b(kokugo|language arts|reading|phonics|spelling|writing|grammar|english|literature|handwriting|cursive|composition|vocabulary)\b/.test(label)) {
    return "language_arts";
  }
  if (/算数|数学|\b(math|maths|mathematics|arithmetic|algebra|geometry|calculus)\b/.test(label)) {
    return "mathematics";
  }
  if (/理科|\b(science|biology|chemistry|physics|earth science|astronomy)\b/.test(label)) {
    return "science";
  }
  if (/社会|\b(social studies|history|geography|civics|economics)\b/.test(label)) {
    return "social_studies";
  }
  if (/\b(japanese|spanish|french|german|mandarin|chinese|latin|world language|foreign language)\b/.test(label)) {
    return "world_languages";
  }
  if (/音楽|美術|図工|\b(art|arts|music|dance|drama|theater|theatre)\b/.test(label)) {
    return "arts_and_music";
  }
  if (/体育|保健|\b(physical education|health|fitness|sport|sports|wellness|nutrition)\b/.test(label)) {
    return "physical_education_and_health";
  }
  if (/技術|家庭|\b(technology|computer|coding|programming|robotics|engineering|life skills|home economics|financial literacy)\b/.test(label)) {
    return "technology_and_practical_skills";
  }
  return "other";
}

export function resolveCurriculumAreaKey(value: unknown, subjectLabel?: unknown): CurriculumAreaKey {
  const candidate = String(value ?? "").trim().toLowerCase();
  return CURRICULUM_AREA_KEYS.includes(candidate as CurriculumAreaKey)
    ? candidate as CurriculumAreaKey
    : inferCurriculumAreaKey(subjectLabel);
}
