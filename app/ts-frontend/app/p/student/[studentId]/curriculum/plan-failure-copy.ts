export const QUALITY_CONTROL_FAILURE_LABEL =
  "Treeschool found a scheduling issue before publishing this plan.";

export function qualityControlFailureDetail(totalWeeks: number) {
  return `Your current lesson plan and all ${totalWeeks} generated weeks are safe. ` +
    "Retry the final review; if the same issue returns, contact support.";
}

export const QUALITY_CONTROL_RETRY_HELP =
  "Treeschool will run the final scheduling review again. Your current published plan remains unchanged.";
