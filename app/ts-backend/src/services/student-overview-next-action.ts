export function shouldPromptForWeeklyPlanDownload(input: {
  weekStatus: string;
  progressPercent: number;
  hasDownloadRecord: boolean;
}) {
  const weekHasStarted = ["in_progress", "completed"].includes(input.weekStatus) ||
    input.progressPercent > 0;
  return !input.hasDownloadRecord && !weekHasStarted;
}

export function continuingWeekAction(input: {
  weekNumber: number;
  progressPercent: number;
}) {
  return {
    label: `Continue working on Week ${input.weekNumber}`,
    description: input.progressPercent > 0
      ? `Week ${input.weekNumber} is ${input.progressPercent}% complete. Keep marking finished lessons and days.`
      : "Return to this week’s lessons and keep the school week moving."
  };
}
