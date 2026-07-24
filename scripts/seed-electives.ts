import { config } from "dotenv";
import { subjects } from "ts-db";

config({ path: "./app/ts-backend/.env" });
config();

const ELECTIVES = [
  {
    slug: "japanese-intro",
    name: "Japanese",
    description: "A beginner-friendly language elective for families who want to add Japanese.",
    priceInCents: 1900,
    currencyCode: "USD",
    displayOrder: 1
  },
  {
    slug: "music-foundations",
    name: "Music Foundations",
    description: "Songs, rhythm, listening, and beginner music concepts for young learners.",
    priceInCents: 1400,
    currencyCode: "USD",
    displayOrder: 2
  },
  {
    slug: "art-studio",
    name: "Art Studio",
    description: "A hands-on elective focused on drawing, color, shapes, and visual expression.",
    priceInCents: 1400,
    currencyCode: "USD",
    displayOrder: 3
  }
] as const;

async function main() {
  const { db } = await import("../app/ts-backend/src/db");

  for (const elective of ELECTIVES) {
    await db
      .insert(subjects)
      .values({
        slug: elective.slug,
        name: elective.name,
        description: elective.description,
        type: "elective",
        priceInCents: elective.priceInCents,
        currencyCode: elective.currencyCode,
        displayOrder: elective.displayOrder
      })
      .onConflictDoUpdate({
        target: subjects.slug,
        set: {
          name: elective.name,
          description: elective.description,
          type: "elective",
          priceInCents: elective.priceInCents,
          currencyCode: elective.currencyCode,
          displayOrder: elective.displayOrder,
          active: true
        }
      });
  }

  console.log(`Seeded ${ELECTIVES.length} electives.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
