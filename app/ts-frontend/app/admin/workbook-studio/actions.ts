"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../../../lib/auth/server";
import {
  createWorkbookStudioCurriculum,
  createWorkbookStudioProject,
  generateWorkbookStudioCurriculum,
  publishWorkbookStudioCurriculum,
  queueWorkbookStudioRelease,
  queueWorkbookGradeLevelGeneration,
  queueWorkbookStudioRender,
  saveWorkbookStudioCurriculum,
  saveWorkbookStudioRevision,
  setWorkbookStudioCourseTheme,
  setWorkbookStudioCurriculumTheme,
  setWorkbookStudioProjectTheme,
  saveWorkbookStudioTheme,
  saveWorkbookStudioPrompt,
  saveWorkbookStudioRule,
  type WorkbookCatalogPlan,
  type WorkbookContent,
} from "../../../lib/workbook-studio/server";

async function requireUserId() {
  const user = await getCurrentUser();
  if (!user?.id) throw new Error("Sign in again to use Workbook Studio.");
  return user.id;
}

export async function queueWorkbookGradeLevelGenerationAction(input: {
  curriculumId: string;
  catalogPromptVersionId: string;
  workbookPromptVersionId: string;
}) {
  try {
    const result = await queueWorkbookGradeLevelGeneration({
      ...input,
      userId: await requireUserId(),
    });
    revalidatePath("/admin/workbook-studio");
    revalidatePath(
      `/admin/workbook-studio/curricula/${input.curriculumId}`,
    );
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not queue grade-level generation.",
    };
  }
}

export async function createWorkbookStudioCurriculumAction(input: {
  name: string;
  academicStandardKey: string;
  standardCode: string | null;
  standardLabel: string | null;
  gradeLevel: number;
  languageCode: string;
}) {
  try {
    const result = await createWorkbookStudioCurriculum({
      ...input,
      userId: await requireUserId(),
    });
    revalidatePath("/admin/workbook-studio");
    return { ok: true as const, curriculumId: result.curriculum.id };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not create the curriculum.",
    };
  }
}

export async function saveWorkbookStudioCurriculumAction(input: {
  curriculumId: string;
  plan: WorkbookCatalogPlan;
  workbookPromptVersionId: string | null;
}) {
  try {
    const result = await saveWorkbookStudioCurriculum({
      ...input,
      userId: await requireUserId(),
    });
    revalidatePath(`/admin/workbook-studio/curricula/${input.curriculumId}`);
    revalidatePath("/admin/workbook-studio");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not save the curriculum.",
    };
  }
}

export async function publishWorkbookStudioCurriculumAction(
  curriculumId: string,
) {
  try {
    const result = await publishWorkbookStudioCurriculum({
      curriculumId,
      userId: await requireUserId(),
    });
    revalidatePath(`/admin/workbook-studio/curricula/${curriculumId}`);
    revalidatePath("/admin/workbook-studio");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not publish the curriculum.",
    };
  }
}

export async function generateWorkbookStudioCurriculumAction(input: {
  curriculumId: string;
  workbookPromptVersionId: string | null;
}) {
  try {
    const result = await generateWorkbookStudioCurriculum({
      ...input,
      userId: await requireUserId(),
    });
    revalidatePath(`/admin/workbook-studio/curricula/${input.curriculumId}`);
    revalidatePath("/admin/workbook-studio");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not generate the curriculum workbooks.",
    };
  }
}

export async function setWorkbookStudioProjectThemeAction(
  projectId: string,
  themeVersionId: string | null,
) {
  try {
    const result = await setWorkbookStudioProjectTheme({
      userId: await requireUserId(),
      projectId,
      themeVersionId,
    });
    revalidatePath(`/admin/workbook-studio/${projectId}`);
    revalidatePath("/admin/workbook-studio");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Could not change the theme.",
    };
  }
}

export async function setWorkbookStudioCurriculumThemeAction(
  curriculumId: string,
  themeVersionId: string,
) {
  try {
    const result = await setWorkbookStudioCurriculumTheme({
      userId: await requireUserId(),
      curriculumId,
      themeVersionId,
    });
    revalidatePath("/admin/workbook-studio");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not change the curriculum theme.",
    };
  }
}

