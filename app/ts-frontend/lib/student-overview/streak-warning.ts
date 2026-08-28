export type StreakWarningStatus = {
  mode: "daily" | "weekly";
  currentCount: number;
  currentPeriodPaused: boolean;
  currentPeriodCompleted: boolean;
};

export function shouldShowStreakWarning(status: StreakWarningStatus) {
  return status.mode === "daily" &&
    status.currentCount > 0 &&
    !status.currentPeriodPaused &&
    !status.currentPeriodCompleted;
}
