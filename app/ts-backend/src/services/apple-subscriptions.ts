import {
  AutoRenewStatus,
  Environment,
  SignedDataVerifier,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload
} from "@apple/app-store-server-library";
import { and, eq } from "drizzle-orm";
import {
  accounts,
  appleSubscriptionNotifications,
  appleSubscriptionTransactions,
  profiles,
  subscriptions
} from "ts-db";
import { db } from "../db";
import { getPremiumFeatureAccess } from "./entitlements";
import {
  APPLE_MONTHLY_PRODUCT_ID,
  APPLE_YEARLY_PRODUCT_ID,
  deriveAppleSubscriptionStatus,
  getAppleProductInterval
} from "./apple-subscription-model";

const APPLE_BUNDLE_ID = "com.treehomeschool.app";
const APPLE_APP_ID = 6807247970;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Public Apple PKI roots. Keeping these in the bundle makes verification work in
// the minimal Cloud Run image without relying on a mutable host certificate path.
const APPLE_ROOT_CERTIFICATES_BASE64 = [
  "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"
];

const verifiers = new Map<Environment, SignedDataVerifier>();

function getVerifier(environment: Environment) {
  let verifier = verifiers.get(environment);
  if (!verifier) {
    verifier = new SignedDataVerifier(
      APPLE_ROOT_CERTIFICATES_BASE64.map((certificate) => Buffer.from(certificate, "base64")),
      true,
      environment,
      APPLE_BUNDLE_ID,
      environment === Environment.PRODUCTION ? APPLE_APP_ID : undefined
    );
    verifiers.set(environment, verifier);
  }
  return verifier;
}

async function verifyInEitherEnvironment<T>(verify: (verifier: SignedDataVerifier) => Promise<T>) {
  try {
    return {
      payload: await verify(getVerifier(Environment.PRODUCTION)),
      environment: Environment.PRODUCTION
    };
  } catch (productionError) {
    try {
      return {
        payload: await verify(getVerifier(Environment.SANDBOX)),
        environment: Environment.SANDBOX
      };
    } catch {
      throw productionError;
    }
  }
}

function dateFromMilliseconds(value: number | undefined) {
  return value == null ? null : new Date(value);
}

async function getParentAccountId(userId: string) {
  const [parent] = await db.select({ accountId: profiles.accountId })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);
  if (!parent) throw new Error("Parent account not found.");
  return parent.accountId;
}

function requireSupportedTransaction(transaction: JWSTransactionDecodedPayload) {
  const interval = getAppleProductInterval(transaction.productId);
  if (!interval) throw new Error("This App Store product is not a Treeschool membership.");
  if (!transaction.transactionId || !transaction.originalTransactionId) {
    throw new Error("The App Store transaction is missing its identifiers.");
  }
  if (transaction.type && transaction.type !== "Auto-Renewable Subscription") {
    throw new Error("The App Store purchase is not an auto-renewable subscription.");
  }
  return {
    interval,
    transactionId: transaction.transactionId,
    originalTransactionId: transaction.originalTransactionId,
    productId: transaction.productId!
  };
}

