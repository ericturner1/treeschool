import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  profiles,
  streakSettings,
  studentPointBankTransactions,
  studentPointSettings,
  studentPointTransactions,
  teacherActivityEvents
} from "ts-db";
import { db } from "../db";
import {
  getAccountMemberContext,
  getManageableStudentProfile,
  requireAccountRole
} from "./accounts";
import { requirePremiumFeatureAccess } from "./entitlements";
import {
  deletePrivateFile,
  downloadPrivateFile,
  getPrivateFileMetadata,
  getSignedLessonAssetUrl,
  getSignedPrivateUploadUrl
} from "./media";
import {
  bankAccrualDateKeys,
  calculateBankInterest,
  dateKeyInTimeZone,
  normalizeBankCompoundingInterval,
  normalizeBankInterestBasisPoints,
  pointsFromMicropoints
} from "./student-point-bank";

export const STUDENT_POINT_ICON_KEYS = [
  "star",
  "coin",
  "diamond",
  "custom"
] as const;

export type StudentPointIconKey = (typeof STUDENT_POINT_ICON_KEYS)[number];

const CUSTOM_POINT_ICON_MAX_BYTES = 512 * 1024;
const CUSTOM_POINT_ICON_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function customPointIconExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function isValidCustomPointIcon(bytes: Uint8Array, contentType: string) {
  const buffer = Buffer.from(bytes);
  if (contentType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (contentType === "image/jpeg") {
    return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  }
  if (contentType === "image/webp") {
    return buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function normalizeName(value: string, fallback: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 30) || fallback;
}

function normalizeReason(value: string) {
  const reason = value.trim().replace(/\s+/g, " ").slice(0, 300);
  if (!reason) throw new Error("Add a reason for this points activity.");
  return reason;
}

function normalizeAmount(value: number) {
  const amount = Math.round(Number(value));
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) {
    throw new Error("Enter a whole-number amount between 1 and 100,000.");
  }
  return amount;
}

function normalizeWholeNumber(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(minimum, Math.min(Math.round(candidate), maximum));
}

function normalizeIconKey(value: string): StudentPointIconKey {
  return STUDENT_POINT_ICON_KEYS.includes(value as StudentPointIconKey)
    ? value as StudentPointIconKey
    : "star";
}

async function ensureStudentPointSettings(profileId: string) {
  await db.insert(studentPointSettings).values({ profileId }).onConflictDoNothing();
  const [settings] = await db
    .select()
    .from(studentPointSettings)
    .where(eq(studentPointSettings.profileId, profileId))
    .limit(1);
  if (!settings) throw new Error("The point settings could not be loaded.");
  return settings;
}

function validTimeZone(value: string | null | undefined) {
  const candidate = value?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "UTC";
  }
}

async function getStudentPointTimeZone(profileId: string) {
  const [settings] = await db
    .select({ timeZone: streakSettings.timeZone })
    .from(streakSettings)
    .where(eq(streakSettings.profileId, profileId))
    .limit(1);
  return validTimeZone(settings?.timeZone);
}

