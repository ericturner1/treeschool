import { createHash, sign } from "node:crypto";
import { connect, type ClientHttp2Session } from "node:http2";
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { mobilePushDevices, mobilePushReminderDeliveries, profiles } from "ts-db";
import { db, env } from "../db";
import { getAccountMemberContext } from "./accounts";
import { getCalculatedStreakStatus } from "./school-calendar";

export type MobilePushEnvironment = "sandbox" | "production";

type RegisteredDevice = {
  id: string;
  token: string;
  environment: string;
  bundleId: string;
};

export type MobilePushMessage = {
  title: string;
  body: string;
  collapseId: string;
  data: Record<string, string>;
};

type ApnsResponse = {
  status: number;
  reason: string | null;
};

const DEVICE_TOKEN_PATTERN = /^[0-9a-f]{64,200}$/;
const INVALID_DEVICE_REASONS = new Set([
  "BadDeviceToken",
  "DeviceTokenNotForTopic",
  "Unregistered"
]);
const PROVIDER_TOKEN_LIFETIME_MS = 50 * 60 * 1000;
const REMINDER_CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const SCHOOLWORK_REMINDER_KIND = "schoolwork_noon";

let cachedProviderToken: {
  token: string;
  expiresAt: number;
  keyId: string;
} | null = null;
let warnedAboutMissingConfiguration = false;

function normalizeToken(value: string) {
  const token = value.trim().toLowerCase().replace(/[<>\s]/g, "");
  if (!DEVICE_TOKEN_PATTERN.test(token)) {
    throw new Error("The iPhone notification token is invalid.");
  }
  return token;
}

function normalizeEnvironment(value: string): MobilePushEnvironment {
  if (value === "sandbox" || value === "production") return value;
  throw new Error("The push notification environment is invalid.");
}

function cleanLabel(value: string, fallback: string) {
  const label = value.trim().replace(/[.!?]+$/g, "");
  return label || fallback;
}

function collapseId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

export function buildCompletionPushMessages(input: {
  actorName: string;
  studentName: string;
  studentProfileId: string;
  weeklyPlanId: string;
  weekNumber: number;
  weekTitle: string;
  dayNumber: number;
  lessons: Array<{
    subjectKey: string;
    title: string;
  }>;
  weekNewlyCompleted: boolean;
}) {
  const actorName = cleanLabel(input.actorName, "A teacher");
  const studentName = cleanLabel(input.studentName, "the student");
  const messages: MobilePushMessage[] = input.lessons.map((lesson) => {
    const lessonTitle = cleanLabel(lesson.title, "a lesson");
    return {
      title: "Lesson completed",
      body: `${actorName} marked ${studentName} as done with ${lessonTitle}.`,
      collapseId: collapseId(
        `lesson:${input.weeklyPlanId}:${input.dayNumber}:${lesson.subjectKey}`
      ),
      data: {
        type: "lesson_completed",
        studentProfileId: input.studentProfileId,
        weeklyPlanId: input.weeklyPlanId,
        dayNumber: String(input.dayNumber),
        subjectKey: lesson.subjectKey
      }
    };
  });

  if (input.weekNewlyCompleted) {
    const weekTitle = cleanLabel(input.weekTitle, `Week ${input.weekNumber}`);
    messages.push({
      title: "Week completed",
      body: `${actorName} marked ${studentName} as done with ${weekTitle}.`,
      collapseId: collapseId(`week:${input.weeklyPlanId}`),
      data: {
        type: "week_completed",
        studentProfileId: input.studentProfileId,
        weeklyPlanId: input.weeklyPlanId,
        weekNumber: String(input.weekNumber)
      }
    });
  }

  return messages;
}

