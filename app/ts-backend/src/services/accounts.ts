import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  accountInvitations,
  accountMemberRoleEnum,
  accounts,
  curriculumNodes,
  learningYears,
  lexicon,
  nodeTranslations,
  profileCurriculumEnrollments,
  profiles,
  type gradingSchemeEnum,
  studentVocabulary,
  users,
  type profileRoleEnum,
  type uiThemeEnum
} from "ts-db";
import { db } from "../db";
import { prepareFirstLessonForSubject } from "./lessons";
import { unlockInitialSkill } from "./mastery";
import { getTeacherActivityDaysForMembers } from "./teacher-activity";
import {
  deletePrivateFile,
  downloadPrivateFile,
  getPrivateFileMetadata,
  getSignedLessonAssetUrl,
  getSignedPrivateUploadUrl
} from "./media";

type ProfileRole = (typeof profileRoleEnum.enumValues)[number];
type UiTheme = (typeof uiThemeEnum.enumValues)[number];
type GradingScheme = (typeof gradingSchemeEnum.enumValues)[number];
export type AccountMemberRole = (typeof accountMemberRoleEnum.enumValues)[number];

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const TEACHER_USER_LIMIT = 4;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePersonName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Enter the person's name.");
  if (name.length > 100) throw new Error("Names may be up to 100 characters.");
  return name;
}

function studentSlugBase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "student";
}

function nextStudentSlug(firstName: string, existingSlugs: Array<string | null>) {
  const base = studentSlugBase(firstName);
  const used = new Set(existingSlugs.filter((slug): slug is string => Boolean(slug)));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export type AuthUserInput = {
  userId: string;
  email: string;
  firstName?: string;
};

export type CreateStudentProfileInput = {
  profileId?: string;
  parentUserId: string;
  firstName: string;
  birthDate: string;
  gradeLevel: number;
  accessPin?: string;
  avatarUrl?: string;
  uiTheme?: UiTheme;
  languagePreference?: string;
  learningProfileNotes?: string;
  subjectStrengths?: Record<string, string>;
};

const STUDENT_STRENGTH_SUBJECTS = new Set([
  "mathematics",
  "reading",
  "writing_grammar",
  "science",
  "social_studies"
]);
const STUDENT_STRENGTH_VALUES = new Set([
  "needs_support",
  "about_right",
  "ready_for_challenge",
  "not_sure"
]);
const STUDENT_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const STUDENT_PHOTO_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function studentPhotoExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function isValidStudentPhoto(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

async function resolvePrivateStudentPhoto(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return getSignedLessonAssetUrl(value, 60).catch(() => null);
}

function normalizeLearningProfileNotes(value?: string | null) {
  const notes = String(value ?? "").trim();
  return notes ? notes.slice(0, 4000) : null;
}

function normalizeSubjectStrengths(value?: Record<string, string> | null) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([subject, strength]) =>
      STUDENT_STRENGTH_SUBJECTS.has(subject) && STUDENT_STRENGTH_VALUES.has(strength)
    )
  );
}

export async function getLocalDevUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email
    })
    .from(users)
    .where(eq(sql`lower(${users.email})`, normalizedEmail))
    .limit(1);

  return user ?? null;
}

export async function hasParentAccountForEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) return false;

  const [parent] = await db
    .select({ id: profiles.id })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(
      eq(sql`lower(${users.email})`, normalizedEmail),
      eq(profiles.role, "PARENT")
    ))
    .limit(1);

  if (parent) return true;

  const [invitation] = await db
    .select({ expiresAt: accountInvitations.expiresAt })
    .from(accountInvitations)
    .where(and(
      eq(accountInvitations.email, normalizedEmail),
      eq(accountInvitations.status, "PENDING")
    ))
    .limit(1);

  return Boolean(invitation && invitation.expiresAt.getTime() > Date.now());
}