export async function accrueStudentPointBankInterest(profileId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`student-points:${profileId}`}))`);
    const [settings] = await tx
      .select({
        interestRateBasisPoints: studentPointSettings.bankInterestRateBasisPoints,
        compoundingInterval: studentPointSettings.bankCompoundingInterval,
        remainderMicropoints: studentPointSettings.bankInterestRemainderMicropoints,
        lastAccrualDate: studentPointSettings.bankLastAccrualDate,
        interestAnchorDay: studentPointSettings.bankInterestAnchorDay,
        timeZone: streakSettings.timeZone
      })
      .from(studentPointSettings)
      .leftJoin(streakSettings, eq(streakSettings.profileId, studentPointSettings.profileId))
      .where(eq(studentPointSettings.profileId, profileId))
      .limit(1);
    if (!settings?.lastAccrualDate) return { processedPeriods: 0, awardedPoints: 0, throughDate: null };
    const throughDate = dateKeyInTimeZone(now, validTimeZone(settings.timeZone));
    const accrualDates = bankAccrualDateKeys({
      lastAccrualDate: settings.lastAccrualDate,
      throughDate,
      interval: normalizeBankCompoundingInterval(settings.compoundingInterval),
      anchorDay: settings.interestAnchorDay ?? Number(settings.lastAccrualDate.slice(-2))
    });
    if (accrualDates.length === 0) {
      return { processedPeriods: 0, awardedPoints: 0, throughDate };
    }
    const [summary] = await tx
      .select({
        balance: sql<number>`coalesce(sum(${studentPointBankTransactions.amount}), 0)::integer`
      })
      .from(studentPointBankTransactions)
      .where(eq(studentPointBankTransactions.profileId, profileId));
    let balance = Number(summary?.balance ?? 0);
    let remainderMicropoints = settings.remainderMicropoints;
    let awardedPoints = 0;
    for (const interestDate of accrualDates) {
      const accrual = calculateBankInterest({
        balance,
        remainderMicropoints,
        interestRateBasisPoints: settings.interestRateBasisPoints
      });
      balance = accrual.nextBalance;
      remainderMicropoints = accrual.nextRemainderMicropoints;
      awardedPoints += accrual.awardedPoints;
      if (accrual.interestMicropoints < 1) continue;
      await tx.insert(studentPointBankTransactions).values({
        profileId,
        amount: accrual.awardedPoints,
        kind: "interest",
        reason: `${settings.compoundingInterval[0]!.toUpperCase()}${settings.compoundingInterval.slice(1)} bank interest`,
        sourceType: "bank_interest",
        sourceKey: interestDate,
        balanceAfter: balance,
        metadata: {
          interestDate,
          compoundingInterval: settings.compoundingInterval,
          interestRateBasisPoints: settings.interestRateBasisPoints,
          interestMicropoints: accrual.interestMicropoints,
          remainderMicropointsAfter: remainderMicropoints
        },
        createdAt: now
      });
    }
    await tx
      .update(studentPointSettings)
      .set({
        bankInterestRemainderMicropoints: remainderMicropoints,
        bankLastAccrualDate: accrualDates.at(-1)!,
        updatedAt: now
      })
      .where(eq(studentPointSettings.profileId, profileId));
    return { processedPeriods: accrualDates.length, awardedPoints, throughDate };
  });
}

export async function accrueDueStudentPointBankInterest(now = new Date()) {
  const bankProfiles = await db
    .select({
      profileId: studentPointSettings.profileId,
      compoundingInterval: studentPointSettings.bankCompoundingInterval,
      lastAccrualDate: studentPointSettings.bankLastAccrualDate,
      interestAnchorDay: studentPointSettings.bankInterestAnchorDay,
      timeZone: streakSettings.timeZone
    })
    .from(studentPointSettings)
    .leftJoin(streakSettings, eq(streakSettings.profileId, studentPointSettings.profileId))
    .where(isNotNull(studentPointSettings.bankLastAccrualDate));
  const dueProfiles = bankProfiles.filter((profile) => profile.lastAccrualDate && bankAccrualDateKeys({
    lastAccrualDate: profile.lastAccrualDate,
    throughDate: dateKeyInTimeZone(now, validTimeZone(profile.timeZone)),
    interval: normalizeBankCompoundingInterval(profile.compoundingInterval),
    anchorDay: profile.interestAnchorDay ?? Number(profile.lastAccrualDate.slice(-2)),
    maximumDays: 1
  }).length > 0);
  let processedPeriods = 0;
  let awardedPoints = 0;
  let failedProfiles = 0;
  for (const profile of dueProfiles) {
    try {
      const result = await accrueStudentPointBankInterest(profile.profileId, now);
      processedPeriods += result.processedPeriods;
      awardedPoints += result.awardedPoints;
    } catch (error) {
      failedProfiles += 1;
      console.error(`Could not accrue point-bank interest for profile ${profile.profileId}:`, error);
    }
  }
  return {
    bankProfiles: bankProfiles.length,
    dueProfiles: dueProfiles.length,
    processedPeriods,
    awardedPoints,
    failedProfiles
  };
}

export async function getStudentPoints(input: {
  parentUserId: string;
  profileId: string;
  historyLimit?: number;
  historyOffset?: number;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  const [{ studentProfile }, requester] = await Promise.all([
    getManageableStudentProfile(input.parentUserId, input.profileId),
    getAccountMemberContext(input.parentUserId)
  ]);
  await ensureStudentPointSettings(input.profileId);
  await accrueStudentPointBankInterest(input.profileId);
  const settings = await ensureStudentPointSettings(input.profileId);
  const historyLimit = normalizeWholeNumber(input.historyLimit, 100, 1, 250);
  const historyOffset = normalizeWholeNumber(input.historyOffset, 0, 0, 1_000_000);
  const [pointSummaryRows, pointTransactions, bankSummaryRows, bankInterestTransactions, pointTimelineTransactions, bankInterestTimelineTransactions] = await Promise.all([
    db
      .select({
        availableBalance: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null then ${studentPointTransactions.amount} else 0 end), 0)::integer`,
        lifetimeEarned: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null and ${studentPointTransactions.kind} in ('award', 'lesson_completion') then ${studentPointTransactions.amount} else 0 end), 0)::integer`,
        lifetimeUsed: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null and ${studentPointTransactions.kind} = 'redemption' then -${studentPointTransactions.amount} else 0 end), 0)::integer`,
        transactionCount: sql<number>`count(*)::integer`
      })
      .from(studentPointTransactions)
      .where(eq(studentPointTransactions.profileId, input.profileId)),
    db
      .select()
      .from(studentPointTransactions)
      .where(eq(studentPointTransactions.profileId, input.profileId))
      .orderBy(desc(studentPointTransactions.createdAt))
      .limit(historyOffset + historyLimit),
    db
      .select({
        balance: sql<number>`coalesce(sum(${studentPointBankTransactions.amount}), 0)::integer`,
        interestEarnedMicropoints: sql<number>`coalesce(sum(case when ${studentPointBankTransactions.kind} = 'interest' then coalesce(nullif(${studentPointBankTransactions.metadata}->>'interestMicropoints', '')::bigint, ${studentPointBankTransactions.amount}::bigint * 1000000) else 0 end), 0)::bigint`,
        interestTransactionCount: sql<number>`count(*) filter (where ${studentPointBankTransactions.kind} = 'interest')::integer`
      })
      .from(studentPointBankTransactions)
      .where(eq(studentPointBankTransactions.profileId, input.profileId)),
    db
      .select()
      .from(studentPointBankTransactions)
      .where(and(
        eq(studentPointBankTransactions.profileId, input.profileId),
        eq(studentPointBankTransactions.kind, "interest")
      ))
      .orderBy(desc(studentPointBankTransactions.createdAt))
      .limit(historyOffset + historyLimit),
    db
      .select({
        id: studentPointTransactions.id,
        amount: studentPointTransactions.amount,
        kind: studentPointTransactions.kind,
        createdAt: studentPointTransactions.createdAt
      })
      .from(studentPointTransactions)
      .where(and(
        eq(studentPointTransactions.profileId, input.profileId),
        isNull(studentPointTransactions.reversedAt)
      ))
      .orderBy(asc(studentPointTransactions.createdAt), asc(studentPointTransactions.id)),
    db
      .select({
        id: studentPointBankTransactions.id,
        amount: studentPointBankTransactions.amount,
        metadata: studentPointBankTransactions.metadata,
        createdAt: studentPointBankTransactions.createdAt
      })
      .from(studentPointBankTransactions)
      .where(and(
        eq(studentPointBankTransactions.profileId, input.profileId),
        eq(studentPointBankTransactions.kind, "interest")
      ))
      .orderBy(asc(studentPointBankTransactions.createdAt), asc(studentPointBankTransactions.id))
  ]);
  const allHistoryTransactions = [
    ...pointTransactions.map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      kind: transaction.kind,
      reason: transaction.reason,
      balanceAfter: transaction.balanceAfter,
      balanceKind: "available" as const,
      bankBalanceAfter: typeof transaction.metadata.bankBalanceAfter === "number"
        ? transaction.metadata.bankBalanceAfter
        : null,
      createdByUserId: transaction.createdByUserId,
      reversed: Boolean(transaction.reversedAt),
      isTransfer: transaction.kind === "bank_deposit" || transaction.kind === "bank_withdrawal",
      interestDate: null as string | null,
      createdAt: transaction.createdAt
    })),
    ...bankInterestTransactions.map((transaction) => {
      const interestMicropoints = typeof transaction.metadata.interestMicropoints === "number"
        ? transaction.metadata.interestMicropoints
        : transaction.amount * 1_000_000;
      const remainderMicropoints = typeof transaction.metadata.remainderMicropointsAfter === "number"
        ? transaction.metadata.remainderMicropointsAfter
        : 0;
      const balanceAfter = transaction.balanceAfter + pointsFromMicropoints(remainderMicropoints);
      return {
        id: transaction.id,
        amount: pointsFromMicropoints(interestMicropoints),
        kind: transaction.kind,
        reason: transaction.reason,
        balanceAfter,
        balanceKind: "bank" as const,
        bankBalanceAfter: balanceAfter,
        createdByUserId: transaction.createdByUserId,
        reversed: false,
        isTransfer: false,
        interestDate: typeof transaction.metadata.interestDate === "string"
          ? transaction.metadata.interestDate
          : null,
        createdAt: transaction.createdAt
      };
    })
  ].sort((left, right) =>
    right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id)
  );
  const transactions = allHistoryTransactions.slice(historyOffset, historyOffset + historyLimit);
  const actorUserIds = Array.from(new Set(
    transactions
      .map((transaction) => transaction.createdByUserId)
      .filter((userId): userId is string => Boolean(userId))
  ));
  const actors = actorUserIds.length === 0
    ? []
    : await db
        .select({
          userId: profiles.userId,
          firstName: profiles.firstName
        })
        .from(profiles)
        .where(and(
          inArray(profiles.userId, actorUserIds),
          eq(profiles.role, "PARENT"),
          eq(profiles.accountId, studentProfile.accountId)
        ));
  const actorNames = new Map(
    actors
      .filter((actor): actor is { userId: string; firstName: string } => Boolean(actor.userId))
      .map((actor) => [actor.userId, actor.firstName])
  );
  const pointSummary = pointSummaryRows[0] ?? { availableBalance: 0, lifetimeEarned: 0, lifetimeUsed: 0, transactionCount: 0 };
  const bankSummary = bankSummaryRows[0] ?? { balance: 0, interestEarnedMicropoints: 0, interestTransactionCount: 0 };
  const availableBalance = Number(pointSummary.availableBalance ?? 0);
  const pendingInterest = pointsFromMicropoints(settings.bankInterestRemainderMicropoints);
  const bankBalance = Number(bankSummary.balance ?? 0) + pendingInterest;
  const bankInterestEarned = pointsFromMicropoints(Number(bankSummary.interestEarnedMicropoints ?? 0));
  const iconKey = normalizeIconKey(settings.iconKey);
  const customIconUrl = iconKey === "custom" && settings.customIconPath
    ? await getSignedLessonAssetUrl(settings.customIconPath, 60)
    : null;

  return {
    student: {
      id: studentProfile.id,
      firstName: studentProfile.firstName
    },
    canTransact: ["OWNER", "ADMIN", "TEACHER"].includes(requester.accountRole),
    canManage: requester.accountRole === "OWNER" || requester.accountRole === "ADMIN",
    settings: {
      singularName: settings.singularName,
      pluralName: settings.pluralName,
      iconKey,
      customIconUrl,
      autoAwardLessonCompletion: settings.autoAwardLessonCompletion,
      bank: {
        interestRatePercent: settings.bankInterestRateBasisPoints / 100,
        compoundingInterval: normalizeBankCompoundingInterval(settings.bankCompoundingInterval),
        lastAccrualDate: settings.bankLastAccrualDate
      }
    },
    summary: {
      balance: availableBalance,
      availableBalance,
      bankBalance,
      totalBalance: availableBalance + bankBalance,
      lifetimeEarned: Number(pointSummary.lifetimeEarned ?? 0) + bankInterestEarned,
      lifetimeUsed: Number(pointSummary.lifetimeUsed ?? 0),
      bankInterestEarned
    },
    balanceTimeline: (() => {
      let balance = 0;
      return [
        ...pointTimelineTransactions
          .filter((transaction) => transaction.kind !== "bank_deposit" && transaction.kind !== "bank_withdrawal")
          .map((transaction) => ({ ...transaction, scope: "available" as const })),
        ...bankInterestTimelineTransactions.map((transaction) => ({
          ...transaction,
          amount: pointsFromMicropoints(
            typeof transaction.metadata.interestMicropoints === "number"
              ? transaction.metadata.interestMicropoints
              : transaction.amount * 1_000_000
          ),
          scope: "bank" as const
        }))
      ].sort((left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
      ).map((transaction) => {
        balance += transaction.amount;
        return {
          id: transaction.id,
          balance,
          createdAt: transaction.createdAt.toISOString()
        };
      });
    })(),
    history: {
      offset: historyOffset,
      limit: historyLimit,
      total: Number(pointSummary.transactionCount ?? 0) + Number(bankSummary.interestTransactionCount ?? 0)
    },
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      kind: transaction.kind,
      reason: transaction.reason,
      balanceAfter: transaction.balanceAfter,
      balanceKind: transaction.balanceKind,
      bankBalanceAfter: transaction.bankBalanceAfter,
      actorName: transaction.createdByUserId
        ? actorNames.get(transaction.createdByUserId) ?? "Account member"
        : "Treeschool",
      reversed: transaction.reversed,
      isTransfer: transaction.isTransfer,
      interestDate: transaction.interestDate,
      createdAt: transaction.createdAt.toISOString()
    }))
  };
}

