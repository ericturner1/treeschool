import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";

function getBackendUrl() {
  return process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;
}

export type ParentCurriculumSubject = {
  id: string;
  parentId: string | null;
  type: string;
  title: string;
  description: string | null;
  slug: string | null;
  order: number;
  displayOrder: number;
  introducedInWeek: number | null;
};

export type ParentCurriculumProgram = ParentCurriculumSubject & {
  gradeTitles: string[];
};

export type ParentCurriculumProgramSubject = ParentCurriculumSubject & {
  gradeId: string;
  gradeTitle: string;
  gradeOrder: number;
};

export type ParentCurriculumTreeNode = ParentCurriculumSubject & {
  depth: number;
  lessonCount: number;
  queuedLessonCount: number;
  generatingLessonCount: number;
  lessons: Array<{
    id: string;
    title: string;
    status: string;
    profileId: string;
    profileName: string | null;
    updatedAt: string;
    isQueued: boolean;
    isGenerating: boolean;
    isRetrying: boolean;
    isError: boolean;
  }>;
};

export async function listParentCurriculumSubjects(languageCode = "en-US") {
  const params = new URLSearchParams({ languageCode });
  const response = await backendFetch(`${getBackendUrl()}/internal/curriculum/subjects?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch curriculum subjects.");
  }

  const payload = (await response.json()) as {
    subjects: ParentCurriculumSubject[];
  };

  return payload.subjects;
}

export async function listParentCurriculumPrograms(languageCode = "en-US") {
  const params = new URLSearchParams({ languageCode });
  const response = await backendFetch(`${getBackendUrl()}/internal/curriculum/programs?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch curriculum programs.");
  }

  const payload = (await response.json()) as {
    programs: ParentCurriculumProgram[];
  };

  return payload.programs;
}

export async function listParentCurriculumSubjectsByProgram(
  programId: string,
  languageCode = "en-US"
) {
  const params = new URLSearchParams({ programId, languageCode });
  const response = await backendFetch(
    `${getBackendUrl()}/internal/curriculum/program-subjects?${params.toString()}`,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch curriculum subjects.");
  }

  const payload = (await response.json()) as {
    subjects: ParentCurriculumProgramSubject[];
  };

  return payload.subjects;
}

export async function getParentCurriculumTree(
  slug: string,
  languageCode = "en-US",
  parentUserId?: string
) {
  const params = new URLSearchParams({ slug, languageCode });
  if (parentUserId) {
    params.set("parentUserId", parentUserId);
  }
  const response = await backendFetch(`${getBackendUrl()}/internal/curriculum/tree?${params.toString()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Failed to fetch curriculum tree.");
  }

  const payload = (await response.json()) as {
    nodes: ParentCurriculumTreeNode[];
  };

  return payload.nodes;
}
