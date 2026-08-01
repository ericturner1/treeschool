import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  profiles,
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

export async function getStudentPoints(input: {
  parentUserId: string;
  profileId: string;
  historyLimit?: number;
  historyOffset?: number;
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  const [{ studentProfile }, requester, settings] = await Promise.all([
    getManageableStudentProfile(input.parentUserId, input.profileId),
    getAccountMemberContext(input.parentUserId),
    ensureStudentPointSettings(input.profileId)
  ]);
  const historyLimit = normalizeWholeNumber(input.historyLimit, 100, 1, 250);
  const historyOffset = normalizeWholeNumber(input.historyOffset, 0, 0, 1_000_000);
  const [summaryRows, transactions] = await Promise.all([
    db
      .select({
        balance: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null then ${studentPointTransactions.amount} else 0 end), 0)::integer`,
        lifetimeEarned: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null and ${studentPointTransactions.amount} > 0 then ${studentPointTransactions.amount} else 0 end), 0)::integer`,
        lifetimeUsed: sql<number>`coalesce(sum(case when ${studentPointTransactions.reversedAt} is null and ${studentPointTransactions.amount} < 0 then -${studentPointTransactions.amount} else 0 end), 0)::integer`,
        transactionCount: sql<number>`count(*)::integer`
      })
      .from(studentPointTransactions)
      .where(eq(studentPointTransactions.profileId, input.profileId)),
    db
      .select()
      .from(studentPointTransactions)
      .where(eq(studentPointTransactions.profileId, input.profileId))
      .orderBy(desc(studentPointTransactions.createdAt))
      .limit(historyLimit)
      .offset(historyOffset)
  ]);
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
  const summary = summaryRows[0] ?? { balance: 0, lifetimeEarned: 0, lifetimeUsed: 0 };
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
      autoAwardLessonCompletion: settings.autoAwardLessonCompletion
    },
    summary: {
      balance: Number(summary.balance ?? 0),
      lifetimeEarned: Number(summary.lifetimeEarned ?? 0),
      lifetimeUsed: Number(summary.lifetimeUsed ?? 0)
    },
    history: {
      offset: historyOffset,
      limit: historyLimit,
      total: Number(summary.transactionCount ?? 0)
    },
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      kind: transaction.kind,
      reason: transaction.reason,
      actorName: transaction.createdByUserId
        ? actorNames.get(transaction.createdByUserId) ?? "Account member"
        : "Treeschool",
      reversed: Boolean(transaction.reversedAt),
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
}) {
  await requirePremiumFeatureAccess(input.parentUserId);
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  const singularName = normalizeName(input.singularName, "point");
  const pluralName = normalizeName(input.pluralName, `${singularName}s`);
  const iconKey = normalizeIconKey(input.iconKey);
  const currentSettings = await ensureStudentPointSettings(input.profileId);
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
      updatedByUserId: input.parentUserId
    })
    .onConflictDoUpdate({
      target: studentPointSettings.profileId,
      set: {
        singularName,
        pluralName,
        iconKey,
        autoAwardLessonCompletion: input.autoAwardLessonCompletion,
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
  return db.transaction(async (tx) => {
    const [transaction] = await tx.insert(studentPointTransactions).values({
      profileId: input.profileId,
      amount,
      kind: "award",
      reason,
      createdByUserId: input.parentUserId
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
        createdByUserId: input.parentUserId
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
  const [transaction] = await db
    .insert(studentPointTransactions)
    .values({
      profileId: input.profileId,
      amount: 1,
      kind: "lesson_completion",
      reason,
      sourceType: "lesson_completion",
      sourceKey: lessonCompletionSourceKey(input),
      createdByUserId: input.actorUserId,
      metadata: {
        weeklyPlanId: input.weeklyPlanId,
        weekNumber: input.weekNumber,
        dayNumber: input.dayNumber,
        subjectKey: input.subjectKey,
        subjectLabel: input.subjectLabel
      }
    })
    .onConflictDoUpdate({
      target: [
        studentPointTransactions.profileId,
        studentPointTransactions.sourceType,
        studentPointTransactions.sourceKey
      ],
      set: {
        reason,
        createdByUserId: input.actorUserId,
        reversedAt: null,
        reversedByUserId: null,
        updatedAt: new Date()
      }
    })
    .returning();
  return transaction!;
}

export async function reverseAutomaticLessonCompletionPoint(input: {
  profileId: string;
  actorUserId: string;
  weeklyPlanId: string;
  dayNumber: number;
  subjectKey: string;
}) {
  const [transaction] = await db
    .update(studentPointTransactions)
    .set({
      reversedAt: new Date(),
      reversedByUserId: input.actorUserId,
      updatedAt: new Date()
    })
    .where(and(
      eq(studentPointTransactions.profileId, input.profileId),
      eq(studentPointTransactions.sourceType, "lesson_completion"),
      eq(studentPointTransactions.sourceKey, lessonCompletionSourceKey(input)),
      isNull(studentPointTransactions.reversedAt)
    ))
    .returning();
  return transaction ?? null;
}