export async function updateStudentPointSettings(input: {
  parentUserId: string;
  profileId: string;
  singularName: string;
  pluralName: string;
  iconKey: string;
  autoAwardLessonCompletion: boolean;
  bankInterestRatePercent: number;
  bankCompoundingInterval: string;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  const singularName = normalizeName(input.singularName, "point");
  const pluralName = normalizeName(input.pluralName, `${singularName}s`);
  const iconKey = normalizeIconKey(input.iconKey);
  await ensureStudentPointSettings(input.profileId);
  await accrueStudentPointBankInterest(input.profileId);
  const currentSettings = await ensureStudentPointSettings(input.profileId);
  const bankInterestRateBasisPoints = normalizeBankInterestBasisPoints(input.bankInterestRatePercent);
  const bankCompoundingInterval = normalizeBankCompoundingInterval(input.bankCompoundingInterval);
  const scheduleChanged =
    currentSettings.bankInterestRateBasisPoints !== bankInterestRateBasisPoints ||
    currentSettings.bankCompoundingInterval !== bankCompoundingInterval;
  const today = dateKeyInTimeZone(new Date(), await getStudentPointTimeZone(input.profileId));
  const bankLastAccrualDate = currentSettings.bankLastAccrualDate && scheduleChanged
    ? today
    : currentSettings.bankLastAccrualDate;
  const bankInterestAnchorDay = currentSettings.bankLastAccrualDate && scheduleChanged
    ? Number(today.slice(-2))
    : currentSettings.bankInterestAnchorDay;
  if (iconKey === "custom" && !currentSettings.customIconPath) {
    throw new Error("Upload a custom icon before selecting it.");
  }
  const [settings] = await db
    .insert(studentPointSettings)
    .values({
      profileId: input.profileId,
      singularName,
      pluralName,
      iconKey,
      autoAwardLessonCompletion: input.autoAwardLessonCompletion,
      bankInterestRateBasisPoints,
      bankCompoundingInterval,
      bankInterestRemainderMicropoints: currentSettings.bankInterestRemainderMicropoints,
      bankLastAccrualDate,
      bankInterestAnchorDay,
      updatedByUserId: input.parentUserId
    })
    .onConflictDoUpdate({
      target: studentPointSettings.profileId,
      set: {
        singularName,
        pluralName,
        iconKey,
        autoAwardLessonCompletion: input.autoAwardLessonCompletion,
        bankInterestRateBasisPoints,
        bankCompoundingInterval,
        bankInterestRemainderMicropoints: currentSettings.bankInterestRemainderMicropoints,
        bankLastAccrualDate,
        bankInterestAnchorDay,
        updatedByUserId: input.parentUserId,
        updatedAt: new Date()
      }
    })
    .returning();
  return settings!;
}

export async function prepareStudentPointIconUpload(input: {
  parentUserId: string;
  profileId: string;
  contentType: string;
  sizeBytes: number;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  const contentType = String(input.contentType ?? "").toLowerCase().split(";", 1)[0].trim();
  const sizeBytes = Number(input.sizeBytes);
  if (!CUSTOM_POINT_ICON_CONTENT_TYPES.has(contentType)) {
    throw new Error("Choose a PNG, JPEG, or WebP icon.");
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > CUSTOM_POINT_ICON_MAX_BYTES) {
    throw new Error("Custom point icons may be up to 512 KB.");
  }
  const objectPath = `student-point-icons/${input.profileId}/${randomUUID()}.${customPointIconExtension(contentType)}`;
  const uploadUrl = await getSignedPrivateUploadUrl({
    objectPath,
    contentType,
    expiresInMinutes: 15
  });
  return { objectPath, uploadUrl, contentType };
}

export async function completeStudentPointIconUpload(input: {
  parentUserId: string;
  profileId: string;
  objectPath: string;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  const expectedPrefix = `student-point-icons/${input.profileId}/`;
  if (!input.objectPath.startsWith(expectedPrefix)) {
    throw new Error("The custom point icon upload is invalid.");
  }
  const metadata = await getPrivateFileMetadata(input.objectPath);
  const contentType = metadata.contentType.toLowerCase().split(";", 1)[0].trim();
  if (!CUSTOM_POINT_ICON_CONTENT_TYPES.has(contentType) || metadata.size <= 0 || metadata.size > CUSTOM_POINT_ICON_MAX_BYTES) {
    throw new Error("The uploaded icon must be a PNG, JPEG, or WebP image up to 512 KB.");
  }
  const bytes = await downloadPrivateFile(input.objectPath);
  if (!isValidCustomPointIcon(bytes, contentType)) {
    throw new Error("The uploaded file does not appear to be a valid image.");
  }
  const currentSettings = await ensureStudentPointSettings(input.profileId);
  const [settings] = await db
    .update(studentPointSettings)
    .set({
      iconKey: "custom",
      customIconPath: input.objectPath,
      updatedByUserId: input.parentUserId,
      updatedAt: new Date()
    })
    .where(eq(studentPointSettings.profileId, input.profileId))
    .returning();
  if (currentSettings.customIconPath?.startsWith(expectedPrefix) && currentSettings.customIconPath !== input.objectPath) {
    await deletePrivateFile(currentSettings.customIconPath).catch((error) => {
      console.warn(`Could not remove the previous custom point icon for ${input.profileId}:`, error);
    });
  }
  return {
    settings: settings!,
    customIconUrl: await getSignedLessonAssetUrl(input.objectPath, 60)
  };
}

export async function discardStudentPointIconUpload(input: {
  parentUserId: string;
  profileId: string;
  objectPath: string;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  const expectedPrefix = `student-point-icons/${input.profileId}/`;
  if (!input.objectPath.startsWith(expectedPrefix)) {
    throw new Error("The custom point icon upload is invalid.");
  }
  const settings = await ensureStudentPointSettings(input.profileId);
  if (settings.customIconPath === input.objectPath) {
    throw new Error("The current custom point icon cannot be discarded as an incomplete upload.");
  }
  await deletePrivateFile(input.objectPath);
  return { discarded: true };
}

export async function awardStudentPoints(input: {
  parentUserId: string;
  profileId: string;
  amount: number;
  reason: string;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  const [actor, { studentProfile }, settings] = await Promise.all([
    requireAccountRole(input.parentUserId, ["OWNER", "ADMIN", "TEACHER"]),
    getManageableStudentProfile(input.parentUserId, input.profileId),
    ensureStudentPointSettings(input.profileId)
  ]);
  const amount = normalizeAmount(input.amount);
  const reason = normalizeReason(input.reason);
  const occurredAt = new Date();
  await accrueStudentPointBankInterest(input.profileId, occurredAt);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`student-points:${input.profileId}`}))`);
    const [summary] = await tx
      .select({
        balance: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null then ${studentPointTransactions.amount} else 0 end), 0)::integer`
      })
      .from(studentPointTransactions)
      .where(eq(studentPointTransactions.profileId, input.profileId));
    const balanceAfter = Number(summary?.balance ?? 0) + amount;
    const [transaction] = await tx.insert(studentPointTransactions).values({
      profileId: input.profileId,
      amount,
      kind: "award",
      reason,
      createdByUserId: input.parentUserId,
      balanceAfter,
      createdAt: occurredAt
    }).returning();
    if (!transaction) throw new Error("The points could not be awarded.");
    await tx.insert(teacherActivityEvents).values({
      accountId: actor.accountId,
      actorUserId: input.parentUserId,
      actorProfileId: actor.profileId,
      studentProfileId: studentProfile.id,
      eventType: "points_awarded",
      metadata: {
        pointTransactionId: transaction.id,
        pointsAmount: amount,
        pointsReason: reason,
        pointSingularName: settings.singularName,
        pointPluralName: settings.pluralName
      }
    });
    return transaction;
  });
}

