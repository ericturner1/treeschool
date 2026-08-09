export type FunnelOfferFlowStep = {
  id: string;
  name?: string;
  stepType: string;
  status: string;
  displayOrder: number;
  createdAt: Date;
  settingsJson?: unknown;
};

function isExperimentVariant(step: FunnelOfferFlowStep) {
  const settings = step.settingsJson && typeof step.settingsJson === "object"
    ? step.settingsJson as Record<string, unknown>
    : null;
  return settings?.relationship === "experiment_variant";
}

function orderedFunnelJourneySteps<T extends FunnelOfferFlowStep>(steps: T[]) {
  return [...steps]
    .filter((step) => !isExperimentVariant(step))
    .sort((left, right) =>
      left.displayOrder - right.displayOrder ||
      left.createdAt.getTime() - right.createdAt.getTime()
    );
}

export function orderedActiveFunnelJourneySteps<T extends FunnelOfferFlowStep>(steps: T[]) {
  return orderedFunnelJourneySteps(steps).filter((step) => step.status === "active");
}

export function nextActiveFunnelJourneyStep<T extends FunnelOfferFlowStep>(
  steps: T[],
  currentStepId: string,
  options: { skipPairedDownsell?: boolean } = {}
) {
  const ordered = orderedFunnelJourneySteps(steps);
  const currentIndex = ordered.findIndex(({ id }) => id === currentStepId);
  if (currentIndex < 0) return null;
  const remaining = ordered.slice(currentIndex + 1).filter((step) => step.status === "active");
  const next = remaining[0] ?? null;
  if (!options.skipPairedDownsell || next?.stepType !== "downsell") return next;
  return remaining[1] ?? null;
}

export function pairedUpsellForDownsell<T extends FunnelOfferFlowStep>(
  steps: T[],
  downsellStepId: string
) {
  const ordered = orderedActiveFunnelJourneySteps(steps);
  const downsellIndex = ordered.findIndex(({ id }) => id === downsellStepId);
  if (downsellIndex < 1 || ordered[downsellIndex]?.stepType !== "downsell") return null;
  const previous = ordered[downsellIndex - 1] ?? null;
  return previous?.stepType === "upsell" ? previous : null;
}

export function invalidActiveDownsell<T extends FunnelOfferFlowStep>(steps: T[]) {
  return orderedActiveFunnelJourneySteps(steps).find((step) =>
    step.stepType === "downsell" && !pairedUpsellForDownsell(steps, step.id)
  ) ?? null;
}