export function buildPointAwardPushMessage(input: {
  actorName: string;
  studentName: string;
  studentProfileId: string;
  pointTransactionId: string;
  amount: number;
  reason: string;
  singularName: string;
  pluralName: string;
}): MobilePushMessage {
  const actorName = cleanLabel(input.actorName, "A teacher");
  const studentName = cleanLabel(input.studentName, "the student");
  const reason = cleanLabel(input.reason, "good work");
  const unit = cleanLabel(
    input.amount === 1 ? input.singularName : input.pluralName,
    input.amount === 1 ? "point" : "points"
  );
  return {
    title: "Points awarded",
    body: `${actorName} gave ${studentName} ${input.amount} ${unit} for ${reason}.`,
    collapseId: collapseId(`points:${input.pointTransactionId}`),
    data: {
      type: "points_awarded",
      studentProfileId: input.studentProfileId,
      pointTransactionId: input.pointTransactionId,
      amount: String(input.amount)
    }
  };
}

export function buildSchoolworkReminderPushMessage(input: {
  studentName: string;
  studentProfileId: string;
  reminderDate: string;
  currentStreak: number;
}): MobilePushMessage {
  const studentName = cleanLabel(input.studentName, "Your student");
  const streakUnit = input.currentStreak === 1 ? "school day" : "school days";
  return {
    title: "Schoolwork reminder",
    body: `Don’t forget to do schoolwork today! ${studentName}’s current streak is ${input.currentStreak} ${streakUnit}.`,
    collapseId: collapseId(`schoolwork-reminder:${input.studentProfileId}:${input.reminderDate}`),
    data: {
      type: "schoolwork_reminder",
      studentProfileId: input.studentProfileId,
      reminderDate: input.reminderDate,
      currentStreak: String(input.currentStreak)
    }
  };
}

export function schoolworkReminderClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour)
  };
}

export function isSchoolworkReminderDue(input: {
  localHour: number;
  isSchoolDayToday: boolean;
  schoolworkCompletedToday: boolean;
}) {
  return input.localHour >= 12 &&
    input.isSchoolDayToday &&
    !input.schoolworkCompletedToday;
}

export async function registerMobilePushDevice(input: {
  userId: string;
  token: string;
  environment: string;
  bundleId?: string | null;
}) {
  const member = await getAccountMemberContext(input.userId);
  const token = normalizeToken(input.token);
  const environment = normalizeEnvironment(input.environment);
  const bundleId = input.bundleId?.trim() || env.APNS_BUNDLE_ID;
  if (bundleId !== env.APNS_BUNDLE_ID) {
    throw new Error("The push notification app identifier is invalid.");
  }
  const now = new Date();
  const [device] = await db.insert(mobilePushDevices).values({
    accountId: member.accountId,
    userId: input.userId,
    token,
    platform: "ios",
    environment,
    bundleId,
    lastSeenAt: now,
    updatedAt: now
  }).onConflictDoUpdate({
    target: [
      mobilePushDevices.token,
      mobilePushDevices.environment,
      mobilePushDevices.bundleId
    ],
    set: {
      accountId: member.accountId,
      userId: input.userId,
      platform: "ios",
      disabledAt: null,
      lastSeenAt: now,
      updatedAt: now
    }
  }).returning({ id: mobilePushDevices.id });
  return { registered: true, deviceId: device!.id };
}

export async function unregisterMobilePushDevice(input: {
  userId: string;
  token: string;
  environment: string;
  bundleId?: string | null;
}) {
  const token = normalizeToken(input.token);
  const environment = normalizeEnvironment(input.environment);
  const bundleId = input.bundleId?.trim() || env.APNS_BUNDLE_ID;
  const now = new Date();
  await db.update(mobilePushDevices).set({
    disabledAt: now,
    updatedAt: now
  }).where(and(
    eq(mobilePushDevices.userId, input.userId),
    eq(mobilePushDevices.token, token),
    eq(mobilePushDevices.environment, environment),
    eq(mobilePushDevices.bundleId, bundleId)
  ));
  return { unregistered: true };
}

