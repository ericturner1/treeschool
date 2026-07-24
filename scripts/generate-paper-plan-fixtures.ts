import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { analyzePdf } from "../app/ts-backend/src/services/paper-plans";

const archivePath = resolve(process.argv[2] || "");
const outputDirectory = resolve(
  process.argv[3] || join(dirname(archivePath), "generated-manifests")
);

if (!process.argv[2]) {
  throw new Error(
    "Usage: bun --env-file=app/ts-backend/.env scripts/generate-paper-plan-fixtures.ts <archive.zip> [output-directory]"
  );
}

const files = unzipSync(new Uint8Array(await readFile(archivePath)));
const pdfs = Object.entries(files)
  .filter(([name]) => name.toLowerCase().endsWith(".pdf") && !name.includes("__MACOSX/") && !basename(name).startsWith("._"))
  .sort(([left], [right]) => left.localeCompare(right));

if (pdfs.length === 0) throw new Error("The archive does not contain any PDF fixtures.");
await mkdir(outputDirectory, { recursive: true });

const index: Array<{
  sourceFilename: string;
  manifestFilename: string;
  pageCount: number;
  learningUnitCount: number;
}> = [];

for (const [name, bytes] of pdfs) {
  const pageCount = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
  const label = basename(name, ".pdf");
  process.stdout.write(`Indexing ${basename(name)} (${pageCount} pages)...\n`);
  const analysis = await analyzePdf({
    bytes,
    label,
    role: "student",
    pageCount,
    usageContext: {}
  });
  const manifestFilename = `${label}.manifest.json`;
  await writeFile(
    join(outputDirectory, manifestFilename),
    `${JSON.stringify(analysis, null, 2)}\n`,
    "utf8"
  );
  index.push({
    sourceFilename: basename(name),
    manifestFilename,
    pageCount,
    learningUnitCount: analysis.learningUnits.length
  });
}

await writeFile(
  join(outputDirectory, "index.json"),
  `${JSON.stringify({ sourceArchive: basename(archivePath), generatedAt: new Date().toISOString(), files: index }, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`Saved ${index.length} metadata manifests to ${outputDirectory}\n`);