export async function ensureParentProfile(input: AuthUserInput) {
  const existingParentForUserId = await getPrimaryParentProfileByUserId(input.userId);

  if (existingParentForUserId) {
    await db
      .insert(users)
      .values({
        id: input.userId,
        email: input.email
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: input.email
        }
      });

    return existingParentForUserId;
  }

  const normalizedEmail = normalizeEmail(input.email);
  const existingUserForEmail = await getLocalDevUserByEmail(normalizedEmail);

  if (existingUserForEmail && existingUserForEmail.id !== input.userId) {
    const existingParentForEmail = await getPrimaryParentProfileByUserId(existingUserForEmail.id);

    if (existingParentForEmail) {
      await db.transaction(async (tx) => {
        await tx.delete(users).where(eq(users.id, existingUserForEmail.id));
        await tx.insert(users).values({
          id: input.userId,
          email: input.email
        });
        await tx
          .update(profiles)
          .set({
            userId: input.userId
          })
          .where(eq(profiles.id, existingParentForEmail.id));
      });

      const relinkedParent = await getPrimaryParentProfileByUserId(input.userId);

      if (!relinkedParent) {
        throw new Error("Failed to relink parent profile.");
      }

      return relinkedParent;
    }
  }

  const [pendingInvitation] = await db
    .select()
    .from(accountInvitations)
    .where(and(
      eq(accountInvitations.email, normalizedEmail),
      eq(accountInvitations.status, "PENDING")
    ))
    .limit(1);

  if (pendingInvitation && pendingInvitation.expiresAt.getTime() > Date.now()) {
    const profileId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`treeschool:teacher-users:${pendingInvitation.accountId}`}, 0))`);
      if (existingUserForEmail && existingUserForEmail.id !== input.userId) {
        await tx.delete(users).where(eq(users.id, existingUserForEmail.id));
      }
      await tx.insert(users).values({
        id: input.userId,
        email: normalizedEmail
      }).onConflictDoUpdate({
        target: users.id,
        set: { email: normalizedEmail }
      });
      await tx.insert(profiles).values({
        id: profileId,
        accountId: pendingInvitation.accountId,
        userId: input.userId,
        role: "PARENT",
        accountRole: pendingInvitation.role,
        firstName: pendingInvitation.name,
        uiTheme: "academic"
      });
      await tx.update(accountInvitations).set({
        status: "ACCEPTED",
        acceptedByUserId: input.userId,
        acceptedAt: new Date(),
        updatedAt: new Date()
      }).where(eq(accountInvitations.id, pendingInvitation.id));
    });

    const invitedProfile = await getPrimaryParentProfileByUserId(input.userId);
    if (!invitedProfile) throw new Error("Failed to link the invited account member.");
    return invitedProfile;
  }

  throw new Error("No Treeschool parent account exists for this email.");
}

export async function getAccountMemberContext(userId: string) {
  const [member] = await db
    .select({
      profileId: profiles.id,
      accountId: profiles.accountId,
      accountRole: profiles.accountRole,
      firstName: profiles.firstName,
      email: users.email
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);
  if (!member) throw new Error("Account member not found.");
  return {
    ...member,
    accountRole: (member.accountRole ?? "OWNER") as AccountMemberRole
  };
}

export async function requireAccountRole(userId: string, allowedRoles: AccountMemberRole[]) {
  const member = await getAccountMemberContext(userId);
  if (!allowedRoles.includes(member.accountRole)) {
    throw new Error("You do not have permission to make this change.");
  }
  return member;
}

export async function createAccountInvitation(input: {
  userId: string;
  name: string;
  email: string;
}) {
  const inviter = await requireAccountRole(input.userId, ["OWNER", "ADMIN"]);
  const name = normalizePersonName(input.name);
  const email = normalizeEmail(input.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (email === normalizeEmail(inviter.email)) {
    throw new Error("You already belong to this account.");
  }

  const [existingMember] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(
      eq(profiles.role, "PARENT"),
      eq(sql`lower(${users.email})`, email)
    ))
    .limit(1);
  if (existingMember) {
    throw new Error("That email already belongs to a Treeschool account. Multi-household access is not supported yet.");
  }

  const invitation = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`treeschool:teacher-users:${inviter.accountId}`}, 0))`);

    const now = new Date();
    const [existingInvitation] = await tx
      .select({
        status: accountInvitations.status,
        expiresAt: accountInvitations.expiresAt
      })
      .from(accountInvitations)
      .where(and(
        eq(accountInvitations.accountId, inviter.accountId),
        eq(accountInvitations.email, email)
      ))
      .limit(1);
    const alreadyReservesTeacherUser = Boolean(
      existingInvitation?.status === "PENDING"
      && existingInvitation.expiresAt.getTime() > now.getTime()
    );

    if (!alreadyReservesTeacherUser) {
      const [activeTeacherUsers] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(profiles)
        .where(and(
          eq(profiles.accountId, inviter.accountId),
          eq(profiles.role, "PARENT"),
          eq(profiles.accountRole, "TEACHER")
        ));
      const [pendingTeacherUsers] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(accountInvitations)
        .where(and(
          eq(accountInvitations.accountId, inviter.accountId),
          eq(accountInvitations.status, "PENDING"),
          gt(accountInvitations.expiresAt, now)
        ));
      const teacherUsersUsed = Number(activeTeacherUsers?.count ?? 0) + Number(pendingTeacherUsers?.count ?? 0);
      if (teacherUsersUsed >= TEACHER_USER_LIMIT) {
        throw new Error(`Your plan includes up to ${TEACHER_USER_LIMIT} Teacher users. Change an existing Teacher’s access level, or wait for a pending invitation to expire before inviting someone else.`);
      }
    }

    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
    const [savedInvitation] = await tx.insert(accountInvitations).values({
      accountId: inviter.accountId,
      email,
      name,
      role: "TEACHER",
      status: "PENDING",
      invitedByUserId: input.userId,
      expiresAt
    }).onConflictDoUpdate({
      target: [accountInvitations.accountId, accountInvitations.email],
      set: {
        name,
        role: "TEACHER",
        status: "PENDING",
        invitedByUserId: input.userId,
        acceptedByUserId: null,
        acceptedAt: null,
        expiresAt,
        updatedAt: now
      }
    }).returning({
      id: accountInvitations.id,
      name: accountInvitations.name,
      email: accountInvitations.email,
      role: accountInvitations.role,
      expiresAt: accountInvitations.expiresAt
    });
    return savedInvitation!;
  });
  return invitation;
}