function providerConfiguration() {
  if (
    !env.APNS_KEY_ID ||
    !env.APNS_TEAM_ID ||
    !env.APNS_PRIVATE_KEY_B64 ||
    !env.APNS_BUNDLE_ID
  ) {
    if (!warnedAboutMissingConfiguration) {
      warnedAboutMissingConfiguration = true;
      console.warn("APNs is not configured; mobile push delivery is disabled.");
    }
    return null;
  }
  return {
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
    privateKey: Buffer.from(env.APNS_PRIVATE_KEY_B64, "base64").toString("utf8"),
    bundleId: env.APNS_BUNDLE_ID
  };
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function createApnsProviderToken(input: {
  keyId: string;
  teamId: string;
  privateKey: string;
  issuedAtSeconds?: number;
}) {
  const issuedAtSeconds = input.issuedAtSeconds ?? Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: input.keyId }));
  const payload = base64Url(JSON.stringify({
    iss: input.teamId,
    iat: issuedAtSeconds
  }));
  const unsignedToken = `${header}.${payload}`;
  // Bun's streaming createSign(...).sign({ dsaEncoding: "ieee-p1363" })
  // throws a RangeError. The one-shot signer produces the 64-byte ES256
  // signature APNs requires and works in both Bun and Node.
  const signature = sign("sha256", Buffer.from(unsignedToken), {
    key: input.privateKey,
    dsaEncoding: "ieee-p1363"
  });
  return `${unsignedToken}.${base64Url(signature)}`;
}

function providerToken(configuration: NonNullable<ReturnType<typeof providerConfiguration>>) {
  const now = Date.now();
  if (
    cachedProviderToken &&
    cachedProviderToken.keyId === configuration.keyId &&
    cachedProviderToken.expiresAt > now
  ) return cachedProviderToken.token;

  const token = createApnsProviderToken({
    keyId: configuration.keyId,
    teamId: configuration.teamId,
    privateKey: configuration.privateKey,
    issuedAtSeconds: Math.floor(now / 1000)
  });
  cachedProviderToken = {
    token,
    keyId: configuration.keyId,
    expiresAt: now + PROVIDER_TOKEN_LIFETIME_MS
  };
  return token;
}

function sendApnsRequest(input: {
  session: ClientHttp2Session;
  device: RegisteredDevice;
  message: MobilePushMessage;
  authorization: string;
}): Promise<ApnsResponse> {
  return new Promise((resolve) => {
    let status = 0;
    let responseBody = "";
    let settled = false;
    const request = input.session.request({
      ":method": "POST",
      ":path": `/3/device/${input.device.token}`,
      authorization: `bearer ${input.authorization}`,
      "apns-topic": input.device.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": input.message.collapseId,
      "content-type": "application/json"
    });
    const settle = (response: ApnsResponse) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    request.on("data", (chunk) => {
      responseBody += chunk;
    });
    request.on("end", () => {
      let reason: string | null = null;
      if (responseBody) {
        try {
          const payload = JSON.parse(responseBody) as { reason?: unknown };
          reason = typeof payload.reason === "string" ? payload.reason : null;
        } catch {
          reason = "Invalid APNs response";
        }
      }
      settle({ status, reason });
    });
    request.on("error", (error) => {
      settle({ status: 0, reason: error.message });
    });
    request.setTimeout(10_000, () => {
      request.close();
      settle({ status: 0, reason: "APNs request timed out" });
    });
    request.end(JSON.stringify({
      aps: {
        alert: {
          title: input.message.title,
          body: input.message.body
        },
        sound: "default",
        "thread-id": `student-${input.message.data.studentProfileId}`
      },
      ...input.message.data
    }));
  });
}

