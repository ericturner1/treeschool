import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

async function requireOk(response: Response, fallback: string) {
  if (response.ok) return response;
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  throw new Error(payload.error || fallback);
}

async function postJson<T>(path: string, body: unknown, fallback: string) {
  const response = await requireOk(
    await backendFetch(`${getBackendUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    }),
    fallback,
  );
  return response.json() as Promise<T>;
}

export type WorkbookBoxStyle = {
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  borderStyle?: "none" | "solid" | "dashed" | "dotted";
};

export type WorkbookLearnBlockLeaf = (
  | { type: "paragraph"; text: string }
  | {
      type: "callout";
      label?: string;
      text: string;
      tone: "tip" | "remember" | "example";
    }
  | {
      type: "illustration";
      illustrationType: string;
      parameters: Record<string, unknown>;
      altText: string;
      caption?: string;
    }
  | {
      type: "image_asset";
      assetId: string | null;
      description: string;
      altText: string;
      generationBrief?: string;
    }
  | {
      type: "vocabulary_list";
      title?: string;
      entries: Array<{
        term: string;
        pronunciation?: string;
        definition: string;
      }>;
    }
  | {
      type: "reading_passage";
      title?: string;
      paragraphs: string[];
      attribution?: string;
    }
  | {
      type: "character_practice";
      character: string;
      pronunciation?: string;
      meaning?: string;
      traceRows: number;
    }
) & { boxStyle?: WorkbookBoxStyle };

export type WorkbookLearnBlock =
  | WorkbookLearnBlockLeaf
  | {
      id: string;
      type: "layout_row";
      columnGap?: number;
      columns: Array<{
        id: string;
        blocks: WorkbookLearnBlockLeaf[];
      }>;
      boxStyle?: WorkbookBoxStyle;
    };

export type WorkbookExerciseLeaf = {
  id: string;
  type:
    | "circle_choice"
    | "multiple_choice"
    | "matching"
    | "fill_in_blank"
    | "short_answer"
    | "write"
    | "draw_box";
  prompt: string;
  answerKeyText?: string;
  standardsCodes: string[];
  options?: string[];
  correctAnswer?: string | string[];
  pairs?: Array<{ id: string; left: string; right: string }>;
  rightOrder?: string[];
  leftLabel?: string;
  rightLabel?: string;
  sampleAnswer?: string;
  writingLines?: number;
  boxHeightMm?: number;
  boxStyle?: WorkbookBoxStyle;
};

export type WorkbookExercise =
  | WorkbookExerciseLeaf
  | {
      id: string;
      type: "layout_row";
      columnGap?: number;
      columns: Array<{
        id: string;
        exercises: WorkbookExerciseLeaf[];
      }>;
      boxStyle?: WorkbookBoxStyle;
    };

export type WorkbookContent = {
  schemaVersion: 1;
  title: string;
  subtitle?: string;
  editionLabel: string;
  gradeLabel: string;
  subjectLabel: string;
  isCore: boolean;
  introduction: WorkbookLearnBlock[];
  chapters: Array<{
    id: string;
    title: string;
    tocTitle?: string;
    description?: string;
    lessons: Array<{
      id: string;
      title: string;
      subtitle?: string;
      boxStyle?: WorkbookBoxStyle;
      learnSectionBoxStyle?: WorkbookBoxStyle;
      practiceSectionBoxStyle?: WorkbookBoxStyle;
      standardsCodes: string[];
      needsIllustration: boolean;
      learnBlocks: WorkbookLearnBlock[];
      exercises: WorkbookExercise[];
      notesForParent?: string;
    }>;
  }>;
};

export type WorkbookCatalogPlan = {
  schemaVersion: 2;
  curriculumName: string;
  courses: Array<{
    stableKey: string;
    curriculumSubjectId?: string | null;
    subjectKey: string;
    subjectLabel: string;
    status: "inherited" | "modified" | "new" | "retired";
    academicStandardOverrideKey: string | null;
    standardCode: string | null;
    standardLabel: string | null;
    themeOverrideVersionId?: string | null;
    boundaryNotes: string;
    coverageNotes: string;
    pipelineKey: string | null;
    workbooks: Array<{
      stableKey: string;
      title: string;
      domains: string[];
      gradeMin: number | null;
      gradeMax: number | null;
      languageCode: string;
      localeCode: string | null;
      layoutProfile: "standard" | "reader";
      scriptProfile: "latin" | "japanese";
    }>;
  }>;
};

export type WorkbookStudioProject = {
  id: string;
  courseId: string;
  curriculumId: string | null;
  courseStableKey: string;
  nativeWorkbookId: string | null;
  catalogPlanKey: string | null;
  slug: string;
  title: string;
  subjectKey: string;
  subjectLabel: string;
  gradeMin: number;
  gradeMax: number;
  languageCode: string;
  localeCode: string | null;
  layoutProfile: string;
  scriptProfile: string;
  coverImageObjectPath: string | null;
  coverImageAlt: string | null;
  coverImageSha256: string | null;
  status: "draft" | "generating" | "review" | "ready" | "released" | "archived";
  themeOverrideVersionId: string | null;
  generationPromptVersionId: string | null;
  currentRevisionId: string | null;
  publishedRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkbookStudioSummary = {
  projects: WorkbookStudioProject[];
  curricula: Array<{
    id: string;
    slug: string;
    name: string;
    academicStandardKey: string;
    gradeLevel: number;
    languageCode: string;
    status: string;
    defaultThemeVersionId: string;
    updatedAt: string;
  }>;
  courses: Array<{
    id: string;
    curriculumId: string | null;
    stableKey: string;
    curriculumSubjectId: string;
    status: "inherited" | "modified" | "new" | "retired";
    gradeMin: number;
    gradeMax: number;
    type: "core" | "elective";
    academicStandardOverrideKey: string | null;
    standardCode: string | null;
    standardLabel: string | null;
    themeOverrideVersionId: string | null;
    boundaryNotes: string | null;
    coverageNotes: string | null;
    pipelineKey: string | null;
    subjectKey: string;
    subjectLabel: string;
    subjectAcademicStandardKey: string;
  }>;
  curriculumSubjects: Array<{
    id: string;
    academicStandardKey: string;
    key: string;
    label: string;
    curriculumAreaKey: string;
    aliases: string[];
    displayOrder: number;
  }>;
  academicStandards: Array<{
    key: string;
    label: string;
    defaultLanguageCode: string;
    languages: Array<{
      code: string;
      label: string;
    }>;
  }>;
  themes: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    status: string;
    publishedVersionId: string | null;
    versionNumber: number | null;
    colorInk: string | null;
    colorEarth: string | null;
    colorLeaf: string | null;
    colorLeafDark: string | null;
    colorCream: string | null;
    colorSand: string | null;
    colorCanvas: string | null;
    colorCoverAccent: string | null;
    colorCoverAccentSoft: string | null;
    headingFontFamily: string | null;
    bodyFontFamily: string | null;
    pageSize: string | null;
    pageMarginTopMm: number | null;
    pageMarginRightMm: number | null;
    pageMarginBottomMm: number | null;
    pageMarginLeftMm: number | null;
    firstPageMarginTopMm: number | null;
    firstPageMarginRightMm: number | null;
    firstPageMarginBottomMm: number | null;
    firstPageMarginLeftMm: number | null;
    bodyFontSizePt: number | null;
    bodyLineHeight: number | null;
  }>;
  prompts: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    kind: string;
    status: string;
    publishedVersionId: string | null;
    versionNumber: number | null;
    promptText: string | null;
    configurationJson: Record<string, unknown> | null;
    sourceJson: Record<string, unknown> | null;
  }>;
  rules: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    ruleKind: string;
    status: string;
    publishedVersionId: string | null;
    versionNumber: number | null;
    scopeType: string | null;
    subjectKey: string | null;
    gradeMin: number | null;
    gradeMax: number | null;
    languageCode: string | null;
    stage: string | null;
    enforcement: string | null;
    instructionText: string | null;
    parametersJson: Record<string, unknown> | null;
  }>;
  illustrationTypes: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
  }>;
  activeBatches: Array<{
    id: string;
    kind: string;
    status: string;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
  }>;
};

export type WorkbookStudioProjectDetail = {
  project: WorkbookStudioProject;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    source: "manual" | "ai" | "imported";
    contentJson: WorkbookContent;
    validationJson: {
      issues?: Array<{
        severity: "error" | "warning";
        code: string;
        message: string;
        path: string;
      }>;
    };
    changeNotes: string | null;
    createdAt: string;
  }>;
  currentRevision: {
    id: string;
    revisionNumber: number;
    source: "manual" | "ai" | "imported";
    contentJson: WorkbookContent;
    validationJson: {
      issues?: Array<{
        severity: "error" | "warning";
        code: string;
        message: string;
        path: string;
      }>;
    };
    changeNotes: string | null;
    createdAt: string;
  } | null;
  publishedRevision: { id: string; revisionNumber: number } | null;
  effectiveTheme: {
    id: string;
    themeId: string;
    versionNumber: number;
    colorInk: string;
    colorEarth: string;
    colorLeaf: string;
    colorLeafDark: string;
    colorCream: string;
    colorSand: string;
    colorCanvas: string;
    colorCoverAccent: string;
    colorCoverAccentSoft: string;
  };
  generationRuns: Array<{
    id: string;
    status: string;
    currentStage: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
  renderRuns: Array<{
    id: string;
    status: string;
    pageCount: number | null;
    lastError: string | null;
    createdAt: string;
  }>;
};

export type WorkbookStudioCurriculumDetail = {
  curriculum: WorkbookStudioSummary["curricula"][number] & {
    currentRevisionId: string | null;
    publishedRevisionId: string | null;
    standardCode: string | null;
    standardLabel: string | null;
  };
  revisions: Array<{
    id: string;
    revisionNumber: number;
    source: "manual" | "ai" | "imported";
    planJson: Record<string, unknown>;
    validationJson: Record<string, unknown>;
    createdAt: string;
  }>;
  currentRevision: {
    id: string;
    revisionNumber: number;
    source: "manual" | "ai" | "imported";
    planJson: Record<string, unknown>;
    createdAt: string;
  } | null;
  publishedRevision: { id: string; revisionNumber: number } | null;
  courses: WorkbookStudioSummary["courses"];
  projects: WorkbookStudioProject[];
  batches: WorkbookStudioSummary["activeBatches"];
};

export async function listAdminWorkbookStudio(userId: string) {
  const response = await requireOk(
    await backendFetch(
      `${getBackendUrl()}/internal/workbook-studio/admin?userId=${encodeURIComponent(userId)}`,
      { cache: "no-store" },
    ),
    "Could not load Workbook Studio.",
  );
  return response.json() as Promise<WorkbookStudioSummary>;
}

export async function getAdminWorkbookStudioProject(
  userId: string,
  projectId: string,
) {
  const query = new URLSearchParams({ userId, projectId });
  const response = await requireOk(
    await backendFetch(
      `${getBackendUrl()}/internal/workbook-studio/admin/project?${query}`,
      { cache: "no-store" },
    ),
    "Could not load the workbook project.",
  );
  return response.json() as Promise<WorkbookStudioProjectDetail>;
}

export function getAdminWorkbookStudioCoverPreviewResponse(
  userId: string,
  projectId: string,
  format: "pdf" | "png" = "pdf",
) {
  const query = new URLSearchParams({ userId, projectId, format });
  return backendFetch(
    `${getBackendUrl()}/internal/workbook-studio/admin/project/cover-preview?${query}`,
    { cache: "no-store" },
  );
}

export async function getAdminWorkbookStudioCurriculum(
  userId: string,
  curriculumId: string,
) {
  const query = new URLSearchParams({ userId, curriculumId });
  const response = await requireOk(
    await backendFetch(
      `${getBackendUrl()}/internal/workbook-studio/admin/curriculum?${query}`,
      { cache: "no-store" },
    ),
    "Could not load the workbook curriculum.",
  );
  return response.json() as Promise<WorkbookStudioCurriculumDetail>;
}

export function createWorkbookStudioProject(input: Record<string, unknown>) {
  return postJson<{ project: WorkbookStudioProject }>(
    "/internal/workbook-studio/admin/project/create",
    input,
    "Could not create the workbook project.",
  );
}

export function queueWorkbookGradeLevelGeneration(
  input: Record<string, unknown>,
) {
  return postJson<{ curriculum: { id: string }; batch: { id: string } }>(
    "/internal/workbook-studio/admin/grade/generate",
    input,
    "Could not queue grade-level generation.",
  );
}

export function createWorkbookStudioCurriculum(input: Record<string, unknown>) {
  return postJson<{ curriculum: { id: string } }>(
    "/internal/workbook-studio/admin/curriculum/create",
    input,
    "Could not create the curriculum.",
  );
}

export function saveWorkbookStudioCurriculum(input: Record<string, unknown>) {
  return postJson<{ revision: { id: string; revisionNumber: number } }>(
    "/internal/workbook-studio/admin/curriculum/save",
    input,
    "Could not save the curriculum.",
  );
}

export function publishWorkbookStudioCurriculum(
  input: Record<string, unknown>,
) {
  return postJson<{ curriculum: { id: string; status: string } }>(
    "/internal/workbook-studio/admin/curriculum/publish",
    input,
    "Could not publish the curriculum.",
  );
}

export function generateWorkbookStudioCurriculum(
  input: Record<string, unknown>,
) {
  return postJson<{
    batch: { id: string };
    createdProjectIds: string[];
    existingProjectIds: string[];
  }>(
    "/internal/workbook-studio/admin/curriculum/generate",
    input,
    "Could not generate the curriculum workbooks.",
  );
}

export function saveWorkbookStudioRevision(input: Record<string, unknown>) {
  return postJson<{
    revision: { id: string; revisionNumber: number };
    classification: { classification: string };
  }>(
    "/internal/workbook-studio/admin/project/save",
    input,
    "Could not save the workbook revision.",
  );
}

export function queueWorkbookStudioRender(input: Record<string, unknown>) {
  return postJson<{ run: { id: string } }>(
    "/internal/workbook-studio/admin/project/render",
    input,
    "Could not queue the workbook render.",
  );
}

export function queueWorkbookStudioRelease(input: Record<string, unknown>) {
  return postJson<{
    batch: { id: string };
    plan: { mode: string; editionLabel: string };
  }>(
    "/internal/workbook-studio/admin/project/release",
    input,
    "Could not queue the workbook release.",
  );
}

export function setWorkbookStudioProjectTheme(input: Record<string, unknown>) {
  return postJson<{ jobId: string | null; themeVersionId: string }>(
    "/internal/workbook-studio/admin/project/theme",
    input,
    "Could not change the workbook theme.",
  );
}

export function setWorkbookStudioCurriculumTheme(
  input: Record<string, unknown>,
) {
  return postJson<{ batchId: string | null; affectedProjects: number }>(
    "/internal/workbook-studio/admin/curriculum/theme",
    input,
    "Could not change the curriculum theme.",
  );
}

export function setWorkbookStudioCourseTheme(
  input: Record<string, unknown>,
) {
  return postJson<{ batchId: string | null; affectedProjects: number }>(
    "/internal/workbook-studio/admin/course/theme",
    input,
    "Could not change the course theme.",
  );
}

export function saveWorkbookStudioTheme(input: Record<string, unknown>) {
  return postJson<{
    themeId: string;
    version: { id: string; versionNumber: number };
  }>(
    "/internal/workbook-studio/admin/theme/save",
    input,
    "Could not save the workbook theme.",
  );
}

export function saveWorkbookStudioPrompt(input: Record<string, unknown>) {
  return postJson<{
    promptId: string;
    version: { id: string; versionNumber: number };
  }>(
    "/internal/workbook-studio/admin/prompt/save",
    input,
    "Could not save the generation prompt.",
  );
}

export function saveWorkbookStudioRule(input: Record<string, unknown>) {
  return postJson<{
    ruleId: string;
    version: { id: string; versionNumber: number };
  }>(
    "/internal/workbook-studio/admin/rule/save",
    input,
    "Could not save the generation rule.",
  );
}