export async function redeemStudentPoints(input: {
  parentUserId: string;
  profileId: string;
  amount: number;
  reason: string;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  const [actor, { studentProfile }, settings] = await Promise.all([
    requireAccountRole(input.parentUserId, ["OWNER", "ADMIN", "TEACHER"]),
    getManageableStudentProfile(input.parentUserId, input.profileId),
    ensureStudentPointSettings(input.profileId)
  ]);
  const amount = normalizeAmount(input.amount);
  const reason = normalizeReason(input.reason);
  const occurredAt = new Date();
  await accrueStudentPointBankInterest(input.profileId, occurredAt);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`student-points:${input.profileId}`}))`);
    const [summary] = await tx
      .select({
        balance: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null then ${studentPointTransactions.amount} else 0 end), 0)::integer`
      })
      .from(studentPointTransactions)
      .where(eq(studentPointTransactions.profileId, input.profileId));
    const balance = Number(summary?.balance ?? 0);
    if (amount > balance) {
      throw new Error(`Only ${balance} ${balance === 1 ? "point is" : "points are"} currently available.`);
    }
    const [transaction] = await tx
      .insert(studentPointTransactions)
      .values({
        profileId: input.profileId,
        amount: -amount,
        kind: "redemption",
        reason,
        createdByUserId: input.parentUserId,
        balanceAfter: balance - amount,
        createdAt: occurredAt
      })
      .returning();
    if (!transaction) throw new Error("The point usage could not be recorded.");
    await tx.insert(teacherActivityEvents).values({
      accountId: actor.accountId,
      actorUserId: input.parentUserId,
      actorProfileId: actor.profileId,
      studentProfileId: studentProfile.id,
      eventType: "points_used",
      metadata: {
        pointTransactionId: transaction.id,
        pointsAmount: amount,
        pointsReason: reason,
        pointSingularName: settings.singularName,
        pointPluralName: settings.pluralName
      }
    });
    return transaction;
  });
}

