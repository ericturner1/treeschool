import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  accounts,
  learningYears,
  planGenerationEvents,
  planPackIntakes,
  profiles,
  subscriptions
} from "ts-db";
import { db } from "../db";
import { isIntroductoryOfferActive } from "./billing-introductory-offer";
import { getMembershipPlan } from "./membership-plans";

const DAY_MS = 24 * 60 * 60 * 1000;

async function getParentAccount(userId: string) {
  const [account] = await db
    .select({ accountId: accounts.id })
    .from(profiles)
    .innerJoin(accounts, eq(accounts.id, profiles.accountId))
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);
  if (!account) throw new Error("Parent account not found.");
  return account;
}

export async function getPremiumFeatureAccess(userId: string) {
  const { accountId } = await getParentAccount(userId);
  const now = new Date();
  const [subscription] = await db
    .select({
      status: subscriptions.status,
      planTier: subscriptions.planTier,
      introductoryOffer: subscriptions.introductoryOffer,
      introductoryOfferEndsAt: subscriptions.introductoryOfferEndsAt,
      additionalStudentQuantity: subscriptions.additionalStudentQuantity,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd
    })
    .from(subscriptions)
    .where(eq(subscriptions.accountId, accountId))
    .limit(1);
  const [planPack] = await db
    .select({
      id: planPackIntakes.id,
      trialStartedAt: planPackIntakes.premiumTrialStartedAt,
      trialEndsAt: planPackIntakes.premiumTrialEndsAt
    })
    .from(planPackIntakes)
    .where(and(
      eq(planPackIntakes.accountId, accountId),
      isNotNull(planPackIntakes.premiumTrialStartedAt)
    ))
    .orderBy(desc(planPackIntakes.premiumTrialEndsAt), desc(planPackIntakes.updatedAt))
    .limit(1);

  const subscriptionActive = Boolean(
    subscription &&
      ["trialing", "active"].includes(subscription.status) &&
      (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now)
  );
  const trialActive = Boolean(planPack?.trialEndsAt && planPack.trialEndsAt > now);
  const introductoryMonth = subscriptionActive && isIntroductoryOfferActive(subscription, now);
  const allowed = subscriptionActive || trialActive;
  const daysRemaining = trialActive && planPack?.trialEndsAt
    ? Math.max(1, Math.ceil((planPack.trialEndsAt.getTime() - now.getTime()) / DAY_MS))
    : 0;

  return {
    accountId,
    planPackId: planPack?.id ?? null,
    subscriptionPeriodStart: subscription?.currentPeriodStart?.toISOString() ?? null,
    subscriptionPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    subscriptionStatus: subscription?.status ?? null,
    planTier: subscription?.planTier ?? null,
    introductoryMonth,
    additionalStudentQuantity: subscription?.additionalStudentQuantity ?? 0,
    allowed,
    isSubscriber: subscriptionActive,
    hasPlanPack: Boolean(planPack?.trialStartedAt),
    downloadOnly: Boolean(planPack?.trialStartedAt && !allowed),
    source: subscriptionActive ? "subscription" as const : trialActive ? "plan_pack_trial" as const : "none" as const,
    trial: {
      active: trialActive,
      startedAt: planPack?.trialStartedAt?.toISOString() ?? null,
      endsAt: planPack?.trialEndsAt?.toISOString() ?? null,
      daysRemaining
    }
  };
}

export async function requirePremiumFeatureAccess(userId: string) {
  const access = await getPremiumFeatureAccess(userId);
  if (!access.allowed) {
    throw new Error("Upgrade to a Treeschool membership to use grades, attendance, progress, and live planning tools.");
  }
  return access;
}

function currentMonthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

function addUtcMonthsClamped(value: Date, months: number) {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + months;
  const day = value.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year,
    month,
    Math.min(day, lastDay),
    value.getUTCHours(),
    value.getUTCMinutes(),
    value.getUTCSeconds(),
    value.getUTCMilliseconds()
  ));
}

function getSubscriptionAllowanceWindow(periodStart: string | null, periodEnd: string | null, now = new Date()) {
  if (!periodStart) {
    return {
      periodKey: currentMonthKey(now),
      resetsAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
    };
  }

  const billingAnchor = new Date(periodStart);
  let windowStart = billingAnchor;
  let monthOffset = 1;
  let windowEnd = addUtcMonthsClamped(billingAnchor, monthOffset);
  while (windowEnd <= now) {
    windowStart = windowEnd;
    monthOffset += 1;
    windowEnd = addUtcMonthsClamped(billingAnchor, monthOffset);
  }

  const subscriptionEnd = periodEnd ? new Date(periodEnd) : null;
  const resetAt = subscriptionEnd && subscriptionEnd < windowEnd ? subscriptionEnd : windowEnd;
  return {
    periodKey: windowStart.toISOString(),
    resetsAt: resetAt.toISOString()
  };
}

