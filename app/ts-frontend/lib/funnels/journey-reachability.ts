import type { AdminFunnelStep } from "./server";
import { buildFunnelStepHierarchy } from "./step-hierarchy";

export type FunnelJourneyIssue = {
  stepId: string;
  message: string;
};

// Code-backed pages declare their onward action here. An unregistered page is
// treated as unsafe so a newly-added step cannot silently create a dead end.
const CODE_SOURCES_WITH_FORWARD_ACTION = new Set([
  "first_grade_curriculum_variant_a",
  "first_grade_curriculum_variant_b",
  "first_grade_homeschool_curriculum_detail",
  "first_grade_curriculum_checkout_choice",
  "first_grade_japanese_upsell",
  "first_grade_japanese_downsell",
  "no_subscription_landing",
  "bookstore",
  "bookstore_product_detail",
  "pricing",
  "switch_to_paper_landing"
]);

function declaredForwardAction(step: AdminFunnelStep) {
  const declaration = step.settings.journeyNextAction;
  if (declaration === "button" || declaration === "automatic") return true;
  if (declaration === "none") return false;

  if (step.stepType === "order_form" || step.stepType === "redirect") return true;
  return Boolean(step.sourceRef && CODE_SOURCES_WITH_FORWARD_ACTION.has(step.sourceRef));
}

export function findFunnelJourneyIssues(steps: AdminFunnelStep[]) {
  const hierarchy = buildFunnelStepHierarchy(steps);
  const activeNodes = hierarchy.filter(({ step }) => step.status === "active");
  const lastActiveStepId = activeNodes.at(-1)?.step.id ?? null;
  const issues = new Map<string, FunnelJourneyIssue>();

  for (const { step, children } of activeNodes) {
    if (step.id === lastActiveStepId) continue;

    const activeChildren = children.filter((child) => child.status === "active");
    if (children.length > 0) {
      if (activeChildren.length === 0) {
        issues.set(step.id, {
          stepId: step.id,
          message: "This experiment has no active variant that can send visitors onward."
        });
        continue;
      }

      const blockedChildren = activeChildren.filter((child) => !declaredForwardAction(child));
      for (const child of blockedChildren) {
        issues.set(child.id, {
          stepId: child.id,
          message: "This variant has no declared button or automatic path to the next step."
        });
      }
      if (blockedChildren.length > 0) {
        issues.set(step.id, {
          stepId: step.id,
          message: blockedChildren.length === 1
            ? "One active variant cannot send visitors to the next step."
            : `${blockedChildren.length} active variants cannot send visitors to the next step.`
        });
      }
      continue;
    }

    if (!declaredForwardAction(step)) {
      issues.set(step.id, {
        stepId: step.id,
        message: "This page has no declared button or automatic path to the next step."
      });
    }
  }

  return issues;
}
