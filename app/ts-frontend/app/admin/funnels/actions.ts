"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth/server";
import {
  completeAdminFunnelExperiment,
  copyAdminFunnelStepToFunnel,
  createAdminFunnelPageVariant,
  createAdminFunnelTestSale,
  deleteAdminFunnel,
  deleteAdminFunnelAutomation,
  deleteAdminFunnelStep,
  duplicateAdminFunnelStep,
  generateAdminFunnelPageDraft,
  promoteAdminFunnelExperimentWinner,
  publishAdminFunnelPage,
  reorderAdminFunnelSteps,
  saveAdminFunnel,
  saveAdminFunnelAutomation,
  saveAdminFunnelPageDraft,
  saveAdminFunnelStep,
  startAdminFunnelExperiment,
  updateAdminCodeFunnelExperiment,
  unpublishAdminFunnelPage,
} from "../../../lib/funnels/server";
import { buildAdminFunnelStepSaveInput } from "../../../lib/funnels/admin-step-save";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function requireUser(next = "/admin/funnels") {
  const user = await getCurrentUser();
  if (!user?.id) redirect(`/p/signin?next=${encodeURIComponent(next)}`);
  return { ...user, id: user.id };
}

function funnelPath(slug: string, params?: Record<string, string>) {
  const query = new URLSearchParams(params);
  return `/admin/funnels/${encodeURIComponent(slug)}${query.size > 0 ? `?${query}` : ""}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export async function saveFunnelAction(formData: FormData) {
  const user = await requireUser();
  const id = value(formData, "id") || undefined;
  let destination: string;
  try {
    const result = await saveAdminFunnel({
      id,
      userId: user.id,
      name: value(formData, "name"),
      slug: value(formData, "slug"),
      badgeLabel: value(formData, "badgeLabel") || null,
      audience: value(formData, "audience"),
      objective: value(formData, "objective"),
      status: value(formData, "status") || "draft"
    });
    revalidatePath("/admin/funnels");
    revalidatePath(`/admin/funnels/${result.funnel.slug}`);
    destination = funnelPath(result.funnel.slug, {
      message: id ? "Funnel settings updated." : "Funnel created."
    });
  } catch (error) {
    destination = id
      ? funnelPath(value(formData, "currentSlug") || value(formData, "slug"), {
          error: errorMessage(error)
        })
      : `/admin/funnels?error=${encodeURIComponent(errorMessage(error))}`;
  }
  redirect(destination);
}

export async function deleteFunnelAction(formData: FormData) {
  const user = await requireUser();
  const funnelId = value(formData, "funnelId");
  const funnelSlug = value(formData, "funnelSlug");
  let destination: string;
  try {
    await deleteAdminFunnel({ userId: user.id, funnelId });
    revalidatePath("/admin/funnels");
    revalidatePath(funnelPath(funnelSlug));
    destination = "/admin/funnels?message=Funnel%20deleted.";
  } catch (error) {
    destination = funnelPath(funnelSlug, { error: errorMessage(error) });
  }
  redirect(destination);
}

export async function saveFunnelStepAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const user = await requireUser(funnelPath(funnelSlug));
  const id = value(formData, "id") || undefined;
  let destination: string;
  try {
    const parsed = buildAdminFunnelStepSaveInput(formData, user.id);
    const result = await saveAdminFunnelStep(parsed.input);
    revalidatePath("/admin/funnels");
    revalidatePath(funnelPath(funnelSlug));
    if (result.step.routePath) revalidatePath(result.step.routePath);
    destination = funnelPath(funnelSlug, {
      step: result.step.id,
      message: id ? "Funnel step updated." : "Funnel step added."
    });
  } catch (error) {
    const params: Record<string, string> = { error: errorMessage(error) };
    if (id) params.step = id;
    destination = funnelPath(funnelSlug, params);
  }
  redirect(destination);
}

export async function duplicateFunnelStepAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const user = await requireUser(funnelPath(funnelSlug));
  let destination: string;
  try {
    const result = await duplicateAdminFunnelStep({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId: value(formData, "stepId")
    });
    revalidatePath("/admin/funnels");
    revalidatePath(funnelPath(funnelSlug));
    destination = funnelPath(funnelSlug, {
      step: result.step.id,
      message: "Step duplicated as a draft."
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, { error: errorMessage(error) });
  }
  redirect(destination);
}

export async function copyFunnelStepToFunnelAction(formData: FormData) {
  const currentFunnelSlug = value(formData, "currentFunnelSlug");
  const stepId = value(formData, "stepId");
  const user = await requireUser(funnelPath(currentFunnelSlug, { step: stepId }));
  let destination: string;
  try {
    const result = await copyAdminFunnelStepToFunnel({
      userId: user.id,
      sourceFunnelId: value(formData, "sourceFunnelId"),
      destinationFunnelId: value(formData, "destinationFunnelId"),
      stepId
    });
    revalidatePath("/admin/funnels");
    revalidatePath(funnelPath(currentFunnelSlug));
    revalidatePath(funnelPath(result.destinationFunnel.slug));
    destination = funnelPath(result.destinationFunnel.slug, {
      step: result.step.id,
      message: "Page copied here as a draft."
    });
  } catch (error) {
    destination = funnelPath(currentFunnelSlug, {
      step: stepId,
      error: errorMessage(error)
    });
  }
  redirect(destination);
}

export async function deleteFunnelStepAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const user = await requireUser(funnelPath(funnelSlug));
  let destination: string;
  try {
    await deleteAdminFunnelStep({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId: value(formData, "stepId")
    });
    revalidatePath("/admin/funnels");
    revalidatePath(funnelPath(funnelSlug));
    destination = funnelPath(funnelSlug, { message: "Funnel step deleted." });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      step: value(formData, "stepId"),
      error: errorMessage(error)
    });
  }
  redirect(destination);
}

export async function reorderFunnelStepsAction(funnelId: string, orderedIds: string[]) {
  const user = await requireUser("/admin/funnels");
  try {
    await reorderAdminFunnelSteps({ userId: user.id, funnelId, orderedIds });
    revalidatePath("/admin/funnels");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) };
  }
}

export async function saveFunnelPageDraftAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const stepId = value(formData, "stepId");
  const user = await requireUser(funnelPath(funnelSlug, { step: stepId }));
  let destination: string;

  try {
    const contentJson = value(formData, "contentJson");
    if (!contentJson) throw new Error("The page document is missing.");
    const result = await saveAdminFunnelPageDraft({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId,
      pageId: value(formData, "pageId") || null,
      source: "manual",
      content: JSON.parse(contentJson) as unknown,
      seo: {
        title: value(formData, "seoTitle"),
        description: value(formData, "seoDescription"),
        noIndex: formData.has("noIndex")
      }
    });
    revalidatePath(funnelPath(funnelSlug));
    revalidatePath(
      `/admin/funnels/${encodeURIComponent(funnelSlug)}/preview/${encodeURIComponent(stepId)}`
    );
    destination = funnelPath(funnelSlug, {
      step: stepId,
      ...(result.page.id ? { page: result.page.id } : {}),
      message: `Draft revision ${result.page.latestRevisionNumber} saved. The live page was not changed.`
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      step: stepId,
      error: errorMessage(error)
    });
  }

  redirect(destination);
}

export async function publishFunnelPageAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const stepId = value(formData, "stepId");
  const user = await requireUser(funnelPath(funnelSlug, { step: stepId }));
  let destination: string;

  try {
    const result = await publishAdminFunnelPage({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId,
      pageId: value(formData, "pageId") || null
    });
    revalidatePath("/admin/funnels");
    revalidatePath(funnelPath(funnelSlug));
    revalidatePath(result.publicPath);
    destination = funnelPath(funnelSlug, {
      step: stepId,
      ...(value(formData, "pageId") ? { page: value(formData, "pageId") } : {}),
      message: `Revision ${result.revisionNumber} published at ${result.publicPath}.`
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      step: stepId,
      error: errorMessage(error)
    });
  }

  redirect(destination);
}

export async function unpublishFunnelPageAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const stepId = value(formData, "stepId");
  const user = await requireUser(funnelPath(funnelSlug, { step: stepId }));
  let destination: string;

  try {
    await unpublishAdminFunnelPage({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId,
      pageId: value(formData, "pageId") || null
    });
    revalidatePath("/admin/funnels");
    revalidatePath(funnelPath(funnelSlug));
    revalidatePath(
      `/f/${encodeURIComponent(funnelSlug)}`
    );
    destination = funnelPath(funnelSlug, {
      step: stepId,
      ...(value(formData, "pageId") ? { page: value(formData, "pageId") } : {}),
      message: "Managed page unpublished. Its revisions are preserved."
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      step: stepId,
      error: errorMessage(error)
    });
  }

  redirect(destination);
}

export async function createFunnelPageVariantAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const stepId = value(formData, "stepId");
  const user = await requireUser(funnelPath(funnelSlug, { step: stepId }));
  let destination: string;
  try {
    const result = await createAdminFunnelPageVariant({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId,
      sourcePageId: value(formData, "pageId") || null,
      name: value(formData, "name") || null
    });
    revalidatePath(funnelPath(funnelSlug));
    destination = funnelPath(funnelSlug, {
      step: stepId,
      page: result.page.id,
      message: `“${result.page.name}” created as a draft variant.`
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      step: stepId,
      error: errorMessage(error)
    });
  }
  redirect(destination);
}

export async function generateFunnelPageAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const stepId = value(formData, "stepId");
  const user = await requireUser(funnelPath(funnelSlug, { step: stepId }));
  let destination: string;
  try {
    const result = await generateAdminFunnelPageDraft({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId,
      pageId: value(formData, "pageId") || null,
      mode: value(formData, "mode") || "rewrite",
      prompt: value(formData, "prompt"),
      variantName: value(formData, "variantName") || null
    });
    revalidatePath(funnelPath(funnelSlug));
    destination = funnelPath(funnelSlug, {
      step: stepId,
      page: result.page.id,
      message: `AI draft revision ${result.page.latestRevisionNumber} is ready for review. Nothing was published.`
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      step: stepId,
      ...(value(formData, "pageId") ? { page: value(formData, "pageId") } : {}),
      error: errorMessage(error)
    });
  }
  redirect(destination);
}

export async function startFunnelExperimentAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const stepId = value(formData, "stepId");
  const user = await requireUser(funnelPath(funnelSlug, { step: stepId }));
  let destination: string;
  try {
    const pageIds = formData.getAll("variantPageId").map(String);
    await startAdminFunnelExperiment({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId,
      name: value(formData, "name"),
      goalEvent: value(formData, "goalEvent"),
      variants: pageIds.map((pageId) => ({
        pageId,
        weight: Number(value(formData, `weight-${pageId}`))
      }))
    });
    revalidatePath(funnelPath(funnelSlug));
    revalidatePath(`/f/${encodeURIComponent(funnelSlug)}`);
    destination = funnelPath(funnelSlug, {
      step: stepId,
      message: "A/B test started. Visitors will now receive a stable page assignment."
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      step: stepId,
      error: errorMessage(error)
    });
  }
  redirect(destination);
}

export async function completeFunnelExperimentAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const stepId = value(formData, "stepId");
  const user = await requireUser(funnelPath(funnelSlug, { step: stepId }));
  let destination: string;
  try {
    await completeAdminFunnelExperiment({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId,
      experimentId: value(formData, "experimentId")
    });
    revalidatePath(funnelPath(funnelSlug));
    destination = funnelPath(funnelSlug, {
      step: stepId,
      message: "A/B test completed. New visitors now see the control page."
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      step: stepId,
      error: errorMessage(error)
    });
  }
  redirect(destination);
}

export async function updateCodeFunnelExperimentAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const stepId = value(formData, "stepId");
  const user = await requireUser(funnelPath(funnelSlug, { step: stepId, tab: "experiment" }));
  const action = value(formData, "experimentAction") as "pause" | "resume" | "complete";
  let destination: string;
  try {
    await updateAdminCodeFunnelExperiment({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId,
      action,
      winnerStepId: value(formData, "winnerStepId") || null
    });
    revalidatePath(funnelPath(funnelSlug));
    revalidatePath("/first-grade-curriculum");
    const message = action === "pause"
      ? "A/B test paused. The control page is now serving all visitors."
      : action === "resume"
        ? "A/B test resumed. Traffic is splitting between the variants again."
        : "A/B test completed. The selected winner is now serving all visitors.";
    destination = funnelPath(funnelSlug, { step: stepId, tab: "experiment", message });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      step: stepId,
      tab: "experiment",
      error: errorMessage(error)
    });
  }
  redirect(destination);
}

export async function promoteFunnelExperimentWinnerAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const stepId = value(formData, "stepId");
  const pageId = value(formData, "pageId");
  const user = await requireUser(funnelPath(funnelSlug, { step: stepId }));
  let destination: string;
  try {
    await promoteAdminFunnelExperimentWinner({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      stepId,
      experimentId: value(formData, "experimentId"),
      pageId
    });
    revalidatePath(funnelPath(funnelSlug));
    revalidatePath(`/f/${encodeURIComponent(funnelSlug)}`);
    destination = funnelPath(funnelSlug, {
      step: stepId,
      page: pageId,
      message: "Winning page promoted to control. Experiment history was preserved."
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      step: stepId,
      error: errorMessage(error)
    });
  }
  redirect(destination);
}

export async function saveFunnelAutomationAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const user = await requireUser(funnelPath(funnelSlug, { tab: "automation" }));
  let destination: string;
  try {
    await saveAdminFunnelAutomation({
      id: value(formData, "ruleId") || null,
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      name: value(formData, "name"),
      triggerEvent: value(formData, "triggerEvent"),
      actionType: "add_tag",
      tag: value(formData, "tag"),
      active: formData.has("active")
    });
    revalidatePath(funnelPath(funnelSlug));
    destination = funnelPath(funnelSlug, {
      tab: "automation",
      message: "Automation saved."
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      tab: "automation",
      error: errorMessage(error)
    });
  }
  redirect(destination);
}

export async function deleteFunnelAutomationAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const user = await requireUser(funnelPath(funnelSlug, { tab: "automation" }));
  let destination: string;
  try {
    await deleteAdminFunnelAutomation({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      ruleId: value(formData, "ruleId")
    });
    revalidatePath(funnelPath(funnelSlug));
    destination = funnelPath(funnelSlug, {
      tab: "automation",
      message: "Automation deleted."
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      tab: "automation",
      error: errorMessage(error)
    });
  }
  redirect(destination);
}

export async function createFunnelTestSaleAction(formData: FormData) {
  const funnelSlug = value(formData, "funnelSlug");
  const user = await requireUser(funnelPath(funnelSlug, { tab: "sales" }));
  let destination: string;
  try {
    await createAdminFunnelTestSale({
      userId: user.id,
      funnelId: value(formData, "funnelId"),
      amountCents: Math.round(Number(value(formData, "amount") || "27") * 100)
    });
    revalidatePath(funnelPath(funnelSlug));
    destination = funnelPath(funnelSlug, {
      tab: "sales",
      message: "Local test sale recorded."
    });
  } catch (error) {
    destination = funnelPath(funnelSlug, {
      tab: "sales",
      error: errorMessage(error)
    });
  }
  redirect(destination);
}