async function saveAppleSubscription(input: {
  accountId: string;
  transaction: JWSTransactionDecodedPayload;
  renewal?: JWSRenewalInfoDecodedPayload | null;
  environment: Environment;
  notificationType?: string;
}) {
  const identifiers = requireSupportedTransaction(input.transaction);
  const status = deriveAppleSubscriptionStatus({
    transaction: input.transaction,
    renewal: input.renewal ?? null,
    notificationType: input.notificationType
  });
  const currentPeriodStart = dateFromMilliseconds(input.transaction.purchaseDate);
  const currentPeriodEnd = dateFromMilliseconds(input.transaction.expiresDate);
  const cancelAtPeriodEnd = input.renewal?.autoRenewStatus === AutoRenewStatus.OFF;

  await db.transaction(async (tx) => {
    const [claimedSubscription] = await tx
      .select({ accountId: subscriptions.accountId })
      .from(subscriptions)
      .where(eq(subscriptions.appleOriginalTransactionId, identifiers.originalTransactionId))
      .limit(1);
    if (claimedSubscription && claimedSubscription.accountId !== input.accountId) {
      throw new Error("This App Store subscription is already linked to another Treeschool family.");
    }

    const [accountSubscription] = await tx
      .select({
        billingProvider: subscriptions.billingProvider,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        stripeCustomerId: subscriptions.stripeCustomerId,
        appleLastTransactionId: subscriptions.appleLastTransactionId
      })
      .from(subscriptions)
      .where(eq(subscriptions.accountId, input.accountId))
      .limit(1);
    const activeStripeSubscription = accountSubscription?.billingProvider === "stripe" &&
      ["trialing", "active", "past_due"].includes(accountSubscription.status) &&
      (!accountSubscription.currentPeriodEnd || accountSubscription.currentPeriodEnd > new Date());
    if (activeStripeSubscription) {
      throw new Error("This family already has a website subscription. Manage that plan on the Treeschool website before subscribing through Apple.");
    }

    await tx.insert(appleSubscriptionTransactions).values({
      transactionId: identifiers.transactionId,
      originalTransactionId: identifiers.originalTransactionId,
      accountId: input.accountId,
      productId: identifiers.productId,
      environment: input.environment,
      purchaseDate: currentPeriodStart,
      expiresDate: currentPeriodEnd,
      revocationDate: dateFromMilliseconds(input.transaction.revocationDate)
    }).onConflictDoNothing();

    const isOlderThanStoredPeriod =
      accountSubscription?.billingProvider === "apple" &&
      accountSubscription.appleLastTransactionId !== identifiers.transactionId &&
      Boolean(accountSubscription.currentPeriodEnd) &&
      Boolean(currentPeriodEnd) &&
      currentPeriodEnd! < accountSubscription.currentPeriodEnd!;
    if (isOlderThanStoredPeriod) return;

    await tx.insert(subscriptions).values({
      accountId: input.accountId,
      status,
      planTier: "standard",
      billingProvider: "apple",
      stripeCustomerId: accountSubscription?.stripeCustomerId ?? null,
      stripeSubscriptionId: null,
      appleOriginalTransactionId: identifiers.originalTransactionId,
      appleLastTransactionId: identifiers.transactionId,
      appleProductId: identifiers.productId,
      appleEnvironment: input.environment,
      billingInterval: identifiers.interval,
      introductoryOffer: null,
      introductoryOfferEndsAt: null,
      stripeAdditionalStudentItemId: null,
      additionalStudentQuantity: 0,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      updatedAt: new Date()
    }).onConflictDoUpdate({
      target: subscriptions.accountId,
      set: {
        status,
        planTier: "standard",
        billingProvider: "apple",
        stripeSubscriptionId: null,
        appleOriginalTransactionId: identifiers.originalTransactionId,
        appleLastTransactionId: identifiers.transactionId,
        appleProductId: identifiers.productId,
        appleEnvironment: input.environment,
        billingInterval: identifiers.interval,
        introductoryOffer: null,
        introductoryOfferEndsAt: null,
        stripeAdditionalStudentItemId: null,
        additionalStudentQuantity: 0,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd,
        updatedAt: new Date()
      }
    });

    await tx.update(accounts).set({
      planType: status === "active" ? "premium" : "free"
    }).where(eq(accounts.id, input.accountId));
  });

  return { status, ...identifiers };
}