export async function getPlanRegenerationAllowance(userId: string) {
  const access = await getPremiumFeatureAccess(userId);
  if (access.introductoryMonth) {
    return {
      source: "subscription" as const,
      periodKey: access.subscriptionPeriodStart,
      limit: 0,
      used: 0,
      remaining: 0,
      resetsAt: access.subscriptionPeriodEnd,
      introductoryMonth: true
    };
  }
  const source = access.isSubscriber ? "subscription" as const : "plan_pack" as const;
  const subscriptionWindow = getSubscriptionAllowanceWindow(
    access.subscriptionPeriodStart,
    access.subscriptionPeriodEnd
  );
  const periodKey = access.isSubscriber ? subscriptionWindow.periodKey : access.planPackId;
  const limit = access.isSubscriber ? 5 : 3;
  const conditions = [
    eq(planGenerationEvents.accountId, access.accountId),
    eq(planGenerationEvents.kind, "replan"),
    eq(planGenerationEvents.allowanceSource, source),
    inArray(planGenerationEvents.status, ["queued", "completed"])
  ];
  if (periodKey) conditions.push(eq(planGenerationEvents.periodKey, periodKey));
  const [usage] = await db
    .select({ count: sql<number>`count(*)::integer` })
    .from(planGenerationEvents)
    .where(and(...conditions));
  const used = Number(usage?.count ?? 0);
  return {
    source,
    periodKey,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsAt: access.isSubscriber ? subscriptionWindow.resetsAt : access.trial.endsAt,
    introductoryMonth: false
  };
}

export async function reservePlanGeneration(input: {
  userId: string;
  learningYearId: string;
  isReplan: boolean;
}) {
  const access = await getPremiumFeatureAccess(input.userId);
  if (!input.isReplan) {
    if (access.introductoryMonth) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${access.accountId}))`);
        const [year] = await tx
          .select({ profileId: learningYears.profileId })
          .from(learningYears)
          .innerJoin(profiles, eq(profiles.id, learningYears.profileId))
          .where(and(
            eq(learningYears.id, input.learningYearId),
            eq(profiles.accountId, access.accountId),
            eq(profiles.role, "STUDENT")
          ))
          .limit(1);
        if (!year) throw new Error("This learning year does not belong to a student in your family.");

        const introConditions = [
          eq(planGenerationEvents.accountId, access.accountId),
          eq(planGenerationEvents.kind, "initial"),
          eq(planGenerationEvents.allowanceSource, "subscription_intro"),
          inArray(planGenerationEvents.status, ["queued", "completed"])
        ];
        const [studentUsage] = await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(planGenerationEvents)
          .innerJoin(learningYears, eq(learningYears.id, planGenerationEvents.learningYearId))
          .where(and(...introConditions, eq(learningYears.profileId, year.profileId)));
        const [accountUsage] = await tx
          .select({ count: sql<number>`count(distinct ${learningYears.profileId})::integer` })
          .from(planGenerationEvents)
          .innerJoin(learningYears, eq(learningYears.id, planGenerationEvents.learningYearId))
          .where(and(...introConditions));
        if (Number(studentUsage?.count ?? 0) > 0) {
          throw new Error(
            "The introductory month includes one initial lesson plan for each student. Plan updates unlock after the first regular renewal."
          );
        }
        const includedStudentCount = getMembershipPlan(access.planTier ?? "standard").includedStudentCount;
        const limit = includedStudentCount + access.additionalStudentQuantity;
        if (Number(accountUsage?.count ?? 0) >= limit) {
          throw new Error(
            `The introductory month includes ${limit} initial lesson-plan generations—one for each paid student seat.`
          );
        }
        const [event] = await tx.insert(planGenerationEvents).values({
          accountId: access.accountId,
          learningYearId: input.learningYearId,
          kind: "initial",
          allowanceSource: "subscription_intro",
          periodKey: access.subscriptionPeriodStart,
          status: "queued"
        }).returning();
        return event;
      });
    }
    const [event] = await db.insert(planGenerationEvents).values({
      accountId: access.accountId,
      learningYearId: input.learningYearId,
      kind: "initial",
      allowanceSource: "initial",
      status: "queued"
    }).returning();
    return event;
  }
  if (!access.allowed) {
    throw new Error("Upgrade or purchase another printable plan to replan future weeks.");
  }
  if (access.introductoryMonth) {
    throw new Error(
      `Your introductory month includes one initial lesson plan per student. Plan updates unlock after the first ${access.planTier === "single" ? "$14" : "$20"} renewal.`
    );
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${access.accountId}))`);
    const source = access.isSubscriber ? "subscription" : "plan_pack";
    const subscriptionWindow = getSubscriptionAllowanceWindow(
      access.subscriptionPeriodStart,
      access.subscriptionPeriodEnd
    );
    const periodKey = access.isSubscriber ? subscriptionWindow.periodKey : access.planPackId;
    const limit = access.isSubscriber ? 5 : 3;
    const conditions = [
      eq(planGenerationEvents.accountId, access.accountId),
      eq(planGenerationEvents.kind, "replan"),
      eq(planGenerationEvents.allowanceSource, source),
      inArray(planGenerationEvents.status, ["queued", "completed"])
    ];
    if (periodKey) conditions.push(eq(planGenerationEvents.periodKey, periodKey));
    const [usage] = await tx
      .select({ count: sql<number>`count(*)::integer` })
      .from(planGenerationEvents)
      .where(and(...conditions));
    if (Number(usage?.count ?? 0) >= limit) {
      throw new Error(
        access.isSubscriber
          ? "You have used all 5 plan updates for this month. Your allowance resets next month."
          : "You have used all 3 plan updates included with this printable plan. Subscribe or purchase another plan to continue."
      );
    }
    const [event] = await tx.insert(planGenerationEvents).values({
      accountId: access.accountId,
      learningYearId: input.learningYearId,
      kind: "replan",
      allowanceSource: source,
      periodKey,
      status: "queued"
    }).returning();
    return event;
  });
}

export async function finishPlanGenerationEvent(eventId: string | null, succeeded: boolean) {
  if (!eventId) return;
  await db.update(planGenerationEvents).set({
    status: succeeded ? "completed" : "failed",
    completedAt: new Date()
  }).where(eq(planGenerationEvents.id, eventId));
}