export async function depositStudentPointsToBank(input: {
  parentUserId: string;
  profileId: string;
  amount: number;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  await ensureStudentPointSettings(input.profileId);
  const amount = normalizeAmount(input.amount);
  const occurredAt = new Date();
  await accrueStudentPointBankInterest(input.profileId, occurredAt);
  const timeZone = await getStudentPointTimeZone(input.profileId);
  const today = dateKeyInTimeZone(occurredAt, timeZone);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`student-points:${input.profileId}`}))`);
    const [[pointSummary], [bankSummary], [settings]] = await Promise.all([
      tx.select({
        balance: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null then ${studentPointTransactions.amount} else 0 end), 0)::integer`
      }).from(studentPointTransactions).where(eq(studentPointTransactions.profileId, input.profileId)),
      tx.select({
        balance: sql<number>`coalesce(sum(${studentPointBankTransactions.amount}), 0)::integer`
      }).from(studentPointBankTransactions).where(eq(studentPointBankTransactions.profileId, input.profileId)),
      tx.select({
        lastAccrualDate: studentPointSettings.bankLastAccrualDate,
        remainderMicropoints: studentPointSettings.bankInterestRemainderMicropoints
      })
        .from(studentPointSettings)
        .where(eq(studentPointSettings.profileId, input.profileId))
        .limit(1)
    ]);
    const availableBalance = Number(pointSummary?.balance ?? 0);
    const bankBalance = Number(bankSummary?.balance ?? 0);
    if (amount > availableBalance) {
      throw new Error(`Only ${availableBalance} ${availableBalance === 1 ? "point is" : "points are"} available to deposit.`);
    }
    const transferId = randomUUID();
    const availableBalanceAfter = availableBalance - amount;
    const bankBalanceAfter = bankBalance + amount;
    const displayedBankBalanceAfter = bankBalanceAfter + pointsFromMicropoints(settings?.remainderMicropoints ?? 0);
    await tx.insert(studentPointBankTransactions).values({
      profileId: input.profileId,
      amount,
      kind: "deposit",
      reason: "Deposited into bank",
      sourceType: "bank_transfer",
      sourceKey: transferId,
      createdByUserId: input.parentUserId,
      balanceAfter: bankBalanceAfter,
      metadata: {
        transferId,
        availableBalanceAfter,
        remainderMicropointsAfter: settings?.remainderMicropoints ?? 0
      },
      createdAt: occurredAt
    });
    const [transaction] = await tx.insert(studentPointTransactions).values({
      profileId: input.profileId,
      amount: -amount,
      kind: "bank_deposit",
      reason: "Deposited into bank",
      sourceType: "bank_transfer",
      sourceKey: transferId,
      createdByUserId: input.parentUserId,
      balanceAfter: availableBalanceAfter,
      metadata: { transferId, bankBalanceAfter: displayedBankBalanceAfter },
      createdAt: occurredAt
    }).returning();
    if (!settings?.lastAccrualDate) {
      await tx.update(studentPointSettings).set({
        bankLastAccrualDate: today,
        bankInterestAnchorDay: Number(today.slice(-2)),
        updatedAt: occurredAt
      }).where(eq(studentPointSettings.profileId, input.profileId));
    }
    return { transaction: transaction!, availableBalanceAfter, bankBalanceAfter: displayedBankBalanceAfter };
  });
}

