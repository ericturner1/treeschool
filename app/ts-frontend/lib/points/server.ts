import { backendFetch } from "../backend/server";

const DEFAULT_INTERNAL_BACKEND_URL = "http://ts-backend:3001";
const getBackendUrl = () => process.env.INTERNAL_BACKEND_URL ?? DEFAULT_INTERNAL_BACKEND_URL;

export type StudentPointIconKey =
  | "star"
  | "coin"
  | "diamond"
  | "custom";

export type BankCompoundingInterval = "daily" | "weekly" | "monthly";

export type StudentPointsPayload = {
  student: {
    id: string;
    firstName: string;
  };
  canTransact: boolean;
  canManage: boolean;
  settings: {
    singularName: string;
    pluralName: string;
    iconKey: StudentPointIconKey;
    customIconUrl: string | null;
    autoAwardLessonCompletion: boolean;
    bank: {
      interestRatePercent: number;
      compoundingInterval: BankCompoundingInterval;
      lastAccrualDate: string | null;
    };
  };
  summary: {
    balance: number;
    availableBalance: number;
    bankBalance: number;
    totalBalance: number;
    lifetimeEarned: number;
    lifetimeUsed: number;
    bankInterestEarned: number;
  };
  balanceTimeline: Array<{
    id: string;
    balance: number;
    createdAt: string;
  }>;
  history: {
    offset: number;
    limit: number;
    total: number;
  };
  transactions: Array<{
    id: string;
    amount: number;
    kind: string;
    reason: string;
    balanceAfter: number;
    balanceKind: "available" | "bank";
    bankBalanceAfter: number | null;
    actorName: string;
    reversed: boolean;
    isTransfer: boolean;
    interestDate: string | null;
    createdAt: string;
  }>;
};

export async function getStudentPoints(input: {
  parentUserId: string;
  profileId: string;
  historyLimit?: number;
  historyOffset?: number;
}) {
  const params = new URLSearchParams({
    parentUserId: input.parentUserId,
    profileId: input.profileId,
    ...(input.historyLimit != null ? { historyLimit: String(input.historyLimit) } : {}),
    ...(input.historyOffset != null ? { historyOffset: String(input.historyOffset) } : {})
  });
  const response = await backendFetch(
    `${getBackendUrl()}/internal/profiles/student/points?${params}`,
    { cache: "no-store" }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Failed to load student points.");
  return payload as StudentPointsPayload;
}

async function pointsMutation<T>(body: Record<string, unknown>) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/points`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Failed to update student points.");
  return payload as T;
}

export function awardStudentPoints(input: {
  parentUserId: string;
  profileId: string;
  amount: number;
  reason: string;
}) {
  return pointsMutation<{ id: string; amount: number }>({ ...input, action: "award" });
}

export function redeemStudentPoints(input: {
  parentUserId: string;
  profileId: string;
  amount: number;
  reason: string;
}) {
  return pointsMutation({ ...input, action: "redeem" });
}

export function depositStudentPointsToBank(input: {
  parentUserId: string;
  profileId: string;
  amount: number;
}) {
  return pointsMutation({ ...input, action: "bank_deposit" });
}

export function withdrawStudentPointsFromBank(input: {
  parentUserId: string;
  profileId: string;
  amount: number;
}) {
  return pointsMutation({ ...input, action: "bank_withdrawal" });
}

export function updateStudentPointSettings(input: {
  parentUserId: string;
  profileId: string;
  singularName: string;
  pluralName: string;
  iconKey: StudentPointIconKey;
  autoAwardLessonCompletion: boolean;
  bankInterestRatePercent: number;
  bankCompoundingInterval: BankCompoundingInterval;
}) {
  return pointsMutation({ ...input, action: "settings" });
}

export async function prepareStudentPointIconUpload(input: {
  parentUserId: string;
  profileId: string;
  contentType: string;
  sizeBytes: number;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/points/icon/prepare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Could not prepare the custom point icon upload.");
  return payload as { objectPath: string; uploadUrl: string; contentType: string };
}

export async function completeStudentPointIconUpload(input: {
  parentUserId: string;
  profileId: string;
  objectPath: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/points/icon/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Could not save the custom point icon.");
  return payload as { customIconUrl: string };
}

export async function discardStudentPointIconUpload(input: {
  parentUserId: string;
  profileId: string;
  objectPath: string;
}) {
  const response = await backendFetch(`${getBackendUrl()}/internal/profiles/student/points/icon/discard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "Could not discard the custom point icon upload.");
  return payload as { discarded: boolean };
}
