import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, verify } from "node:crypto";
import {
  buildCompletionPushMessages,
  buildPointAwardPushMessage,
  buildSchoolworkReminderPushMessage,
  createApnsProviderToken,
  isSchoolworkReminderDue,
  schoolworkReminderClock
} from "./mobile-push-notifications";

describe("completion push messages", () => {
  test("names the teacher, student, lesson, and completed week", () => {
    const messages = buildCompletionPushMessages({
      actorName: "Eric",
      studentName: "Maya",
      studentProfileId: "student-1",
      weeklyPlanId: "week-3",
      weekNumber: 3,
      weekTitle: "Week 3",
      dayNumber: 5,
      lessons: [{ subjectKey: "math", title: "Equivalent fractions" }],
      weekNewlyCompleted: true
    });

    expect(messages.map((message) => ({ title: message.title, body: message.body }))).toEqual([
      {
        title: "Lesson completed",
        body: "Eric marked Maya as done with Equivalent fractions."
      },
      {
        title: "Week completed",
        body: "Eric marked Maya as done with Week 3."
      }
    ]);
    expect(messages[0]?.data).toMatchObject({
      type: "lesson_completed",
      studentProfileId: "student-1",
      weeklyPlanId: "week-3",
      dayNumber: "5",
      subjectKey: "math"
    });
  });

  test("does not announce a week that was already complete", () => {
    const messages = buildCompletionPushMessages({
      actorName: "Eric",
      studentName: "Maya",
      studentProfileId: "student-1",
      weeklyPlanId: "week-3",
      weekNumber: 3,
      weekTitle: "Week 3",
      dayNumber: 2,
      lessons: [{ subjectKey: "reading", title: "Main idea" }],
      weekNewlyCompleted: false
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.title).toBe("Lesson completed");
  });
});

describe("point award push messages", () => {
  test("names the teacher, student, amount, and reason", () => {
    const message = buildPointAwardPushMessage({
      actorName: "Eric",
      studentName: "Maya",
      studentProfileId: "student-1",
      pointTransactionId: "transaction-1",
      amount: 5,
      reason: "Great reading!",
      singularName: "star",
      pluralName: "stars"
    });

    expect(message).toMatchObject({
      title: "Points awarded",
      body: "Eric gave Maya 5 stars for Great reading.",
      data: {
        type: "points_awarded",
        studentProfileId: "student-1",
        pointTransactionId: "transaction-1",
        amount: "5"
      }
    });
  });

  test("uses the singular point name for one point", () => {
    const message = buildPointAwardPushMessage({
      actorName: "Eric",
      studentName: "Maya",
      studentProfileId: "student-1",
      pointTransactionId: "transaction-2",
      amount: 1,
      reason: "Helping",
      singularName: "leaf",
      pluralName: "leaves"
    });

    expect(message.body).toBe("Eric gave Maya 1 leaf for Helping.");
  });
});

describe("APNs provider tokens", () => {
  test("creates a valid 64-byte ES256 signature under Bun", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const token = createApnsProviderToken({
      keyId: "ABC123DEFG",
      teamId: "TEAM123456",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      issuedAtSeconds: 1_700_000_000
    });
    const [header, payload, signature] = token.split(".");

    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "ABC123DEFG"
    });
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toEqual({
      iss: "TEAM123456",
      iat: 1_700_000_000
    });
    expect(Buffer.from(signature!, "base64url")).toHaveLength(64);
    expect(verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature!, "base64url")
    )).toBe(true);
  });
});

describe("schoolwork reminder push messages", () => {
  test("includes the student and current school-day streak", () => {
    const message = buildSchoolworkReminderPushMessage({
      studentName: "Maya",
      studentProfileId: "student-1",
      reminderDate: "2026-09-03",
      currentStreak: 6
    });

    expect(message).toMatchObject({
      title: "Schoolwork reminder",
      body: "Don’t forget to do schoolwork today! Maya’s current streak is 6 school days.",
      data: {
        type: "schoolwork_reminder",
        studentProfileId: "student-1",
        reminderDate: "2026-09-03",
        currentStreak: "6"
      }
    });
  });

  test("uses the account calendar time zone to determine local noon", () => {
    const now = new Date("2026-09-03T03:15:00.000Z");
    expect(schoolworkReminderClock(now, "Asia/Tokyo")).toEqual({
      date: "2026-09-03",
      hour: 12
    });
    expect(schoolworkReminderClock(now, "America/New_York")).toEqual({
      date: "2026-09-02",
      hour: 23
    });
  });

  test("only becomes due after noon on an incomplete school day", () => {
    expect(isSchoolworkReminderDue({
      localHour: 12,
      isSchoolDayToday: true,
      schoolworkCompletedToday: false
    })).toBe(true);
    expect(isSchoolworkReminderDue({
      localHour: 11,
      isSchoolDayToday: true,
      schoolworkCompletedToday: false
    })).toBe(false);
    expect(isSchoolworkReminderDue({
      localHour: 12,
      isSchoolDayToday: false,
      schoolworkCompletedToday: false
    })).toBe(false);
    expect(isSchoolworkReminderDue({
      localHour: 12,
      isSchoolDayToday: true,
      schoolworkCompletedToday: true
    })).toBe(false);
  });
});