export async function listAccountPeople(userId: string) {
  const requester = await getAccountMemberContext(userId);
  const members = await db
    .select({
      profileId: profiles.id,
      userId: profiles.userId,
      name: profiles.firstName,
      email: users.email,
      role: profiles.accountRole
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(
      eq(profiles.accountId, requester.accountId),
      eq(profiles.role, "PARENT")
    ))
    .orderBy(asc(profiles.firstName));
  const invitations = await db
    .select({
      id: accountInvitations.id,
      name: accountInvitations.name,
      email: accountInvitations.email,
      role: accountInvitations.role,
      status: accountInvitations.status,
      expiresAt: accountInvitations.expiresAt
    })
    .from(accountInvitations)
    .where(and(
      eq(accountInvitations.accountId, requester.accountId),
      eq(accountInvitations.status, "PENDING")
    ))
    .orderBy(asc(accountInvitations.name));
  const teacherUserLimit = TEACHER_USER_LIMIT;
  const teacherUsersUsed = members.filter((member) => member.role === "TEACHER").length
    + invitations.filter((invitation) => invitation.expiresAt.getTime() > Date.now()).length;
  const activity = await getTeacherActivityDaysForMembers({
    accountId: requester.accountId,
    profileIds: members.map((member) => member.profileId),
    numberOfDays: 91
  });
  return {
    currentUserId: userId,
    currentRole: requester.accountRole,
    canInvite: requester.accountRole === "OWNER" || requester.accountRole === "ADMIN",
    teacherUserLimit,
    teacherUsersUsed,
    teacherLimitReached: teacherUsersUsed >= teacherUserLimit,
    members: members.map((member) => ({
      ...member,
      role: (member.role ?? "OWNER") as AccountMemberRole,
      activityDateFrom: activity.dateFrom,
      activityDateTo: activity.dateTo,
      activityDays: activity.byProfileId.get(member.profileId) ?? []
    })),
    invitations
  };
}

export async function updateOwnAccountName(input: { userId: string; name: string }) {
  const member = await getAccountMemberContext(input.userId);
  const name = normalizePersonName(input.name);
  const [updated] = await db.update(profiles).set({ firstName: name })
    .where(eq(profiles.id, member.profileId))
    .returning({ profileId: profiles.id, name: profiles.firstName });
  return updated!;
}

export async function updateAccountMemberRole(input: {
  userId: string;
  profileId: string;
  role: "ADMIN" | "TEACHER";
}) {
  const requester = await requireAccountRole(input.userId, ["OWNER", "ADMIN"]);
  if (!(["ADMIN", "TEACHER"] as const).includes(input.role)) {
    throw new Error("Choose a valid account role.");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`treeschool:teacher-users:${requester.accountId}`}, 0))`);
    const [target] = await tx.select({
      id: profiles.id,
      accountId: profiles.accountId,
      accountRole: profiles.accountRole,
      userId: profiles.userId
    }).from(profiles).where(and(
      eq(profiles.id, input.profileId),
      eq(profiles.accountId, requester.accountId),
      eq(profiles.role, "PARENT")
    )).limit(1);
    if (!target) throw new Error("Account member not found.");
    if (target.userId === input.userId) {
      throw new Error("You cannot change your own role.");
    }
    if (target.accountRole === "OWNER") {
      throw new Error("The account owner's role cannot be changed.");
    }
    if (requester.accountRole === "ADMIN" && target.accountRole === "ADMIN") {
      throw new Error("Only the account owner can change another administrator's role.");
    }

    if (input.role === "TEACHER" && target.accountRole !== "TEACHER") {
      const now = new Date();
      const [activeTeacherUsers] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(profiles)
        .where(and(
          eq(profiles.accountId, requester.accountId),
          eq(profiles.role, "PARENT"),
          eq(profiles.accountRole, "TEACHER")
        ));
      const [pendingTeacherUsers] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(accountInvitations)
        .where(and(
          eq(accountInvitations.accountId, requester.accountId),
          eq(accountInvitations.status, "PENDING"),
          gt(accountInvitations.expiresAt, now)
        ));
      const teacherUsersUsed = Number(activeTeacherUsers?.count ?? 0) + Number(pendingTeacherUsers?.count ?? 0);
      if (teacherUsersUsed >= TEACHER_USER_LIMIT) {
        throw new Error(`Your plan includes up to ${TEACHER_USER_LIMIT} Teacher users.`);
      }
    }

    const [updated] = await tx.update(profiles).set({ accountRole: input.role })
      .where(eq(profiles.id, target.id))
      .returning({ profileId: profiles.id, role: profiles.accountRole });
    return updated!;
  });
}

export async function listProfilesForUser(userId: string) {
  const parentProfile = await getPrimaryParentProfileByUserId(userId);

  if (!parentProfile) {
    throw new Error(`No parent profile found for user ${userId}.`);
  }

  const householdProfiles = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountRole: profiles.accountRole,
      isAdmin: profiles.isAdmin,
      firstName: profiles.firstName,
      slug: profiles.slug,
      birthDate: profiles.birthDate,
      gradeLevel: profiles.gradeLevel,
      accessPin: profiles.accessPin,
      avatarUrl: profiles.avatarUrl,
      uiTheme: profiles.uiTheme,
      languagePreference: profiles.languagePreference,
      currentNodeId: profiles.currentNodeId,
      gradingScheme: profiles.gradingScheme,
      learningProfileNotes: profiles.learningProfileNotes,
      subjectStrengths: profiles.subjectStrengths,
      learningProfileUpdatedAt: profiles.learningProfileUpdatedAt
    })
    .from(profiles)
    .where(eq(profiles.accountId, parentProfile.accountId))
    .orderBy(asc(profiles.role), asc(profiles.firstName));
  return Promise.all(householdProfiles.map(async (profile) => ({
    ...profile,
    avatarUrl: await resolvePrivateStudentPhoto(profile.avatarUrl)
  })));
}

export async function createStudentProfile(input: CreateStudentProfileInput) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const parentProfile = await getPrimaryParentProfileByUserId(input.parentUserId);

  if (!parentProfile || parentProfile.role !== "PARENT") {
    throw new Error("Only parent profiles can create student profiles.");
  }

  const startingNodeId = await getStartingGradeNodeId(input.gradeLevel);
  const profileId = input.profileId ?? randomUUID();
  const derivedAge = getAgeFromBirthDate(input.birthDate);
  const birthDate = new Date(input.birthDate);

  const insertedProfile = await db.transaction(async (tx) => {
    const householdSlugs = await tx
      .select({ slug: profiles.slug })
      .from(profiles)
      .where(eq(profiles.accountId, parentProfile.accountId));
    const slug = nextStudentSlug(input.firstName, householdSlugs.map((profile) => profile.slug));

    const inserted = await tx.insert(profiles).values({
      id: profileId,
      accountId: parentProfile.accountId,
      role: "STUDENT",
      firstName: input.firstName.trim(),
      slug,
      birthDate,
      gradeLevel: input.gradeLevel,
      accessPin: input.accessPin,
      avatarUrl: input.avatarUrl,
      uiTheme: input.uiTheme ?? defaultThemeForGrade(input.gradeLevel),
      languagePreference: input.languagePreference ?? "en-US",
      learningProfileNotes: normalizeLearningProfileNotes(input.learningProfileNotes),
      subjectStrengths: normalizeSubjectStrengths(input.subjectStrengths),
      learningProfileUpdatedAt:
        input.learningProfileNotes || Object.keys(input.subjectStrengths ?? {}).length > 0
          ? new Date()
          : null,
      currentNodeId: startingNodeId
    }).onConflictDoNothing({ target: profiles.id }).returning({ id: profiles.id });

    if (inserted.length > 0) {
      const vocabularyRows = await tx
        .select({
          id: lexicon.id
        })
        .from(lexicon)
          .where(
            and(
              eq(lexicon.languageCode, input.languagePreference ?? "en-US"),
              lte(lexicon.introducedAtLevel, derivedAge)
            )
          );

      if (vocabularyRows.length > 0) {
        await tx.insert(studentVocabulary).values(
          vocabularyRows.map((row) => ({
            profileId,
            wordId: row.id,
            status: "candidate" as const
          }))
        ).onConflictDoNothing();
      }
    }

    return tx
      .select({
        id: profiles.id,
        accountId: profiles.accountId,
        role: profiles.role,
        firstName: profiles.firstName,
        slug: profiles.slug,
        birthDate: profiles.birthDate,
        gradeLevel: profiles.gradeLevel,
        accessPin: profiles.accessPin,
        avatarUrl: profiles.avatarUrl,
        uiTheme: profiles.uiTheme,
        languagePreference: profiles.languagePreference,
        currentNodeId: profiles.currentNodeId,
        learningProfileNotes: profiles.learningProfileNotes,
        subjectStrengths: profiles.subjectStrengths,
        learningProfileUpdatedAt: profiles.learningProfileUpdatedAt
      })
      .from(profiles)
      .where(and(eq(profiles.id, profileId), eq(profiles.accountId, parentProfile.accountId)))
      .limit(1);
  });

  return insertedProfile[0] ?? null;
}

export async function syncStudentVocabularyToAge(parentUserId: string, profileId: string) {
  await requireAccountRole(parentUserId, ["OWNER", "ADMIN"]);
  const parentProfile = await getPrimaryParentProfileByUserId(parentUserId);

  if (!parentProfile) {
    throw new Error("Only parent profiles can sync student vocabulary.");
  }

  const [studentProfile] = await db
    .select({
      id: profiles.id,
      accountId: profiles.accountId,
      role: profiles.role,
      birthDate: profiles.birthDate,
      languagePreference: profiles.languagePreference
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!studentProfile) {
    throw new Error("Student profile not found.");
  }

  if (studentProfile.accountId !== parentProfile.accountId || studentProfile.role !== "STUDENT") {
    throw new Error("You do not have access to this profile.");
  }

  const derivedAge = studentProfile.birthDate
    ? getAgeFromBirthDate(studentProfile.birthDate)
    : 0;

  const vocabularyRows = await db
    .select({
      id: lexicon.id
    })
    .from(lexicon)
    .where(
      and(
        eq(lexicon.languageCode, studentProfile.languagePreference),
        lte(lexicon.introducedAtLevel, derivedAge)
      )
    );

  if (vocabularyRows.length === 0) {
    return {
      inserted: 0
    };
  }

  await db
    .insert(studentVocabulary)
    .values(
      vocabularyRows.map((row) => ({
        profileId,
        wordId: row.id,
        status: "candidate" as const
      }))
    )
    .onConflictDoNothing();

  return {
    inserted: vocabularyRows.length
  };
}

export async function getStudentCurriculumManagement(
  parentUserId: string,
  profileId: string,
  languageCode = "en-US"
) {
  const { parentProfile, studentProfile } = await getManageableStudentProfile(
    parentUserId,
    profileId
  );
  const gradeNodeId = studentProfile.gradeLevel != null
    ? await getStartingGradeNodeId(studentProfile.gradeLevel)
    : null;

  const availableCurricula =
    gradeNodeId == null
      ? []
      : await db
          .select({
            id: curriculumNodes.id,
            slug: curriculumNodes.slug,
            title: curriculumNodes.title,
            translatedTitle: nodeTranslations.title,
            description: nodeTranslations.description
          })
          .from(curriculumNodes)
          .leftJoin(
            nodeTranslations,
            and(
              eq(nodeTranslations.nodeId, curriculumNodes.id),
              eq(nodeTranslations.languageCode, languageCode)
            )
          )
          .where(
            and(
              eq(curriculumNodes.parentId, gradeNodeId),
              eq(curriculumNodes.type, "subject")
            )
          )
          .orderBy(asc(curriculumNodes.displayOrder), asc(curriculumNodes.order));

  const enrolledCurricula = await db
    .select({
      id: curriculumNodes.id,
      slug: curriculumNodes.slug,
      title: curriculumNodes.title,
      translatedTitle: nodeTranslations.title,
      description: nodeTranslations.description,
      assignedAt: profileCurriculumEnrollments.assignedAt
    })
    .from(profileCurriculumEnrollments)
    .innerJoin(curriculumNodes, eq(profileCurriculumEnrollments.nodeId, curriculumNodes.id))
    .leftJoin(
      nodeTranslations,
      and(
        eq(nodeTranslations.nodeId, curriculumNodes.id),
        eq(nodeTranslations.languageCode, languageCode)
      )
    )
    .where(eq(profileCurriculumEnrollments.profileId, profileId))
    .orderBy(asc(curriculumNodes.displayOrder), asc(curriculumNodes.order));

  return {
    parentProfileId: parentProfile.id,
    student: {
      id: studentProfile.id,
      firstName: studentProfile.firstName,
      gradeLevel: studentProfile.gradeLevel,
      birthDate: studentProfile.birthDate,
      currentNodeId: studentProfile.currentNodeId
    },
    enrolledCurricula: enrolledCurricula.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.translatedTitle ?? row.title,
      description: row.description,
      assignedAt: row.assignedAt
    })),
    availableCurricula: availableCurricula.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.translatedTitle ?? row.title,
      description: row.description,
      enrolled: enrolledCurricula.some((enrolled) => enrolled.id === row.id)
    }))
  };
}

export async function addCurriculumToStudent(
  parentUserId: string,
  profileId: string,
  nodeId: string
) {
  await requireAccountRole(parentUserId, ["OWNER", "ADMIN"]);
  const { studentProfile } = await getManageableStudentProfile(parentUserId, profileId);

  const [node] = await db
    .select({
      id: curriculumNodes.id,
      parentId: curriculumNodes.parentId,
      type: curriculumNodes.type
    })
    .from(curriculumNodes)
    .where(eq(curriculumNodes.id, nodeId))
    .limit(1);

  if (!node || node.type !== "subject") {
    throw new Error("Only subject curriculum nodes can be assigned.");
  }

  const gradeNodeId =
    studentProfile.gradeLevel != null ? await getStartingGradeNodeId(studentProfile.gradeLevel) : null;

  if (!gradeNodeId || node.parentId !== gradeNodeId) {
    throw new Error("Curriculum does not match the student's grade level.");
  }

  await db
    .insert(profileCurriculumEnrollments)
    .values({
      profileId,
      nodeId
    })
    .onConflictDoNothing();

  if (!studentProfile.currentNodeId || studentProfile.currentNodeId === gradeNodeId) {
    await db
      .update(profiles)
      .set({
        currentNodeId: nodeId
      })
      .where(eq(profiles.id, profileId));
  }

  const firstSkillId = await getFirstSkillForSubject(nodeId);

  if (firstSkillId) {
    await unlockInitialSkill(profileId, firstSkillId);
  }

  await prepareFirstLessonForSubject(
    profileId,
    nodeId,
    studentProfile.languagePreference ?? "en-US"
  );

  return {
    profileId,
    nodeId,
    firstSkillId
  };
}

export async function removeCurriculumFromStudent(
  parentUserId: string,
  profileId: string,
  nodeId: string
) {
  await requireAccountRole(parentUserId, ["OWNER", "ADMIN"]);
  const { studentProfile } = await getManageableStudentProfile(parentUserId, profileId);

  await db
    .delete(profileCurriculumEnrollments)
    .where(
      and(
        eq(profileCurriculumEnrollments.profileId, profileId),
        eq(profileCurriculumEnrollments.nodeId, nodeId)
      )
    );

  if (studentProfile.currentNodeId === nodeId) {
    const gradeNodeId =
      studentProfile.gradeLevel != null ? await getStartingGradeNodeId(studentProfile.gradeLevel) : null;

    await db
      .update(profiles)
      .set({
        currentNodeId: gradeNodeId
      })
      .where(eq(profiles.id, profileId));
  }

  return {
    profileId,
    nodeId
  };
}

export async function updateStudentGradingScheme(
  parentUserId: string,
  profileId: string,
  gradingScheme: GradingScheme
) {
  await requireAccountRole(parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(parentUserId, profileId);

  const [updatedProfile] = await db
    .update(profiles)
    .set({
      gradingScheme
    })
    .where(eq(profiles.id, profileId))
    .returning({
      profileId: profiles.id,
      gradingScheme: profiles.gradingScheme
    });

  if (!updatedProfile) {
    throw new Error("Failed to update grading scheme.");
  }

  return updatedProfile;
}

function getAgeFromBirthDate(birthDate: string | Date) {
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birth.getUTCMonth();
  const dayDelta = today.getUTCDate() - birth.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return Math.max(age, 0);
}

async function getPrimaryParentProfileByUserId(userId: string) {
  const rows = await db
    .select({
      id: profiles.id,
      accountId: profiles.accountId,
      role: profiles.role,
      accountRole: profiles.accountRole,
      firstName: profiles.firstName,
      uiTheme: profiles.uiTheme
    })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), eq(profiles.role, "PARENT")))
    .limit(1);

  return rows[0] ?? null;
}

export async function getManageableStudentProfile(parentUserId: string, profileId: string) {
  const parentProfile = await getPrimaryParentProfileByUserId(parentUserId);

  if (!parentProfile) {
    throw new Error("Only parent profiles can manage student curriculum.");
  }

  const [studentProfile] = await db
    .select({
      id: profiles.id,
      accountId: profiles.accountId,
      role: profiles.role,
      firstName: profiles.firstName,
      slug: profiles.slug,
      birthDate: profiles.birthDate,
      gradeLevel: profiles.gradeLevel,
      currentNodeId: profiles.currentNodeId,
      languagePreference: profiles.languagePreference,
      gradingScheme: profiles.gradingScheme,
      avatarUrl: profiles.avatarUrl,
      learningProfileNotes: profiles.learningProfileNotes,
      subjectStrengths: profiles.subjectStrengths,
      learningProfileUpdatedAt: profiles.learningProfileUpdatedAt
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!studentProfile || studentProfile.role !== "STUDENT") {
    throw new Error("Student profile not found.");
  }

  if (studentProfile.accountId !== parentProfile.accountId) {
    throw new Error("You do not have access to this student.");
  }

  return {
    parentProfile,
    studentProfile
  };
}

export async function updateStudentLearningProfile(input: {
  parentUserId: string;
  profileId: string;
  learningProfileNotes?: string | null;
  subjectStrengths?: Record<string, string>;
  schoolYearStartDate?: string | null;
  schoolYearEndDate?: string | null;
  updateSchoolYear?: boolean;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const { studentProfile } = await getManageableStudentProfile(input.parentUserId, input.profileId);
  const schoolYearPeriod = input.updateSchoolYear
    ? normalizeStudentSchoolYearPeriod(input.schoolYearStartDate, input.schoolYearEndDate)
    : null;

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(profiles)
      .set({
        learningProfileNotes: normalizeLearningProfileNotes(input.learningProfileNotes),
        subjectStrengths: normalizeSubjectStrengths(input.subjectStrengths),
        learningProfileUpdatedAt: new Date()
      })
      .where(eq(profiles.id, input.profileId))
      .returning({
        profileId: profiles.id,
        learningProfileNotes: profiles.learningProfileNotes,
        subjectStrengths: profiles.subjectStrengths,
        learningProfileUpdatedAt: profiles.learningProfileUpdatedAt
      });

    let learningYear: { id: string; startDate: Date | null; endDate: Date | null } | null = null;
    if (schoolYearPeriod) {
      const [existingYear] = await tx
        .select({ id: learningYears.id })
        .from(learningYears)
        .where(eq(learningYears.profileId, input.profileId))
        .orderBy(desc(learningYears.startDate), desc(learningYears.createdAt))
        .limit(1);
      if (existingYear) {
        [learningYear] = await tx
          .update(learningYears)
          .set({
            startDate: schoolYearPeriod.startDate,
            endDate: schoolYearPeriod.endDate,
            updatedAt: new Date()
          })
          .where(eq(learningYears.id, existingYear.id))
          .returning({
            id: learningYears.id,
            startDate: learningYears.startDate,
            endDate: learningYears.endDate
          });
      } else {
        [learningYear] = await tx
          .insert(learningYears)
          .values({
            profileId: input.profileId,
            title: `${studentProfile.firstName}'s learning year`,
            totalWeeks: 36,
            teachingDaysPerWeek: 5,
            printPageSize: "letter",
            startDate: schoolYearPeriod.startDate,
            endDate: schoolYearPeriod.endDate
          })
          .returning({
            id: learningYears.id,
            startDate: learningYears.startDate,
            endDate: learningYears.endDate
          });
      }
    }

    return { ...updated, learningYear };
  });
}