export async function withdrawStudentPointsFromBank(input: {
  parentUserId: string;
  profileId: string;
  amount: number;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  await ensureStudentPointSettings(input.profileId);
  const amount = normalizeAmount(input.amount);
  const occurredAt = new Date();
  await accrueStudentPointBankInterest(input.profileId, occurredAt);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`student-points:${input.profileId}`}))`);
    const [[pointSummary], [bankSummary], [settings]] = await Promise.all([
      tx.select({
        balance: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null then ${studentPointTransactions.amount} else 0 end), 0)::integer`
      }).from(studentPointTransactions).where(eq(studentPointTransactions.profileId, input.profileId)),
      tx.select({
        balance: sql<number>`coalesce(sum(${studentPointBankTransactions.amount}), 0)::integer`
      }).from(studentPointBankTransactions).where(eq(studentPointBankTransactions.profileId, input.profileId)),
      tx.select({ remainderMicropoints: studentPointSettings.bankInterestRemainderMicropoints })
        .from(studentPointSettings)
        .where(eq(studentPointSettings.profileId, input.profileId))
        .limit(1)
    ]);
    const availableBalance = Number(pointSummary?.balance ?? 0);
    const bankBalance = Number(bankSummary?.balance ?? 0);
    if (amount > bankBalance) {
      throw new Error(`Only ${bankBalance} ${bankBalance === 1 ? "point is" : "points are"} currently in the bank.`);
    }
    const transferId = randomUUID();
    const availableBalanceAfter = availableBalance + amount;
    const bankBalanceAfter = bankBalance - amount;
    const displayedBankBalanceAfter = bankBalanceAfter + pointsFromMicropoints(settings?.remainderMicropoints ?? 0);
    await tx.insert(studentPointBankTransactions).values({
      profileId: input.profileId,
      amount: -amount,
      kind: "withdrawal",
      reason: "Withdrawn from bank",
      sourceType: "bank_transfer",
      sourceKey: transferId,
      createdByUserId: input.parentUserId,
      balanceAfter: bankBalanceAfter,
      metadata: {
        transferId,
        availableBalanceAfter,
        remainderMicropointsAfter: settings?.remainderMicropoints ?? 0
      },
      createdAt: occurredAt
    });
    const [transaction] = await tx.insert(studentPointTransactions).values({
      profileId: input.profileId,
      amount,
      kind: "bank_withdrawal",
      reason: "Withdrawn from bank",
      sourceType: "bank_transfer",
      sourceKey: transferId,
      createdByUserId: input.parentUserId,
      balanceAfter: availableBalanceAfter,
      metadata: { transferId, bankBalanceAfter: displayedBankBalanceAfter },
      createdAt: occurredAt
    }).returning();
    return { transaction: transaction!, availableBalanceAfter, bankBalanceAfter: displayedBankBalanceAfter };
  });
}