async function sendMessages(
  devices: RegisteredDevice[],
  messages: MobilePushMessage[]
) {
  const configuration = providerConfiguration();
  if (!configuration || devices.length === 0 || messages.length === 0) {
    return { sent: 0, failed: 0, disabled: 0 };
  }
  const authorization = providerToken(configuration);
  let sent = 0;
  let failed = 0;
  const invalidDeviceIds = new Set<string>();

  for (const environment of ["sandbox", "production"] as const) {
    const environmentDevices = devices.filter((device) => device.environment === environment);
    if (environmentDevices.length === 0) continue;
    const origin = environment === "sandbox"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";
    const session = connect(origin);
    session.on("error", (error) => {
      console.warn("Could not connect to APNs.", {
        environment,
        error: error.message
      });
    });
    try {
      const results = await Promise.all(environmentDevices.flatMap((device) =>
        messages.map(async (message) => ({
          device,
          response: await sendApnsRequest({
            session,
            device,
            message,
            authorization
          })
        }))
      ));
      for (const result of results) {
        if (result.response.status === 200) {
          sent += 1;
          continue;
        }
        failed += 1;
        if (
          result.response.status === 410 ||
          (result.response.reason && INVALID_DEVICE_REASONS.has(result.response.reason))
        ) invalidDeviceIds.add(result.device.id);
      }
    } finally {
      session.close();
    }
  }

  if (invalidDeviceIds.size > 0) {
    const now = new Date();
    await Promise.all(Array.from(invalidDeviceIds).map((deviceId) =>
      db.update(mobilePushDevices).set({
        disabledAt: now,
        updatedAt: now
      }).where(eq(mobilePushDevices.id, deviceId))
    ));
  }
  if (failed > 0) {
    console.warn("One or more APNs notifications failed.", {
      sent,
      failed,
      disabled: invalidDeviceIds.size
    });
  }
  return { sent, failed, disabled: invalidDeviceIds.size };
}

export async function notifyPlanCompletion(input: {
  actorUserId: string;
  studentProfileId: string;
  weeklyPlanId: string;
  weekNumber: number;
  weekTitle: string;
  dayNumber: number;
  lessons: Array<{
    subjectKey: string;
    title: string;
  }>;
  weekNewlyCompleted: boolean;
}) {
  if (input.lessons.length === 0) return { sent: 0, failed: 0, disabled: 0 };
  const [actor, [student]] = await Promise.all([
    getAccountMemberContext(input.actorUserId),
    db.select({
      accountId: profiles.accountId,
      firstName: profiles.firstName
    }).from(profiles).where(and(
      eq(profiles.id, input.studentProfileId),
      eq(profiles.role, "STUDENT")
    )).limit(1)
  ]);
  if (!student || student.accountId !== actor.accountId) {
    throw new Error("Student profile does not belong to this account.");
  }

  const devices = await db.select({
    id: mobilePushDevices.id,
    token: mobilePushDevices.token,
    environment: mobilePushDevices.environment,
    bundleId: mobilePushDevices.bundleId
  }).from(mobilePushDevices).where(and(
    eq(mobilePushDevices.accountId, actor.accountId),
    ne(mobilePushDevices.userId, input.actorUserId),
    isNull(mobilePushDevices.disabledAt)
  ));
  const messages = buildCompletionPushMessages({
    actorName: actor.firstName,
    studentName: student.firstName,
    ...input
  });
  return sendMessages(devices, messages);
}

export async function notifyPointAward(input: {
  actorUserId: string;
  studentProfileId: string;
  pointTransactionId: string;
  amount: number;
  reason: string;
  singularName: string;
  pluralName: string;
}) {
  const [actor, [student]] = await Promise.all([
    getAccountMemberContext(input.actorUserId),
    db.select({
      accountId: profiles.accountId,
      firstName: profiles.firstName
    }).from(profiles).where(and(
      eq(profiles.id, input.studentProfileId),
      eq(profiles.role, "STUDENT")
    )).limit(1)
  ]);
  if (!student || student.accountId !== actor.accountId) {
    throw new Error("Student profile does not belong to this account.");
  }

  const devices = await db.select({
    id: mobilePushDevices.id,
    token: mobilePushDevices.token,
    environment: mobilePushDevices.environment,
    bundleId: mobilePushDevices.bundleId
  }).from(mobilePushDevices).where(and(
    eq(mobilePushDevices.accountId, actor.accountId),
    ne(mobilePushDevices.userId, input.actorUserId),
    isNull(mobilePushDevices.disabledAt)
  ));
  const message = buildPointAwardPushMessage({
    actorName: actor.firstName,
    studentName: student.firstName,
    ...input
  });
  return sendMessages(devices, [message]);
}