function normalizeStudentSchoolYearPeriod(
  startDate: string | null | undefined,
  endDate: string | null | undefined
) {
  const normalizedStart = startDate?.trim() || null;
  const normalizedEnd = endDate?.trim() || null;
  if (!normalizedStart && !normalizedEnd) {
    return { startDate: null, endDate: null };
  }
  if (!normalizedStart || !normalizedEnd) {
    throw new Error("Set both the school-year start and end dates.");
  }
  const parseDate = (value: string, label: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} is invalid.`);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error(`${label} is invalid.`);
    }
    return parsed;
  };
  const parsedStart = parseDate(normalizedStart, "School-year start date");
  const parsedEnd = parseDate(normalizedEnd, "School-year end date");
  if (parsedEnd <= parsedStart) {
    throw new Error("School-year end date must be after the start date.");
  }
  return { startDate: parsedStart, endDate: parsedEnd };
}

export async function prepareStudentProfilePhotoUpload(input: {
  parentUserId: string;
  profileId: string;
  contentType: string;
  sizeBytes: number;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  await getManageableStudentProfile(input.parentUserId, input.profileId);
  const contentType = String(input.contentType ?? "").toLowerCase().split(";", 1)[0].trim();
  const sizeBytes = Number(input.sizeBytes);
  if (!STUDENT_PHOTO_CONTENT_TYPES.has(contentType)) {
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > STUDENT_PHOTO_MAX_BYTES) {
    throw new Error("Student photos may be up to 8 MB.");
  }
  const objectPath = `student-profile-photos/${input.profileId}/${randomUUID()}.${studentPhotoExtension(contentType)}`;
  const uploadUrl = await getSignedPrivateUploadUrl({
    objectPath,
    contentType,
    expiresInMinutes: 15
  });
  return { objectPath, uploadUrl, contentType };
}

export async function completeStudentProfilePhotoUpload(input: {
  parentUserId: string;
  profileId: string;
  objectPath: string;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const { studentProfile } = await getManageableStudentProfile(input.parentUserId, input.profileId);
  const expectedPrefix = `student-profile-photos/${input.profileId}/`;
  if (!input.objectPath.startsWith(expectedPrefix)) {
    throw new Error("The student photo upload is invalid.");
  }
  const metadata = await getPrivateFileMetadata(input.objectPath);
  const contentType = metadata.contentType.toLowerCase().split(";", 1)[0].trim();
  if (!STUDENT_PHOTO_CONTENT_TYPES.has(contentType) || metadata.size <= 0 || metadata.size > STUDENT_PHOTO_MAX_BYTES) {
    throw new Error("The uploaded photo must be a JPEG, PNG, or WebP image up to 8 MB.");
  }
  const bytes = await downloadPrivateFile(input.objectPath);
  if (!isValidStudentPhoto(bytes, contentType)) {
    throw new Error("The uploaded file does not appear to be a valid photo.");
  }
  await db.update(profiles).set({
    avatarUrl: input.objectPath
  }).where(eq(profiles.id, input.profileId));
  if (studentProfile.avatarUrl?.startsWith(expectedPrefix) && studentProfile.avatarUrl !== input.objectPath) {
    await deletePrivateFile(studentProfile.avatarUrl).catch((error) => {
      console.warn(`Could not remove the previous student photo for ${input.profileId}:`, error);
    });
  }
  return {
    profileId: input.profileId,
    avatarUrl: await getSignedLessonAssetUrl(input.objectPath, 60)
  };
}

export async function discardStudentProfilePhotoUpload(input: {
  parentUserId: string;
  profileId: string;
  objectPath: string;
}) {
  await requireAccountRole(input.parentUserId, ["OWNER", "ADMIN"]);
  const { studentProfile } = await getManageableStudentProfile(input.parentUserId, input.profileId);
  const expectedPrefix = `student-profile-photos/${input.profileId}/`;
  if (!input.objectPath.startsWith(expectedPrefix)) {
    throw new Error("The student photo upload is invalid.");
  }
  if (studentProfile.avatarUrl === input.objectPath) {
    throw new Error("The current student photo cannot be discarded as an incomplete upload.");
  }
  await deletePrivateFile(input.objectPath);
  return { discarded: true };
}

async function getStartingGradeNodeId(gradeLevel: number) {
  const [gradeNode] = await db
    .select({
      id: curriculumNodes.id
    })
    .from(curriculumNodes)
    .where(
      and(
        eq(curriculumNodes.type, "grade"),
        sql`lower(${curriculumNodes.title}) = ${`grade ${gradeLevel}`}`
      )
    )
    .limit(1);

  return gradeNode?.id ?? null;
}

async function getFirstSkillForSubject(subjectId: string) {
  const rows = await db.execute<{
    id: string;
  }>(sql`
    WITH RECURSIVE curriculum_tree AS (
      SELECT
        cn.id,
        cn.parent_id,
        cn.type,
        cn.introduced_in_week,
        cn.display_order,
        cn."order"
      FROM curriculum_nodes cn
      WHERE cn.id = ${subjectId}

      UNION ALL

      SELECT
        child.id,
        child.parent_id,
        child.type,
        child.introduced_in_week,
        child.display_order,
        child."order"
      FROM curriculum_nodes child
      INNER JOIN curriculum_tree parent
        ON child.parent_id = parent.id
    )
    SELECT ct.id
    FROM curriculum_tree ct
    INNER JOIN skills s
      ON s.node_id = ct.id
    ORDER BY COALESCE(ct.introduced_in_week, 2147483647), ct.display_order, ct."order", ct.id
    LIMIT 1
  `);

  return rows[0]?.id ?? null;
}

function defaultThemeForGrade(gradeLevel: number): UiTheme {
  return gradeLevel <= 5 ? "playful" : "academic";
}