function lessonCompletionSourceKey(input: {
  weeklyPlanId: string;
  dayNumber: number;
  subjectKey: string;
}) {
  return `${input.weeklyPlanId}:${input.dayNumber}:${input.subjectKey}`;
}

export async function applyAutomaticLessonCompletionPoint(input: {
  profileId: string;
  actorUserId: string;
  weeklyPlanId: string;
  weekNumber: number;
  dayNumber: number;
  subjectKey: string;
  subjectLabel: string;
}) {
  const [settings] = await db
    .select({
      enabled: studentPointSettings.autoAwardLessonCompletion
    })
    .from(studentPointSettings)
    .where(eq(studentPointSettings.profileId, input.profileId))
    .limit(1);
  if (!settings?.enabled) return null;
  const reason = `Completed ${input.subjectLabel} · Week ${input.weekNumber} · Day ${input.dayNumber}`;
  const occurredAt = new Date();
  await accrueStudentPointBankInterest(input.profileId, occurredAt);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`student-points:${input.profileId}`}))`);
    const sourceKey = lessonCompletionSourceKey(input);
    const [existing] = await tx
      .select()
      .from(studentPointTransactions)
      .where(and(
        eq(studentPointTransactions.profileId, input.profileId),
        eq(studentPointTransactions.sourceType, "lesson_completion"),
        eq(studentPointTransactions.sourceKey, sourceKey)
      ))
      .limit(1);
    if (existing && !existing.reversedAt) {
      const [transaction] = await tx
        .update(studentPointTransactions)
        .set({
          reason,
          createdByUserId: input.actorUserId,
          updatedAt: occurredAt
        })
        .where(eq(studentPointTransactions.id, existing.id))
        .returning();
      return transaction!;
    }
    const [summary] = await tx
      .select({
        balance: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null then ${studentPointTransactions.amount} else 0 end), 0)::integer`
      })
      .from(studentPointTransactions)
      .where(eq(studentPointTransactions.profileId, input.profileId));
    const balanceAfter = Number(summary?.balance ?? 0) + 1;
    const metadata = {
      weeklyPlanId: input.weeklyPlanId,
      weekNumber: input.weekNumber,
      dayNumber: input.dayNumber,
      subjectKey: input.subjectKey,
      subjectLabel: input.subjectLabel
    };
    if (existing) {
      const [transaction] = await tx
        .update(studentPointTransactions)
        .set({
          reason,
          createdByUserId: input.actorUserId,
          reversedAt: null,
          reversedByUserId: null,
          balanceAfter,
          metadata,
          createdAt: occurredAt,
          updatedAt: occurredAt
        })
        .where(eq(studentPointTransactions.id, existing.id))
        .returning();
      return transaction!;
    }
    const [transaction] = await tx
      .insert(studentPointTransactions)
      .values({
        profileId: input.profileId,
        amount: 1,
        kind: "lesson_completion",
        reason,
        sourceType: "lesson_completion",
        sourceKey,
        createdByUserId: input.actorUserId,
        balanceAfter,
        metadata,
        createdAt: occurredAt
      })
      .returning();
    return transaction!;
  });
}

export async function reverseAutomaticLessonCompletionPoint(input: {
  profileId: string;
  actorUserId: string;
  weeklyPlanId: string;
  dayNumber: number;
  subjectKey: string;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`student-points:${input.profileId}`}))`);
    const reversedAt = new Date();
    const [transaction] = await tx
      .update(studentPointTransactions)
      .set({
        reversedAt,
        reversedByUserId: input.actorUserId,
        updatedAt: reversedAt
      })
      .where(and(
        eq(studentPointTransactions.profileId, input.profileId),
        eq(studentPointTransactions.sourceType, "lesson_completion"),
        eq(studentPointTransactions.sourceKey, lessonCompletionSourceKey(input)),
        isNull(studentPointTransactions.reversedAt)
      ))
      .returning();
    return transaction ?? null;
  });
}
