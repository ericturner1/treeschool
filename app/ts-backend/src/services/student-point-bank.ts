export const MICROPOINTS_PER_POINT = 1_000_000;
export const MIN_BANK_INTEREST_BASIS_POINTS = 1;
export const MAX_BANK_INTEREST_BASIS_POINTS = 1_000;
export const BANK_COMPOUNDING_INTERVALS = ["daily", "weekly", "monthly"] as const;
export type BankCompoundingInterval = (typeof BANK_COMPOUNDING_INTERVALS)[number];

export function dateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid bank accrual date: ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid bank accrual date: ${value}`);
  }
  return date;
}

function nextAccrualDate(
  current: Date,
  interval: BankCompoundingInterval,
  anchorDay: number
) {
  const next = new Date(current);
  if (interval === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (interval === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  const nextMonth = next.getUTCMonth() + 1;
  const year = next.getUTCFullYear() + Math.floor(nextMonth / 12);
  const month = ((nextMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, lastDay)));
}

export function bankAccrualDateKeys(input: {
  lastAccrualDate: string;
  throughDate: string;
  interval: BankCompoundingInterval;
  anchorDay: number;
  maximumDays?: number;
}) {
  const maximumDays = input.maximumDays ?? 3_660;
  const cursor = parseDateKey(input.lastAccrualDate);
  const through = parseDateKey(input.throughDate);
  const dates: string[] = [];
  let next = nextAccrualDate(cursor, input.interval, input.anchorDay);
  while (next <= through && dates.length < maximumDays) {
    dates.push(next.toISOString().slice(0, 10));
    next = nextAccrualDate(next, input.interval, input.anchorDay);
  }
  return dates;
}

export function calculateBankInterest(input: {
  balance: number;
  remainderMicropoints: number;
  interestRateBasisPoints: number;
}) {
  const balance = Math.max(0, Math.trunc(input.balance));
  const remainderMicropoints = Math.max(
    0,
    Math.min(MICROPOINTS_PER_POINT - 1, Math.trunc(input.remainderMicropoints))
  );
  const interestRateBasisPoints = Math.max(
    MIN_BANK_INTEREST_BASIS_POINTS,
    Math.min(MAX_BANK_INTEREST_BASIS_POINTS, Math.trunc(input.interestRateBasisPoints))
  );
  const principalMicropoints = BigInt(balance) * BigInt(MICROPOINTS_PER_POINT) + BigInt(remainderMicropoints);
  const interestMicropoints = principalMicropoints * BigInt(interestRateBasisPoints) / 10_000n;
  const availableMicropoints = BigInt(remainderMicropoints) + interestMicropoints;
  const awardedPoints = Number(availableMicropoints / BigInt(MICROPOINTS_PER_POINT));
  const nextRemainderMicropoints = Number(availableMicropoints % BigInt(MICROPOINTS_PER_POINT));
  return {
    interestMicropoints: Number(interestMicropoints),
    awardedPoints,
    nextBalance: balance + awardedPoints,
    nextRemainderMicropoints
  };
}

export function normalizeBankInterestBasisPoints(ratePercent: number) {
  const basisPoints = Math.round(Number(ratePercent) * 100);
  if (
    !Number.isInteger(basisPoints) ||
    basisPoints < MIN_BANK_INTEREST_BASIS_POINTS ||
    basisPoints > MAX_BANK_INTEREST_BASIS_POINTS
  ) {
    throw new Error("Enter a bank interest rate between 0.01% and 10.00% per compounding period.");
  }
  return basisPoints;
}

export function normalizeBankCompoundingInterval(value: string): BankCompoundingInterval {
  if (BANK_COMPOUNDING_INTERVALS.includes(value as BankCompoundingInterval)) {
    return value as BankCompoundingInterval;
  }
  throw new Error("Choose daily, weekly, or monthly bank compounding.");
}
