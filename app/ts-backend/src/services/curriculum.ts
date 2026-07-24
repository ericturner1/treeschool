import { sql } from "drizzle-orm";
import { masteryStatusEnum, skillProgressStatusEnum } from "ts-db";
import { db } from "../db";

export type CurriculumSubjectRow = {
  id: string;
  parentId: string | null;
  type: string;
  title: string;
  description: string | null;
  slug: string | null;
  order: number;
  displayOrder: number;
  introducedInWeek: number | null;
};

export type CurriculumProgramRow = {
  id: string;
  parentId: string | null;
  type: string;
  title: string;
  description: string | null;
  slug: string | null;
  order: number;
  displayOrder: number;
  introducedInWeek: number | null;
  gradeTitles: string[];
};

export type CurriculumProgramSubjectRow = CurriculumSubjectRow & {
  gradeId: string;
  gradeTitle: string;
  gradeOrder: number;
};

export type CurriculumTreeLessonSummary = {
  id: string;
  title: string;
  status: string;
  profileId: string;
  profileName: string | null;
  updatedAt: string;
  isQueued: boolean;
  isGenerating: boolean;
  isRetrying: boolean;
  isError: boolean;
};

export type CurriculumTreeNodeWithLessons = CurriculumSubjectRow & {
  depth: number;
  lessonCount: number;
  queuedLessonCount: number;
  generatingLessonCount: number;
  lessons: CurriculumTreeLessonSummary[];
};

export type StudentCurriculumPathRow = {
  id: string;
  parentId: string | null;
  type: string;
  title: string;
  description: string | null;
  slug: string | null;
  order: number;
  displayOrder: number;
  introducedInWeek: number | null;
  depth: number;
  skillId: string | null;
  legacySkillStatus: (typeof skillProgressStatusEnum.enumValues)[number] | null;
  legacyScore: number | null;
  masteryStatus: (typeof masteryStatusEnum.enumValues)[number] | null;
  smartScore: number | null;
  reaffirmationCount: number | null;
  requiredReaffirmations: number | null;
  technicalKeywords: string[];
  externalReference: string | null;
};

function hasTemplatePlaceholder(value: string | null | undefined) {
  return typeof value === "string" && /\{\{[^}]+\}\}/.test(value);
}

function humanizePlaceholderToken(token: string) {
  return token
    .replace(/_\d+$/g, "")
    .replaceAll("_", " ")
    .trim()
    .toLowerCase();
}

function normalizePlaceholderTitle(title: string) {
  let normalized = title.replace(/\{\{([^}]+)\}\}/g, (_match, token) => humanizePlaceholderToken(token));
  normalized = normalized.replace(/\bcoin,\s*coin\b/gi, "coins");
  normalized = normalized.replace(/\bcoin and coin\b/gi, "coins");
  normalized = normalized.replace(/\b([a-z]+),\s*\1\b/gi, "$1s");
  normalized = normalized.replace(/\b([a-z]+)\s+and\s+\1\b/gi, "$1s");
  normalized = normalized.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
  normalized = normalized.replace(/\s+([?.!,:;])/g, "$1");
  return normalized;
}

function getSafeDisplayTitle(input: {
  title: string;
  description: string | null;
  type: string;
}) {
  if (!hasTemplatePlaceholder(input.title)) {
    return input.title;
  }

  const normalizedTitle = normalizePlaceholderTitle(input.title);
  if (!hasTemplatePlaceholder(normalizedTitle) && normalizedTitle.length > 0) {
    return normalizedTitle;
  }

  if (input.description && !hasTemplatePlaceholder(input.description)) {
    return input.description.replace(/[.]+$/g, "").trim();
  }

  if (input.type === "subject") {
    return "Subject";
  }

  if (input.type === "domain") {
    return "Domain";
  }

  if (input.type === "cluster") {
    return "Cluster";
  }

  return "Standard";
}

function getSafeLessonTitle(title: string) {
  if (!hasTemplatePlaceholder(title)) {
    return title;
  }

  const normalized = normalizePlaceholderTitle(title);
  if (!hasTemplatePlaceholder(normalized) && normalized.length > 0) {
    return normalized;
  }

  return "Lesson";
}

