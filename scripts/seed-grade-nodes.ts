import { config } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { curriculumNodes } from "ts-db";

config({ path: "./app/ts-backend/.env" });
config();

async function ensureNode(input: {
  db: Awaited<ReturnType<typeof import("../app/ts-backend/src/db")>>["db"];
  parentId: string | null;
  type: "program" | "grade";
  title: string;
  slug?: string;
  order: number;
}) {
  const [existing] = await input.db
    .select({
      id: curriculumNodes.id
    })
    .from(curriculumNodes)
    .where(
      input.parentId
        ? and(
            eq(curriculumNodes.parentId, input.parentId),
            eq(curriculumNodes.type, input.type),
            eq(curriculumNodes.title, input.title)
          )
        : and(
            isNull(curriculumNodes.parentId),
            eq(curriculumNodes.type, input.type),
            eq(curriculumNodes.title, input.title)
          )
    )
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [inserted] = await input.db
    .insert(curriculumNodes)
    .values({
      parentId: input.parentId,
      type: input.type,
      title: input.title,
      slug: input.slug,
      order: input.order
    })
    .returning({
      id: curriculumNodes.id
    });

  return inserted.id;
}

async function main() {
  const { db, client } = await import("../app/ts-backend/src/db");
  const treeSchoolId = await ensureNode({
    db,
    parentId: null,
    type: "program",
    title: "Elementary Core K-6",
    slug: "elementary-core-k-6",
    order: 0
  });

  const treeAcademyId = await ensureNode({
    db,
    parentId: null,
    type: "program",
    title: "Tree Academy",
    slug: "tree-academy-6-12",
    order: 1
  });

  await ensureNode({
    db,
    parentId: treeSchoolId,
    type: "grade",
    title: "Kindergarten",
    order: 0
  });

  for (let grade = 1; grade <= 6; grade += 1) {
    await ensureNode({
      db,
      parentId: treeSchoolId,
      type: "grade",
      title: `Grade ${grade}`,
      order: grade
    });
  }

  for (let grade = 7; grade <= 12; grade += 1) {
    await ensureNode({
      db,
      parentId: treeAcademyId,
      type: "grade",
      title: `Grade ${grade}`,
      order: grade
    });
  }

  await client.end();
}

main()
  .then(async () => {
    console.log("Seeded program and grade nodes.");
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