export async function setWorkbookStudioCourseThemeAction(
  curriculumId: string,
  courseId: string,
  themeVersionId: string | null,
) {
  try {
    const result = await setWorkbookStudioCourseTheme({
      userId: await requireUserId(),
      courseId,
      themeVersionId,
    });
    revalidatePath(`/admin/workbook-studio/curricula/${curriculumId}`);
    revalidatePath("/admin/workbook-studio");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not change the course theme.",
    };
  }
}

export async function saveWorkbookStudioThemeAction(
  input: Record<string, unknown>,
) {
  try {
    const result = await saveWorkbookStudioTheme({
      ...input,
      userId: await requireUserId(),
    });
    revalidatePath("/admin/workbook-studio");
    revalidatePath("/admin/workbook-studio/themes");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Could not save the theme.",
    };
  }
}

export async function saveWorkbookStudioPromptAction(
  input: Record<string, unknown>,
) {
  try {
    const result = await saveWorkbookStudioPrompt({
      ...input,
      userId: await requireUserId(),
    });
    revalidatePath("/admin/workbook-studio");
    revalidatePath("/admin/workbook-studio/prompts");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Could not save the prompt.",
    };
  }
}

export async function saveWorkbookStudioRuleAction(
  input: Record<string, unknown>,
) {
  try {
    const result = await saveWorkbookStudioRule({
      ...input,
      userId: await requireUserId(),
    });
    revalidatePath("/admin/workbook-studio");
    revalidatePath("/admin/workbook-studio/rules");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Could not save the rule.",
    };
  }
}

export async function createWorkbookStudioProjectAction(input: {
  courseId: string;
  title: string;
  languageCode: string;
  localeCode: string | null;
  layoutProfile: string;
  scriptProfile: string;
  authoringMode: "manual" | "generate";
  generationPromptVersionId: string | null;
}) {
  try {
    const result = await createWorkbookStudioProject({
      ...input,
      userId: await requireUserId(),
    });
    revalidatePath("/admin/workbook-studio");
    return { ok: true as const, projectId: result.project.id };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not create the workbook.",
    };
  }
}

export async function saveWorkbookStudioRevisionAction(input: {
  projectId: string;
  content: WorkbookContent;
  changeNotes?: string;
}) {
  try {
    const result = await saveWorkbookStudioRevision({
      ...input,
      userId: await requireUserId(),
      source: "manual",
    });
    revalidatePath(`/admin/workbook-studio/${input.projectId}`);
    revalidatePath("/admin/workbook-studio");
    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Could not save the workbook.",
    };
  }
}

export async function queueWorkbookStudioRenderAction(projectId: string) {
  try {
    const result = await queueWorkbookStudioRender({
      userId: await requireUserId(),
      projectId,
    });
    revalidatePath(`/admin/workbook-studio/${projectId}`);
    return { ok: true as const, renderRunId: result.run.id };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Could not queue the PDF.",
    };
  }
}

export async function queueWorkbookStudioReleaseAction(input: {
  projectId: string;
  description: string;
  curriculumAreaKey: string;
  type: "core" | "elective";
  priceInCents: number;
  coverageTags: string[];
  forceNewEdition: boolean;
}) {
  try {
    const result = await queueWorkbookStudioRelease({
      userId: await requireUserId(),
      projectId: input.projectId,
      forceNewEdition: input.forceNewEdition,
      catalog: {
        description: input.description,
        curriculumAreaKey: input.curriculumAreaKey,
        type: input.type,
        priceInCents: input.priceInCents,
        currencyCode: "USD",
        coverageTags: input.coverageTags,
        prerequisiteWorkbookId: null,
      },
    });
    revalidatePath(`/admin/workbook-studio/${input.projectId}`);
    revalidatePath("/admin/workbook-studio");
    return { ok: true as const, ...result.plan };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error ? error.message : "Could not queue the release.",
    };
  }
}