export async function getStudentCurriculumPath(
  profileId: string,
  subjectId: string,
  languageCode = "en-US"
) {
  return db.execute<StudentCurriculumPathRow>(sql`
    WITH RECURSIVE curriculum_tree AS (
      SELECT
        cn.id,
        cn.parent_id AS "parentId",
        cn.type,
        cn.title,
        cn.slug,
        cn."order",
        cn.display_order AS "displayOrder",
        cn.introduced_in_week AS "introducedInWeek",
        cn.technical_keywords AS "technicalKeywords",
        cn.external_reference AS "externalReference",
        0::int AS depth
      FROM curriculum_nodes cn
      LEFT JOIN node_configurations nc
        ON nc.profile_id = ${profileId}
       AND nc.node_id = cn.id
      WHERE cn.id = ${subjectId}
        AND COALESCE(nc.is_disabled, false) = false

      UNION ALL

      SELECT
        child.id,
        child.parent_id AS "parentId",
        child.type,
        child.title,
        child.slug,
        child."order",
        child.display_order AS "displayOrder",
        child.introduced_in_week AS "introducedInWeek",
        child.technical_keywords AS "technicalKeywords",
        child.external_reference AS "externalReference",
        parent.depth + 1 AS depth
      FROM curriculum_nodes child
      INNER JOIN curriculum_tree parent
        ON child.parent_id = parent.id
      LEFT JOIN node_configurations nc
        ON nc.profile_id = ${profileId}
       AND nc.node_id = child.id
      WHERE COALESCE(nc.is_disabled, false) = false
    )
    SELECT
      ct.id,
      ct."parentId",
      ct.type,
      COALESCE(nt.title, ct.title) AS title,
      nt.description,
      ct.slug,
      ct."order",
      ct."displayOrder",
      ct."introducedInWeek",
      ct.depth,
      s.node_id AS "skillId",
      sp.status AS "legacySkillStatus",
      sp.score AS "legacyScore",
      sm.status AS "masteryStatus",
      sm.smart_score AS "smartScore",
      sm.reaffirmation_count AS "reaffirmationCount",
      sm.required_reaffirmations AS "requiredReaffirmations",
      ct."technicalKeywords",
      ct."externalReference"
    FROM curriculum_tree ct
    LEFT JOIN node_translations nt
      ON nt.node_id = ct.id
     AND nt.language_code = ${languageCode}
    LEFT JOIN skills s
      ON s.node_id = ct.id
    LEFT JOIN skill_progress sp
      ON sp.profile_id = ${profileId}
     AND sp.skill_id = s.node_id
    LEFT JOIN student_mastery sm
      ON sm.profile_id = ${profileId}
     AND sm.node_id = s.node_id
    ORDER BY
      ct.depth,
      COALESCE(ct."introducedInWeek", 2147483647),
      ct."displayOrder",
      ct."order",
      title
  `);
}

export async function listCurriculumSubjects(languageCode = "en-US") {
  return db.execute<CurriculumSubjectRow>(sql`
    SELECT
      cn.id,
      cn.parent_id AS "parentId",
      cn.type,
      COALESCE(nt.title, cn.title) AS title,
      nt.description,
      cn.slug,
      cn."order",
      cn.display_order AS "displayOrder",
      cn.introduced_in_week AS "introducedInWeek"
    FROM curriculum_nodes cn
    LEFT JOIN node_translations nt
      ON nt.node_id = cn.id
     AND nt.language_code = ${languageCode}
    WHERE cn.type = 'subject'
    ORDER BY
      cn.display_order,
      cn."order",
      title
  `);
}

export async function listCurriculumPrograms(languageCode = "en-US") {
  return db.execute<CurriculumProgramRow>(sql`
    WITH grade_children AS (
      SELECT
        program.id AS program_id,
        grade.title AS grade_title,
        grade."order" AS grade_order
      FROM curriculum_nodes program
      INNER JOIN curriculum_nodes grade
        ON grade.parent_id = program.id
       AND grade.type = 'grade'
      WHERE program.type = 'program'
    ),
    subjectful_programs AS (
      SELECT DISTINCT program.id AS program_id
      FROM curriculum_nodes program
      INNER JOIN curriculum_nodes grade
        ON grade.parent_id = program.id
       AND grade.type = 'grade'
      INNER JOIN curriculum_nodes subject
        ON subject.parent_id = grade.id
       AND subject.type = 'subject'
      WHERE program.type = 'program'
    )
    SELECT
      cn.id,
      cn.parent_id AS "parentId",
      cn.type,
      COALESCE(nt.title, cn.title) AS title,
      nt.description,
      cn.slug,
      cn."order",
      cn.display_order AS "displayOrder",
      cn.introduced_in_week AS "introducedInWeek",
      COALESCE(
        ARRAY_AGG(gc.grade_title ORDER BY gc.grade_order) FILTER (WHERE gc.grade_title IS NOT NULL),
        ARRAY[]::text[]
      ) AS "gradeTitles"
    FROM curriculum_nodes cn
    LEFT JOIN node_translations nt
      ON nt.node_id = cn.id
     AND nt.language_code = ${languageCode}
    LEFT JOIN grade_children gc
      ON gc.program_id = cn.id
    INNER JOIN subjectful_programs sp
      ON sp.program_id = cn.id
    WHERE cn.type = 'program'
    GROUP BY
      cn.id,
      cn.parent_id,
      cn.type,
      nt.title,
      nt.description,
      cn.slug,
      cn.title,
      cn."order",
      cn.display_order,
      cn.introduced_in_week
    ORDER BY
      cn.display_order,
      cn."order",
      title
  `);
}

