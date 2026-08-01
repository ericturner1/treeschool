import type { AdminFunnelStep } from "./server";

export const EXPERIMENT_VARIANT_RELATIONSHIP = "experiment_variant";

export type FunnelStepHierarchyNode = {
  step: AdminFunnelStep;
  children: AdminFunnelStep[];
};

export function funnelStepParentSlug(step: AdminFunnelStep) {
  if (step.settings.relationship !== EXPERIMENT_VARIANT_RELATIONSHIP) return null;
  const parentStepSlug = step.settings.parentStepSlug;
  return typeof parentStepSlug === "string" && parentStepSlug.trim()
    ? parentStepSlug.trim()
    : null;
}

export function funnelExperimentContainerForStep(
  steps: AdminFunnelStep[],
  step: AdminFunnelStep
) {
  const parentSlug = funnelStepParentSlug(step);
  if (!parentSlug) return step;
  return steps.find((candidate) => candidate.slug === parentSlug) ?? step;
}

export function buildFunnelStepHierarchy(steps: AdminFunnelStep[]): FunnelStepHierarchyNode[] {
  const stepBySlug = new Map(steps.map((step) => [step.slug, step]));
  const childrenByParentSlug = new Map<string, AdminFunnelStep[]>();
  const nestedStepIds = new Set<string>();

  for (const step of steps) {
    const parentSlug = funnelStepParentSlug(step);
    if (!parentSlug || parentSlug === step.slug || !stepBySlug.has(parentSlug)) continue;
    const siblings = childrenByParentSlug.get(parentSlug) ?? [];
    siblings.push(step);
    childrenByParentSlug.set(parentSlug, siblings);
    nestedStepIds.add(step.id);
  }

  return steps
    .filter((step) => !nestedStepIds.has(step.id))
    .map((step) => ({
      step,
      children: childrenByParentSlug.get(step.slug) ?? []
    }));
}

export function flattenFunnelStepHierarchy(nodes: FunnelStepHierarchyNode[]) {
  return nodes.flatMap(({ step, children }) => [step, ...children]);
}

export function moveFunnelStepGroup(
  steps: AdminFunnelStep[],
  stepId: string,
  direction: -1 | 1
) {
  const hierarchy = buildFunnelStepHierarchy(steps);
  const current = hierarchy.findIndex(({ step }) => step.id === stepId);
  const target = current + direction;
  if (current < 0 || target < 0 || target >= hierarchy.length) return steps;
  const next = [...hierarchy];
  const [node] = next.splice(current, 1);
  if (!node) return steps;
  next.splice(target, 0, node);
  return flattenFunnelStepHierarchy(next);
}

export function reorderFunnelStepGroups(
  steps: AdminFunnelStep[],
  draggedId: string,
  targetId: string
) {
  if (draggedId === targetId) return steps;
  const hierarchy = buildFunnelStepHierarchy(steps);
  const from = hierarchy.findIndex(({ step }) => step.id === draggedId);
  const to = hierarchy.findIndex(({ step }) => step.id === targetId);
  if (from < 0 || to < 0) return steps;
  const next = [...hierarchy];
  const [node] = next.splice(from, 1);
  if (!node) return steps;
  next.splice(to, 0, node);
  return flattenFunnelStepHierarchy(next);
}
