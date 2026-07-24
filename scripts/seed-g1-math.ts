import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  curriculumNodes,
  lexicon,
  nodeKeywords,
  nodeTranslations,
  skills
} from "ts-db";

config({ path: "./app/ts-backend/.env" });
config();

type SeedCluster = {
  cluster: string;
  slug: string;
  skills: Array<{
    slug: string;
    ixl_id: string;
    week: number;
    order: number;
    objective: string;
    keywords: string[];
  }>;
};

function titleFromObjective(objective: string) {
  return objective.replace(/\.$/, "");
}

async function loadDataset() {
  const datasetPath = resolve(process.cwd(), "../curriculum_g1_math_data.json");
  const raw = await readFile(datasetPath, "utf8");
  return JSON.parse(raw) as SeedCluster[];
}

async function getGradeOneNodeId(
  db: Awaited<ReturnType<typeof import("../app/ts-backend/src/db")>>["db"]
) {
  const [gradeNode] = await db
    .select({
      id: curriculumNodes.id
    })
    .from(curriculumNodes)
    .where(
      and(
        eq(curriculumNodes.type, "grade"),
        eq(curriculumNodes.title, "Grade 1")
      )
    )
    .limit(1);

  if (!gradeNode) {
    throw new Error("Grade 1 node not found. Run the grade-node seed first.");
  }

  return gradeNode.id;
}

async function ensureSubjectNode(input: {
  db: Awaited<ReturnType<typeof import("../app/ts-backend/src/db")>>["db"];
  gradeNodeId: string;
}) {
  const [existing] = await input.db
    .select({
      id: curriculumNodes.id
    })
    .from(curriculumNodes)
    .where(
      and(
        eq(curriculumNodes.parentId, input.gradeNodeId),
        eq(curriculumNodes.type, "subject"),
        eq(curriculumNodes.slug, "math-g1")
      )
    )
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [inserted] = await input.db
    .insert(curriculumNodes)
    .values({
      parentId: input.gradeNodeId,
      type: "subject",
      title: "Math",
      slug: "math-g1",
      order: 0,
      displayOrder: 0
    })
    .returning({
      id: curriculumNodes.id
    });

  await input.db
    .insert(nodeTranslations)
    .values({
      nodeId: inserted.id,
      languageCode: "en-US",
      title: "Math",
      description: "Grade 1 math subject path."
    })
    .onConflictDoUpdate({
      target: [nodeTranslations.nodeId, nodeTranslations.languageCode],
      set: {
        title: "Math",
        description: "Grade 1 math subject path."
      }
    });

  return inserted.id;
}

async function ensureLexiconRows(input: {
  db: Awaited<ReturnType<typeof import("../app/ts-backend/src/db")>>["db"];
  words: string[];
}) {
  const uniqueWords = [...new Set(input.words.map((word) => word.trim()).filter(Boolean))];

  if (uniqueWords.length === 0) {
    return new Map<string, string>();
  }

  for (const word of uniqueWords) {
    await input.db
      .insert(lexicon)
      .values({
        word,
        languageCode: "en-US",
        introducedAtLevel: 1
      })
      .onConflictDoNothing();
  }

  const rows = await input.db
    .select({
      id: lexicon.id,
      word: lexicon.word
    })
    .from(lexicon)
    .where(and(eq(lexicon.languageCode, "en-US"), inArray(lexicon.word, uniqueWords)));

  return new Map(rows.map((row) => [row.word, row.id] as const));
}

async function main() {
  const dataset = await loadDataset();
  const { db, client } = await import("../app/ts-backend/src/db");

  const gradeOneNodeId = await getGradeOneNodeId(db);
  const subjectNodeId = await ensureSubjectNode({
    db,
    gradeNodeId: gradeOneNodeId
  });

  const allKeywords = dataset.flatMap((cluster) =>
    cluster.skills.flatMap((skill) => skill.keywords)
  );
  const lexiconByWord = await ensureLexiconRows({
    db,
    words: allKeywords
  });

  for (const [clusterIndex, cluster] of dataset.entries()) {
    const [clusterNode] = await db
      .insert(curriculumNodes)
      .values({
        parentId: subjectNodeId,
        type: "cluster",
        title: cluster.cluster,
        slug: cluster.slug,
        order: clusterIndex,
        displayOrder: clusterIndex,
        introducedInWeek: Math.min(...cluster.skills.map((skill) => skill.week))
      })
      .onConflictDoUpdate({
        target: curriculumNodes.slug,
        set: {
          parentId: subjectNodeId,
          type: "cluster",
          title: cluster.cluster,
          order: clusterIndex,
          displayOrder: clusterIndex,
          introducedInWeek: Math.min(...cluster.skills.map((skill) => skill.week))
        }
      })
      .returning({
        id: curriculumNodes.id
      });

    await db
      .insert(nodeTranslations)
      .values({
        nodeId: clusterNode.id,
        languageCode: "en-US",
        title: cluster.cluster,
        description: `${cluster.cluster} cluster for Grade 1 math.`
      })
      .onConflictDoUpdate({
        target: [nodeTranslations.nodeId, nodeTranslations.languageCode],
        set: {
          title: cluster.cluster,
          description: `${cluster.cluster} cluster for Grade 1 math.`
        }
      });

    for (const skill of cluster.skills) {
      const [skillNode] = await db
        .insert(curriculumNodes)
        .values({
          parentId: clusterNode.id,
          type: "skill",
          title: titleFromObjective(skill.objective),
          slug: skill.slug,
          order: skill.order,
          displayOrder: skill.order,
          introducedInWeek: skill.week,
          skillObjective: skill.objective,
          technicalKeywords: skill.keywords,
          externalReference: `IXL Grade 1 Math ${skill.ixl_id}`
        })
        .onConflictDoUpdate({
          target: curriculumNodes.slug,
          set: {
            parentId: clusterNode.id,
            type: "skill",
            title: titleFromObjective(skill.objective),
            order: skill.order,
            displayOrder: skill.order,
            introducedInWeek: skill.week,
            skillObjective: skill.objective,
            technicalKeywords: skill.keywords,
            externalReference: `IXL Grade 1 Math ${skill.ixl_id}`
          }
        })
        .returning({
          id: curriculumNodes.id
        });

      await db
        .insert(nodeTranslations)
        .values({
          nodeId: skillNode.id,
          languageCode: "en-US",
          title: titleFromObjective(skill.objective),
          description: skill.objective
        })
        .onConflictDoUpdate({
          target: [nodeTranslations.nodeId, nodeTranslations.languageCode],
          set: {
            title: titleFromObjective(skill.objective),
            description: skill.objective
          }
        });

      await db
        .insert(skills)
        .values({
          nodeId: skillNode.id,
          difficulty: 1,
          masteryThreshold: 0.9,
          learningObjectives: skill.objective,
          pedagogicalTone: "Concrete and encouraging"
        })
        .onConflictDoUpdate({
          target: skills.nodeId,
          set: {
            difficulty: 1,
            masteryThreshold: 0.9,
            learningObjectives: skill.objective,
            pedagogicalTone: "Concrete and encouraging"
          }
        });

      for (const [priority, keyword] of skill.keywords.entries()) {
        const wordId = lexiconByWord.get(keyword);

        if (!wordId) {
          continue;
        }

        await db
          .insert(nodeKeywords)
          .values({
            nodeId: skillNode.id,
            wordId,
            priority
          })
          .onConflictDoUpdate({
            target: [nodeKeywords.nodeId, nodeKeywords.wordId],
            set: {
              priority
            }
          });
      }
    }
  }

  await client.end();
  console.log("Seeded Grade 1 math curriculum.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