export async function listCurriculumSubjectsByProgram(
  programId: string,
  languageCode = "en-US"
) {
  return db.execute<CurriculumProgramSubjectRow>(sql`
    SELECT
      subject.id,
      subject.parent_id AS "parentId",
      subject.type,
      COALESCE(subject_translation.title, subject.title) AS title,
      subject_translation.description,
      subject.slug,
      subject."order",
      subject.display_order AS "displayOrder",
      subject.introduced_in_week AS "introducedInWeek",
      grade.id AS "gradeId",
      COALESCE(grade_translation.title, grade.title) AS "gradeTitle",
      grade."order" AS "gradeOrder"
    FROM curriculum_nodes program
    INNER JOIN curriculum_nodes grade
      ON grade.parent_id = program.id
     AND grade.type = 'grade'
    INNER JOIN curriculum_nodes subject
      ON subject.parent_id = grade.id
     AND subject.type = 'subject'
    LEFT JOIN node_translations grade_translation
      ON grade_translation.node_id = grade.id
     AND grade_translation.language_code = ${languageCode}
    LEFT JOIN node_translations subject_translation
      ON subject_translation.node_id = subject.id
     AND subject_translation.language_code = ${languageCode}
    WHERE program.id = ${programId}
      AND program.type = 'program'
    ORDER BY
      grade."order",
      subject.display_order,
      subject."order",
      title
  `);
}

