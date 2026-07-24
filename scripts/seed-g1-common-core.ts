import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { curriculumNodes, nodeTranslations, skills } from "ts-db";

config({ path: "./app/ts-backend/.env" });
config();

const COMMON_CORE_JURISDICTION_ID = "67810E9EF6944F9383DCC602A3484C23";
const GRADE_ONE_ELA_SET_ID = `${COMMON_CORE_JURISDICTION_ID}_D10003FC_grade-01`;
const CSP_BASE_URL = "http://api.commonstandardsproject.com/api/v1";

type CspStandard = {
  id: string;
  position: number;
  depth: number;
  description: string;
  statementLabel: string | null;
  statementNotation?: string | null;
  altStatementNotation?: string | null;
  ancestorIds?: string[] | null;
};

type CspStandardSet = {
  data: {
    id: string;
    subject: string;
    normalizedSubject: string;
    document: {
      sourceURL: string;
      title: string;
    };
    standards: Record<string, CspStandard>;
  };
};

type NormalizedStandard = {
  domainTitle: string;
  clusterTitle: string;
  standardCode: string;
  standardTitle: string;
  standardDescription: string;
  order: number;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function titleFromStatement(description: string) {
  return description.replace(/\s+/g, " ").trim().replace(/\.$/, "");
}

function codeFromStandard(standard: CspStandard) {
  return standard.altStatementNotation?.trim() || standard.statementNotation?.trim() || standard.id;
}

function isGradeOneElaStandard(standard: CspStandard) {
  if (standard.statementLabel !== "Standard") {
    return false;
  }

  const code = codeFromStandard(standard);
  if (!/^[A-Z]+\.1\.\d+/.test(code)) {
    return false;
  }

  return Boolean(standard.description?.trim());
}

function isGradeOneElaComponent(standard: CspStandard) {
  if (standard.statementLabel !== "Component") {
    return false;
  }

  const code = codeFromStandard(standard);
  return /^[A-Z]+\.1\.\d+[a-z]$/.test(code);
}

async function fetchStandardSet(apiKey: string) {
  const response = await fetch(
    `${CSP_BASE_URL}/standard_sets/${GRADE_ONE_ELA_SET_ID}?api-key=${encodeURIComponent(apiKey)}`
  );

  if (!response.ok) {
    throw new Error(`Common Standards Project request failed: ${response.status}`);
  }

  return (await response.json()) as CspStandardSet;
}

function normalizeGradeOneEla(set: CspStandardSet) {
  const standardsById = new Map<string, CspStandard>(
    Object.values(set.data.standards).map((standard) => [standard.id, standard] as const)
  );

  const includedStandards = Object.values(set.data.standards).filter(isGradeOneElaStandard);
  const components = Object.values(set.data.standards).filter(isGradeOneElaComponent);
  const componentsByStandardId = new Map<string, string[]>();

  for (const component of components) {
    const nearestStandardAncestor = [...(component.ancestorIds ?? [])]
      .reverse()
      .find((ancestorId) => {
        const ancestor = standardsById.get(ancestorId);
        return ancestor ? isGradeOneElaStandard(ancestor) : false;
      });

    if (!nearestStandardAncestor) {
      continue;
    }

    const bucket = componentsByStandardId.get(nearestStandardAncestor) ?? [];
    bucket.push(titleFromStatement(component.description));
    componentsByStandardId.set(nearestStandardAncestor, bucket);
  }

  const normalized = includedStandards
    .map<NormalizedStandard | null>((standard) => {
      const ancestors = (standard.ancestorIds ?? [])
        .map((ancestorId) => standardsById.get(ancestorId))
        .filter((ancestor): ancestor is CspStandard => Boolean(ancestor));

      const domain = ancestors.find((ancestor) => ancestor.depth === 0);
      const cluster = ancestors.find((ancestor) => ancestor.depth === 1);

      if (!domain || !cluster) {
        return null;
      }

      const code = codeFromStandard(standard);
      const componentSummaries = componentsByStandardId.get(standard.id) ?? [];
      const standardDescription = componentSummaries.length
        ? `Common Core ${code}. Components: ${componentSummaries.join(" • ")}`
        : `Common Core ${code}.`;

      return {
        domainTitle: titleFromStatement(domain.description),
        clusterTitle: titleFromStatement(cluster.description),
        standardCode: code,
        standardTitle: titleFromStatement(standard.description),
        standardDescription,
        order: standard.position
      };
    })
    .filter((row): row is NormalizedStandard => row !== null)
    .sort((left, right) => left.order - right.order);

  const domainOrder = new Map<string, number>();
  const clusterOrder = new Map<string, number>();

  normalized.forEach((row, index) => {
    if (!domainOrder.has(row.domainTitle)) {
      domainOrder.set(row.domainTitle, domainOrder.size);
    }

    const clusterKey = `${row.domainTitle}::${row.clusterTitle}`;
    if (!clusterOrder.has(clusterKey)) {
      clusterOrder.set(clusterKey, index);
    }
  });

  return {
    normalized,
    domainOrder,
    clusterOrder
  };
}

async function getGradeOneNodeId(
  db: Awaited<ReturnType<typeof import("../app/ts-backend/src/db")>>["db"]
) {
  const [gradeNode] = await db
    .select({ id: curriculumNodes.id })
    .from(curriculumNodes)
    .where(and(eq(curriculumNodes.type, "grade"), eq(curriculumNodes.title, "Grade 1")))
    .limit(1);

  if (!gradeNode) {
    throw new Error("Grade 1 node not found. Run the grade-node seed first.");
  }

  return gradeNode.id;
}

async function upsertNode(input: {
  db: Awaited<ReturnType<typeof import("../app/ts-backend/src/db")>>["db"];
  slug: string;
  parentId: string | null;
  type: "subject" | "domain" | "cluster" | "skill";
  title: string;
  description: string | null;
  order: number;
  externalReference?: string | null;
}) {
  const [node] = await input.db
    .insert(curriculumNodes)
    .values({
      parentId: input.parentId,
      type: input.type,
      title: input.title,
      slug: input.slug,
      order: input.order,
      displayOrder: input.order,
      skillObjective: input.type === "skill" ? input.title : null,
      externalReference: input.externalReference ?? null
    })
    .onConflictDoUpdate({
      target: curriculumNodes.slug,
      set: {
        parentId: input.parentId,
        type: input.type,
        title: input.title,
        order: input.order,
        displayOrder: input.order,
        skillObjective: input.type === "skill" ? input.title : null,
        externalReference: input.externalReference ?? null
      }
    })
    .returning({ id: curriculumNodes.id });

  await input.db
    .insert(nodeTranslations)
    .values({
      nodeId: node.id,
      languageCode: "en-US",
      title: input.title,
      description: input.description
    })
    .onConflictDoUpdate({
      target: [nodeTranslations.nodeId, nodeTranslations.languageCode],
      set: {
        title: input.title,
        description: input.description
      }
    });

  return node.id;
}

async function upsertSkillRow(input: {
  db: Awaited<ReturnType<typeof import("../app/ts-backend/src/db")>>["db"];
  nodeId: string;
  learningObjectives: string;
}) {
  await input.db
    .insert(skills)
    .values({
      nodeId: input.nodeId,
      difficulty: 1,
      masteryThreshold: 0.85,
      learningObjectives: input.learningObjectives,
      pedagogicalTone: "clear, parent-friendly, and standards-aligned",
      visualConstraint: "Use simple Grade 1 visuals when rendered into lessons."
    })
    .onConflictDoUpdate({
      target: skills.nodeId,
      set: {
        difficulty: 1,
        masteryThreshold: 0.85,
        learningObjectives: input.learningObjectives,
        pedagogicalTone: "clear, parent-friendly, and standards-aligned",
        visualConstraint: "Use simple Grade 1 visuals when rendered into lessons."
      }
    });
}

async function main() {
  const apiKey = requireEnv("COMMON_STANDARDS_PROJECT_API_KEY");
  const set = await fetchStandardSet(apiKey);
  const { normalized, domainOrder, clusterOrder } = normalizeGradeOneEla(set);
  const { db, client } = await import("../app/ts-backend/src/db");

  if (normalized.length === 0) {
    throw new Error("No Grade 1 ELA standards were normalized from Common Standards Project.");
  }

  const gradeOneNodeId = await getGradeOneNodeId(db);
  const subjectId = await upsertNode({
    db,
    slug: "ela-g1",
    parentId: gradeOneNodeId,
    type: "subject",
    title: "English Language Arts",
    description: "Grade 1 English Language Arts aligned to the Common Core State Standards.",
    order: 1,
    externalReference: `${set.data.document.title} (${set.data.document.sourceURL})`
  });

  const domainIds = new Map<string, string>();
  const clusterIds = new Map<string, string>();

  for (const row of normalized) {
    const domainSlug = `ela-g1-${slugify(row.domainTitle)}`;
    const clusterSlug = `ela-g1-${slugify(row.domainTitle)}-${slugify(row.clusterTitle)}`;

    let domainId = domainIds.get(row.domainTitle);
    if (!domainId) {
      domainId = await upsertNode({
        db,
        slug: domainSlug,
        parentId: subjectId,
        type: "domain",
        title: row.domainTitle,
        description: `${row.domainTitle} strand for Grade 1 Common Core English Language Arts.`,
        order: domainOrder.get(row.domainTitle) ?? 0
      });
      domainIds.set(row.domainTitle, domainId);
    }

    const clusterKey = `${row.domainTitle}::${row.clusterTitle}`;
    let clusterId = clusterIds.get(clusterKey);
    if (!clusterId) {
      clusterId = await upsertNode({
        db,
        slug: clusterSlug,
        parentId: domainId,
        type: "cluster",
        title: row.clusterTitle,
        description: `${row.clusterTitle} cluster within ${row.domainTitle}.`,
        order: clusterOrder.get(clusterKey) ?? 0
      });
      clusterIds.set(clusterKey, clusterId);
    }

    const skillId = await upsertNode({
      db,
      slug: `ela-g1-${slugify(row.standardCode)}`,
      parentId: clusterId,
      type: "skill",
      title: row.standardTitle,
      description: row.standardDescription,
      order: row.order,
      externalReference: `Common Core ${row.standardCode}`
    });

    await upsertSkillRow({
      db,
      nodeId: skillId,
      learningObjectives: row.standardTitle
    });
  }

  await client.end();

  console.log(
    `Seeded Grade 1 Common Core English Language Arts: ${domainIds.size} domains, ${clusterIds.size} clusters, ${normalized.length} standards.`
  );
}

await main();