async function claimSchoolworkReminder(input: {
  accountId: string;
  profileId: string;
  reminderDate: string;
}) {
  const now = new Date();
  const [inserted] = await db.insert(mobilePushReminderDeliveries).values({
    accountId: input.accountId,
    profileId: input.profileId,
    reminderDate: input.reminderDate,
    reminderKind: SCHOOLWORK_REMINDER_KIND,
    status: "pending",
    claimedAt: now,
    updatedAt: now
  }).onConflictDoNothing().returning({ id: mobilePushReminderDeliveries.id });
  if (inserted) return inserted;

  const retryBefore = new Date(now.getTime() - REMINDER_CLAIM_TIMEOUT_MS);
  const [reclaimed] = await db.update(mobilePushReminderDeliveries).set({
    status: "pending",
    attemptCount: sql`${mobilePushReminderDeliveries.attemptCount} + 1`,
    claimedAt: now,
    lastError: null,
    updatedAt: now
  }).where(and(
    eq(mobilePushReminderDeliveries.profileId, input.profileId),
    eq(mobilePushReminderDeliveries.reminderDate, input.reminderDate),
    eq(mobilePushReminderDeliveries.reminderKind, SCHOOLWORK_REMINDER_KIND),
    or(
      eq(mobilePushReminderDeliveries.status, "failed"),
      and(
        eq(mobilePushReminderDeliveries.status, "pending"),
        lt(mobilePushReminderDeliveries.claimedAt, retryBefore)
      )
    )
  )).returning({ id: mobilePushReminderDeliveries.id });
  return reclaimed ?? null;
}

export async function sendDueSchoolworkReminders(now = new Date()) {
  const students = await db.selectDistinct({
    accountId: profiles.accountId,
    profileId: profiles.id,
    studentName: profiles.firstName
  }).from(profiles).innerJoin(
    mobilePushDevices,
    and(
      eq(mobilePushDevices.accountId, profiles.accountId),
      isNull(mobilePushDevices.disabledAt)
    )
  ).where(eq(profiles.role, "STUDENT"));

  let dueStudents = 0;
  let sentStudents = 0;
  let sentNotifications = 0;
  let failedStudents = 0;

  for (const student of students) {
    try {
      const status = await getCalculatedStreakStatus(student.profileId, now);
      const clock = schoolworkReminderClock(now, status.timeZone);
      if (!isSchoolworkReminderDue({
        localHour: clock.hour,
        isSchoolDayToday: status.isSchoolDayToday,
        schoolworkCompletedToday: status.schoolworkCompletedToday
      })) continue;
      dueStudents += 1;

      const claim = await claimSchoolworkReminder({
        accountId: student.accountId,
        profileId: student.profileId,
        reminderDate: clock.date
      });
      if (!claim) continue;

      const devices = await db.select({
        id: mobilePushDevices.id,
        token: mobilePushDevices.token,
        environment: mobilePushDevices.environment,
        bundleId: mobilePushDevices.bundleId
      }).from(mobilePushDevices).where(and(
        eq(mobilePushDevices.accountId, student.accountId),
        isNull(mobilePushDevices.disabledAt)
      ));
      const delivery = await sendMessages(devices, [buildSchoolworkReminderPushMessage({
        studentName: student.studentName,
        studentProfileId: student.profileId,
        reminderDate: clock.date,
        currentStreak: status.currentCount
      })]);
      if (delivery.sent > 0) {
        sentStudents += 1;
        sentNotifications += delivery.sent;
        await db.update(mobilePushReminderDeliveries).set({
          status: "sent",
          sentAt: new Date(),
          lastError: null,
          updatedAt: new Date()
        }).where(eq(mobilePushReminderDeliveries.id, claim.id));
      } else {
        failedStudents += 1;
        await db.update(mobilePushReminderDeliveries).set({
          status: "failed",
          lastError: delivery.failed > 0
            ? `APNs rejected ${delivery.failed} notification(s).`
            : "No APNs notification was sent.",
          updatedAt: new Date()
        }).where(eq(mobilePushReminderDeliveries.id, claim.id));
      }
    } catch (error) {
      failedStudents += 1;
      console.error("Could not process schoolwork reminder.", {
        profileId: student.profileId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    evaluatedStudents: students.length,
    dueStudents,
    sentStudents,
    sentNotifications,
    failedStudents
  };
}