export async function getCurriculumTreeBySubjectSlug(
  slug: string,
  languageCode = "en-US",
  parentUserId?: string
) {
  const nodes = await db.execute<CurriculumSubjectRow & { depth: number }>(sql`
    WITH RECURSIVE curriculum_tree AS (
      SELECT
        cn.id,
        cn.parent_id AS "parentId",
        cn.type,
        cn.title,
        cn.slug,
        cn."order",
        cn.display_order AS "displayOrder",
        cn.introduced_in_week AS "introducedInWeek",
        0::int AS depth
      FROM curriculum_nodes cn
      WHERE cn.slug = ${slug}
        AND cn.type = 'subject'

      UNION ALL

      SELECT
        child.id,
        child.parent_id AS "parentId",
        child.type,
        child.title,
        child.slug,
        child."order",
        child.display_order AS "displayOrder",
        child.introduced_in_week AS "introducedInWeek",
        parent.depth + 1 AS depth
      FROM curriculum_nodes child
      INNER JOIN curriculum_tree parent
        ON child.parent_id = parent.id
    )
    SELECT
      ct.id,
      ct."parentId",
      ct.type,
      COALESCE(nt.title, ct.title) AS title,
      nt.description,
      ct.slug,
      ct."order",
      ct."displayOrder",
      ct."introducedInWeek",
      ct.depth
    FROM curriculum_tree ct
    LEFT JOIN node_translations nt
      ON nt.node_id = ct.id
     AND nt.language_code = ${languageCode}
    ORDER BY
      ct.depth,
      COALESCE(ct."introducedInWeek", 2147483647),
      ct."displayOrder",
      ct."order",
      title
  `);

  if (!parentUserId) {
    return nodes.map((node) => ({
      ...node,
      title: getSafeDisplayTitle(node),
      lessonCount: 0,
      queuedLessonCount: 0,
      generatingLessonCount: 0,
      lessons: []
    })) satisfies CurriculumTreeNodeWithLessons[];
  }

  const standardNodeIds = nodes.filter((node) => node.type === "skill").map((node) => node.id);

  if (standardNodeIds.length === 0) {
    return nodes.map((node) => ({
      ...node,
      title: getSafeDisplayTitle(node),
      lessonCount: 0,
      queuedLessonCount: 0,
      generatingLessonCount: 0,
      lessons: []
    })) satisfies CurriculumTreeNodeWithLessons[];
  }

  const lessonRows = await db.execute<{
    lessonId: string;
    nodeId: string;
    title: string;
    status: string;
    profileId: string;
    profileName: string | null;
    updatedAt: string;
    generationLogs: unknown;
    jobStatus: "queued" | "running" | "retry_wait" | "failed" | "completed" | null;
  }>(sql`
    WITH parent_account AS (
      SELECT account_id
      FROM profiles
      WHERE user_id = ${parentUserId}
        AND role = 'PARENT'
      LIMIT 1
    )
    SELECT
      l.id AS "lessonId",
      l.node_id AS "nodeId",
      l.title,
      l.status,
      p.id AS "profileId",
      p.first_name AS "profileName",
      l.updated_at AS "updatedAt",
      l.generation_logs AS "generationLogs",
      lgj.status AS "jobStatus"
    FROM lessons l
    INNER JOIN profiles p
      ON p.id = l.profile_id
    INNER JOIN parent_account pa
      ON pa.account_id = p.account_id
    LEFT JOIN lesson_generation_jobs lgj
      ON lgj.lesson_id = l.id
    WHERE l.node_id IN (${sql.join(
      standardNodeIds.map((nodeId) => sql`${nodeId}`),
      sql`, `
    )})
    ORDER BY l.updated_at DESC, l.created_at DESC
  `);

  const lessonsByNode = new Map<string, CurriculumTreeLessonSummary[]>();

  for (const row of lessonRows) {
    const isReady = row.status === "ready";
    const jobStatus = row.jobStatus;
    const latestStage =
      Array.isArray(row.generationLogs) &&
      row.generationLogs.length > 0 &&
      typeof row.generationLogs[row.generationLogs.length - 1] === "object" &&
      row.generationLogs[row.generationLogs.length - 1] !== null
        ? String((row.generationLogs[row.generationLogs.length - 1] as { stage?: string }).stage ?? "")
        : "";
    const isQueued = !isReady && (jobStatus === "queued" || (!jobStatus && latestStage === "queued"));
    const isGenerating = !isReady && jobStatus === "running";
    const isRetrying = !isReady && jobStatus === "retry_wait";
    const isError = !isReady && (jobStatus === "failed" || (!jobStatus && latestStage === "error"));
    const bucket = lessonsByNode.get(row.nodeId) ?? [];
    bucket.push({
      id: row.lessonId,
      title: getSafeLessonTitle(row.title),
      status: row.status,
      profileId: row.profileId,
      profileName: row.profileName,
      updatedAt: row.updatedAt,
      isQueued,
      isGenerating,
      isRetrying,
      isError
    });
    lessonsByNode.set(row.nodeId, bucket);
  }

  return nodes.map((node) => {
    const lessons = lessonsByNode.get(node.id) ?? [];

    return {
      ...node,
      title: getSafeDisplayTitle(node),
      lessonCount: lessons.length,
      queuedLessonCount: lessons.filter((lesson) => lesson.isQueued).length,
      generatingLessonCount: lessons.filter((lesson) => lesson.isGenerating).length,
      lessons
    };
  }) satisfies CurriculumTreeNodeWithLessons[];
}

export async function getNodeBySlug(slug: string, languageCode = "en-US") {
  const rows = await db.execute<{
    id: string;
    parentId: string | null;
    type: string;
    title: string;
    description: string | null;
    slug: string | null;
    introducedInWeek: number | null;
    displayOrder: number;
    skillObjective: string | null;
    technicalKeywords: string[];
    externalReference: string | null;
  }>(sql`
    SELECT
      cn.id,
      cn.parent_id AS "parentId",
      cn.type,
      COALESCE(nt.title, cn.title) AS title,
      nt.description,
      cn.slug,
      cn.introduced_in_week AS "introducedInWeek",
      cn.display_order AS "displayOrder",
      cn.skill_objective AS "skillObjective",
      cn.technical_keywords AS "technicalKeywords",
      cn.external_reference AS "externalReference"
    FROM curriculum_nodes cn
    LEFT JOIN node_translations nt
      ON nt.node_id = cn.id
     AND nt.language_code = ${languageCode}
    WHERE cn.slug = ${slug}
    LIMIT 1
  `);

  const row = rows[0] ?? null;
  if (!row) {
    return null;
  }

  return {
    ...row,
    title: getSafeDisplayTitle(row)
  };
}
