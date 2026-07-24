import { and, eq } from "drizzle-orm";
import { accountPreferences, profiles } from "ts-db";
import { db } from "../db";
import { requireAccountRole } from "./accounts";

export const PRINT_PAGE_SIZES = ["letter", "a4", "legal"] as const;
export type PrintPageSize = (typeof PRINT_PAGE_SIZES)[number];

export function normalizePrintPageSize(value: unknown): PrintPageSize | null {
  return typeof value === "string" && PRINT_PAGE_SIZES.includes(value as PrintPageSize)
    ? value as PrintPageSize
    : null;
}

async function getParentAccountId(userId: string) {
  const [parent] = await db
    .select({ accountId: profiles.accountId })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);
  if (!parent) throw new Error("Parent account not found.");
  return parent.accountId;
}

export async function getAccountPreferences(userId: string) {
  const accountId = await getParentAccountId(userId);
  const [preferences] = await db
    .select({ preferredPrintPageSize: accountPreferences.preferredPrintPageSize })
    .from(accountPreferences)
    .where(eq(accountPreferences.accountId, accountId))
    .limit(1);
  return {
    preferredPrintPageSize: normalizePrintPageSize(preferences?.preferredPrintPageSize)
  };
}

export async function setAccountPrintPageSize(accountId: string, value: unknown) {
  const preferredPrintPageSize = normalizePrintPageSize(value);
  if (!preferredPrintPageSize) throw new Error("Choose a supported print page size.");
  await db.insert(accountPreferences).values({
    accountId,
    preferredPrintPageSize,
    updatedAt: new Date()
  }).onConflictDoUpdate({
    target: accountPreferences.accountId,
    set: { preferredPrintPageSize, updatedAt: new Date() }
  });
  return { preferredPrintPageSize };
}

export async function updateAccountPreferences(userId: string, input: {
  preferredPrintPageSize: unknown;
}) {
  await requireAccountRole(userId, ["OWNER", "ADMIN"]);
  const accountId = await getParentAccountId(userId);
  return setAccountPrintPageSize(accountId, input.preferredPrintPageSize);
}
