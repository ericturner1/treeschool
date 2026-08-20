export const COMMON_AWARD_REASONS = [
  "Finished a lesson",
  "Excellent effort",
  "Kept trying",
  "Helped without being asked",
  "Great attitude",
  "Completed schoolwork",
] as const;

export const COMMON_REDEMPTION_REASONS = [
  "Chose a reward",
  "Chose tonight's dessert",
  "Extra play time",
  "Picked a family activity",
  "Special privilege",
  "Saved toward a bigger reward",
] as const;

export function frequentPointReasons(
  transactions: Array<{
    amount: number;
    kind: string;
    reason: string;
    reversed: boolean;
  }>,
  kind: "award" | "redeem",
) {
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    if (
      transaction.kind !== kind ||
      transaction.reversed ||
      (kind === "award" ? transaction.amount <= 0 : transaction.amount >= 0)
    ) continue;
    counts.set(transaction.reason, (counts.get(transaction.reason) ?? 0) + 1);
  }
  return Array.from(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([reason]) => reason);
}