export async function getMobileMembership(userId: string) {
  const accountId = await getParentAccountId(userId);
  const access = await getPremiumFeatureAccess(userId);
  const [subscription] = await db.select({
    billingProvider: subscriptions.billingProvider,
    billingInterval: subscriptions.billingInterval,
    currentPeriodEnd: subscriptions.currentPeriodEnd,
    cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd
  }).from(subscriptions).where(eq(subscriptions.accountId, accountId)).limit(1);
  return {
    accountId,
    allowed: access.allowed,
    isSubscriber: access.isSubscriber,
    source: access.source,
    planTier: access.planTier,
    billingProvider: subscription?.billingProvider ?? null,
    billingInterval: subscription?.billingInterval ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    products: {
      monthly: APPLE_MONTHLY_PRODUCT_ID,
      yearly: APPLE_YEARLY_PRODUCT_ID
    }
  };
}

export async function verifyApplePurchase(input: { userId: string; signedTransaction: string }) {
  const accountId = await getParentAccountId(input.userId);
  const verified = await verifyInEitherEnvironment((verifier) =>
    verifier.verifyAndDecodeTransaction(input.signedTransaction)
  );
  const transaction = verified.payload;
  if (transaction.appAccountToken && transaction.appAccountToken.toLowerCase() !== accountId.toLowerCase()) {
    throw new Error("This App Store purchase belongs to a different Treeschool family.");
  }
  return saveAppleSubscription({
    accountId,
    transaction,
    environment: verified.environment
  });
}

async function verifyNotification(signedPayload: string) {
  return verifyInEitherEnvironment((verifier) => verifier.verifyAndDecodeNotification(signedPayload));
}

export async function handleAppleSubscriptionNotification(signedPayload: string) {
  const verified = await verifyNotification(signedPayload);
  const notification: ResponseBodyV2DecodedPayload = verified.payload;
  if (!notification.notificationUUID || !notification.notificationType) {
    throw new Error("The App Store notification is missing required fields.");
  }
  const [alreadyProcessed] = await db.select({
    notificationUuid: appleSubscriptionNotifications.notificationUuid
  }).from(appleSubscriptionNotifications).where(
    eq(appleSubscriptionNotifications.notificationUuid, notification.notificationUUID)
  ).limit(1);
  if (alreadyProcessed) return { processed: true, duplicate: true };

  const signedTransaction = notification.data?.signedTransactionInfo;
  if (!signedTransaction) {
    await db.insert(appleSubscriptionNotifications).values({
      notificationUuid: notification.notificationUUID,
      notificationType: notification.notificationType,
      subtype: notification.subtype ?? null,
      signedAt: dateFromMilliseconds(notification.signedDate)
    }).onConflictDoNothing();
    return { processed: true, ignored: true };
  }

  const verifier = getVerifier(verified.environment);
  const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
  const identifiers = requireSupportedTransaction(transaction);
  const renewal = notification.data?.signedRenewalInfo
    ? await verifier.verifyAndDecodeRenewalInfo(notification.data.signedRenewalInfo)
    : null;
  const [linkedSubscription] = await db.select({ accountId: subscriptions.accountId })
    .from(subscriptions)
    .where(eq(subscriptions.appleOriginalTransactionId, identifiers.originalTransactionId))
    .limit(1);
  const tokenAccountId = transaction.appAccountToken?.toLowerCase();
  const accountId = linkedSubscription?.accountId ?? (
    tokenAccountId && UUID_PATTERN.test(tokenAccountId) ? tokenAccountId : null
  );
  if (!accountId) {
    throw new Error("The App Store subscription is not linked to a Treeschool account.");
  }
  const [account] = await db.select({ id: accounts.id }).from(accounts)
    .where(eq(accounts.id, accountId)).limit(1);
  if (!account) throw new Error("The linked Treeschool account no longer exists.");

  await saveAppleSubscription({
    accountId,
    transaction,
    renewal,
    environment: verified.environment,
    notificationType: notification.notificationType
  });
  await db.insert(appleSubscriptionNotifications).values({
    notificationUuid: notification.notificationUUID,
    notificationType: notification.notificationType,
    subtype: notification.subtype ?? null,
    originalTransactionId: identifiers.originalTransactionId,
    signedAt: dateFromMilliseconds(notification.signedDate)
  }).onConflictDoNothing();
  return { processed: true, duplicate: false };
}
