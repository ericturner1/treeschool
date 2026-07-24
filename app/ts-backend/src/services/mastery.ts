import { and, eq, sql } from "drizzle-orm";
import { skillProgress, skills, studentMastery } from "ts-db";
import { db } from "../db";

const REAFFIRMATION_WINDOW_HOURS = 12;

function normalizeThreshold(value: number) {
  if (value <= 1) {
    return value * 100;
  }

  return value;
}

function hoursSince(date: Date | null, now: Date) {
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  return (now.getTime() - date.getTime()) / (1000 * 60 * 60);
}

async function getNextSkillNodeId(nodeId: string) {
  const rows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id, type
      FROM curriculum_nodes
      WHERE id = ${nodeId}

      UNION ALL

      SELECT parent.id, parent.parent_id, parent.type
      FROM curriculum_nodes parent
      INNER JOIN ancestors child
        ON child.parent_id = parent.id
    ),
    subject_root AS (
      SELECT id
      FROM ancestors
      WHERE type = 'subject'
      LIMIT 1
    ),
    curriculum_tree AS (
      SELECT
        cn.id,
        cn.parent_id,
        cn.introduced_in_week,
        cn.display_order
      FROM curriculum_nodes cn
      WHERE cn.id = (SELECT id FROM subject_root)

      UNION ALL

      SELECT
        child.id,
        child.parent_id,
        child.introduced_in_week,
        child.display_order
      FROM curriculum_nodes child
      INNER JOIN curriculum_tree parent
        ON child.parent_id = parent.id
    ),
    ordered_skills AS (
      SELECT
        ct.id,
        COALESCE(ct.introduced_in_week, 2147483647) AS introduced_in_week,
        ct.display_order
      FROM curriculum_tree ct
      INNER JOIN skills s
        ON s.node_id = ct.id
      ORDER BY COALESCE(ct.introduced_in_week, 2147483647), ct.display_order, ct.id
    ),
    current_skill AS (
      SELECT introduced_in_week, display_order, id
      FROM ordered_skills
      WHERE id = ${nodeId}
      LIMIT 1
    )
    SELECT os.id
    FROM ordered_skills os
    CROSS JOIN current_skill cs
    WHERE (os.introduced_in_week, os.display_order, os.id) > (cs.introduced_in_week, cs.display_order, cs.id)
    ORDER BY os.introduced_in_week, os.display_order, os.id
    LIMIT 1
  `);

  return rows[0]?.id ?? null;
}

export async function evaluateSession(profileId: string, nodeId: string, score: number) {
  const now = new Date();

  const [skill] = await db
    .select({
      nodeId: skills.nodeId,
      masteryThreshold: skills.masteryThreshold
    })
    .from(skills)
    .where(eq(skills.nodeId, nodeId))
    .limit(1);

  if (!skill) {
    throw new Error(`Skill ${nodeId} not found.`);
  }

  const [existing] = await db
    .select({
      profileId: studentMastery.profileId,
      nodeId: studentMastery.nodeId,
      attemptCount: studentMastery.attemptCount,
      smartScore: studentMastery.smartScore,
      reaffirmationCount: studentMastery.reaffirmationCount,
      requiredReaffirmations: studentMastery.requiredReaffirmations,
      status: studentMastery.status,
      lastAttemptedAt: studentMastery.lastAttemptedAt,
      lastSuccessfulAt: studentMastery.lastSuccessfulAt,
      unlockedAt: studentMastery.unlockedAt,
      masteredAt: studentMastery.masteredAt
    })
    .from(studentMastery)
    .where(and(eq(studentMastery.profileId, profileId), eq(studentMastery.nodeId, nodeId)))
    .limit(1);

  const requiredScore = normalizeThreshold(skill.masteryThreshold);
  const success = score >= requiredScore;
  const attemptCount = (existing?.attemptCount ?? 0) + 1;
  const lastSuccessfulAt = existing?.lastSuccessfulAt ?? null;
  const distinctSuccess = success && hoursSince(lastSuccessfulAt, now) >= REAFFIRMATION_WINDOW_HOURS;
  const reaffirmationCount =
    (existing?.reaffirmationCount ?? 0) + (distinctSuccess ? 1 : 0);
  const requiredReaffirmations = existing?.requiredReaffirmations ?? 3;

  let status: "LOCKED" | "UNLOCKED" | "REAFFIRMING" | "MASTERED";

  if (reaffirmationCount >= requiredReaffirmations && success) {
    status = "MASTERED";
  } else if (reaffirmationCount > 0 || (existing && existing.status === "MASTERED")) {
    status = "REAFFIRMING";
  } else {
    status = "UNLOCKED";
  }

  await db
    .insert(studentMastery)
    .values({
      profileId,
      nodeId,
      attemptCount,
      smartScore: Math.round(score),
      reaffirmationCount,
      requiredReaffirmations,
      status,
      lastAttemptedAt: now,
      lastSuccessfulAt: success ? now : existing?.lastSuccessfulAt ?? null,
      unlockedAt: existing?.unlockedAt ?? now,
      masteredAt: status === "MASTERED" ? now : existing?.masteredAt ?? null
    })
    .onConflictDoUpdate({
      target: [studentMastery.profileId, studentMastery.nodeId],
      set: {
        attemptCount,
        smartScore: Math.round(score),
        reaffirmationCount,
        requiredReaffirmations,
        status,
        lastAttemptedAt: now,
        lastSuccessfulAt: success ? now : existing?.lastSuccessfulAt ?? null,
        unlockedAt: existing?.unlockedAt ?? now,
        masteredAt: status === "MASTERED" ? now : existing?.masteredAt ?? null
      }
    });

  await db
    .insert(skillProgress)
    .values({
      profileId,
      skillId: nodeId,
      status:
        status === "MASTERED"
          ? "mastered"
          : status === "REAFFIRMING"
            ? "in_progress"
            : "in_progress",
      score
    })
    .onConflictDoUpdate({
      target: [skillProgress.profileId, skillProgress.skillId],
      set: {
        status:
          status === "MASTERED"
            ? "mastered"
            : status === "REAFFIRMING"
              ? "in_progress"
              : "in_progress",
        score
      }
    });

  let unlockedNextSkillId: string | null = null;

  const nextSkillId = await getNextSkillNodeId(nodeId);

  if (nextSkillId) {
    const [nextExisting] = await db
      .select({
        status: studentMastery.status
      })
      .from(studentMastery)
      .where(
        and(
          eq(studentMastery.profileId, profileId),
          eq(studentMastery.nodeId, nextSkillId)
        )
      )
      .limit(1);

    if (!nextExisting || nextExisting.status === "LOCKED") {
      await db
        .insert(studentMastery)
        .values({
          profileId,
          nodeId: nextSkillId,
          status: "UNLOCKED",
          unlockedAt: now
        })
        .onConflictDoUpdate({
          target: [studentMastery.profileId, studentMastery.nodeId],
          set: {
            status: "UNLOCKED",
            unlockedAt: now
          }
        });

      unlockedNextSkillId = nextSkillId;
    }
  }

  return {
    profileId,
    nodeId,
    attemptCount,
    score: Math.round(score),
    success,
    requiredScore,
    reaffirmationCount,
    requiredReaffirmations,
    status,
    unlockedNextSkillId
  };
}

export async function unlockInitialSkill(profileId: string, nodeId: string) {
  const now = new Date();

  await db
    .insert(studentMastery)
    .values({
      profileId,
      nodeId,
      status: "UNLOCKED",
      unlockedAt: now
    })
    .onConflictDoNothing();

  return {
    profileId,
    nodeId,
    status: "UNLOCKED"
  };
}
