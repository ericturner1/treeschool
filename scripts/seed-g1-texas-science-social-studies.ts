import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { curriculumNodes, nodeTranslations, skills } from "ts-db";

config({ path: "./app/ts-backend/.env" });
config();

const TEXAS_JURISDICTION_ID = "28903EF2A9F9469C9BF592D4D0BE10F8";
const CSP_BASE_URL = "http://api.commonstandardsproject.com/api/v1";

const SUBJECTS = [
  {
    setId: `${TEXAS_JURISDICTION_ID}_D21312460_grade-01`,
    title: "Science",
    slug: "science-g1",
    order: 2,
    description: "Grade 1 science aligned to the Texas Essential Knowledge and Skills.",
    externalReferenceLabel: "Texas Science TEKS Grade 1"
  },
  {
    setId: `${TEXAS_JURISDICTION_ID}_D21431881_grade-01`,
    title: "Social Studies",
    slug: "social-studies-g1",
    order: 3,
    description: "Grade 1 social studies aligned to the Texas Essential Knowledge and Skills.",
    externalReferenceLabel: "Texas Social Studies TEKS Grade 1"
  }
] as const;

type CspStandard = {
  id: string;
  position: number;
  depth: number;
  description: string;
  statementNotation?: string | null;
  ancestorIds?: string[] | null;
};

type CspStandardSet = {
  data: {
    id: string;
    subject: string;
    title: string;
    document: {
      sourceURL: string;
      title: string;
    };
    standards: Record<string, CspStandard>;
  };
};

type SubjectConfig = (typeof SUBJECTS)[number];

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

function trimStatement(description: string) {
  return description.replace(/\s+/g, " ").trim();
}

function sentenceCase(input: string) {
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function domainTitle(standard: CspStandard) {
  const base = trimStatement(standard.description)
    .replace(/\s*The student is expected to:\s*$/i, "")
    .replace(/^The student understands\s+/i, "")
    .replace(/^The student knows that\s+/i, "")
    .replace(/^The student knows\s+/i, "")
    .replace(/^The student uses\s+/i, "")
    .replace(/^The student applies\s+/i, "")
    .replace(/^The student identifies\s+/i, "")
    .replace(/^The student analyzes and interprets\s+/i, "")
    .replace(/^The student develops\s+/i, "")
    .replace(/^The student asks questions, identifies problems, and\s+/i, "")
    .replace(/\.$/, "");

  const notation = standard.statementNotation?.trim();
  return notation ? `${notation} ${sentenceCase(base)}` : sentenceCase(base);
}

function standardTitle(standard: CspStandard) {
  const notation = standard.statementNotation?.trim();
  const title = trimStatement(standard.description).replace(/[;.]$/, "");
  return notation ? `${notation} ${sentenceCase(title)}` : sentenceCase(title);
}

async function fetchStandardSet(apiKey: string, setId: string) {
  const response = await fetch(
    `${CSP_BASE_URL}/standard_sets/${setId}?api-key=${encodeURIComponent(apiKey)}`
  );

  if (!response.ok) {
    throw new Error(`Common Standards Project request failed for ${setId}: ${response.status}`);
  }

  return (await response.json()) as CspStandardSet;
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
  type: "subject" | "domain" | "skill";
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

async function seedSubject(input: {
  db: Awaited<ReturnType<typeof import("../app/ts-backend/src/db")>>["db"];
  gradeNodeId: string;
  apiKey: string;
  subject: SubjectConfig;
}) {
  const set = await fetchStandardSet(input.apiKey, input.subject.setId);
  const orderedStandards = Object.values(set.data.standards).sort((left, right) => left.position - right.position);
  const domains = orderedStandards.filter((standard) => standard.depth === 0);
  const standards = orderedStandards.filter((standard) => standard.depth === 1);

  if (domains.length === 0 || standards.length === 0) {
    throw new Error(`Unexpected Texas structure for ${input.subject.title}.`);
  }

  const subjectId = await upsertNode({
    db: input.db,
    slug: input.subject.slug,
    parentId: input.gradeNodeId,
    type: "subject",
    title: input.subject.title,
    description: input.subject.description,
    order: input.subject.order,
    externalReference: `${input.subject.externalReferenceLabel} (${set.data.document.sourceURL})`
  });

  const standardsById = new Map(orderedStandards.map((standard) => [standard.id, standard] as const));
  const domainIdByStandardId = new Map<string, string>();

  for (const [index, domain] of domains.entries()) {
    const domainId = await upsertNode({
      db: input.db,
      slug: `${input.subject.slug}-${slugify(domain.statementNotation ?? domainTitle(domain))}`,
      parentId: subjectId,
      type: "domain",
      title: domainTitle(domain),
      description: trimStatement(domain.description),
      order: index,
      externalReference: `${input.subject.externalReferenceLabel} ${domain.statementNotation ?? ""}`.trim()
    });
    domainIdByStandardId.set(domain.id, domainId);
  }

  for (const standard of standards) {
    const parentDomain = (standard.ancestorIds ?? [])
      .map((ancestorId) => standardsById.get(ancestorId))
      .find((ancestor): ancestor is CspStandard => Boolean(ancestor && ancestor.depth === 0));

    if (!parentDomain) {
      continue;
    }

    const domainId = domainIdByStandardId.get(parentDomain.id);
    if (!domainId) {
      continue;
    }

    const title = standardTitle(standard);
    const description = trimStatement(standard.description);
    const nodeId = await upsertNode({
      db: input.db,
      slug: `${input.subject.slug}-${slugify(standard.statementNotation ?? standard.id)}`,
      parentId: domainId,
      type: "skill",
      title,
      description,
      order: standard.position,
      externalReference: `${input.subject.externalReferenceLabel} ${standard.statementNotation ?? ""}`.trim()
    });

    await upsertSkillRow({
      db: input.db,
      nodeId,
      learningObjectives: description
    });
  }

  return { domainCount: domains.length, standardCount: standards.length };
}

async function main() {
  const apiKey = requireEnv("COMMON_STANDARDS_PROJECT_API_KEY");
  const { db, client } = await import("../app/ts-backend/src/db");
  const gradeNodeId = await getGradeOneNodeId(db);

  const results = [];

  for (const subject of SUBJECTS) {
    results.push(
      await seedSubject({
        db,
        gradeNodeId,
        apiKey,
        subject
      })
    );
  }

  await client.end();

  console.log(
    `Seeded Texas Grade 1 subjects: ${SUBJECTS.map((subject, index) => `${subject.title} (${results[index].domainCount} domains, ${results[index].standardCount} standards)`).join("; ")}.`
  );
}

await main();
