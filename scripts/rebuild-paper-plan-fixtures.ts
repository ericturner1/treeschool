import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  buildLearningUnitMetadata,
  normalizeAnalysis
} from "../app/ts-backend/src/services/paper-plans";

const manifestDirectory = resolve(process.argv[2] || "");
if (!process.argv[2]) {
  throw new Error(
    "Usage: bun --env-file=app/ts-backend/.env scripts/rebuild-paper-plan-fixtures.ts <manifest-directory>"
  );
}

const manifestFilenames = (await readdir(manifestDirectory))
  .filter((filename) => filename.endsWith(".manifest.json"))
  .sort();

for (const manifestFilename of manifestFilenames) {
  const path = join(manifestDirectory, manifestFilename);
  const analysis = JSON.parse(await readFile(path, "utf8"));
  const pageCount = Array.isArray(analysis.pageLedger) ? analysis.pageLedger.length : 0;
  if (pageCount < 1) throw new Error(`${manifestFilename} has no physical-page ledger.`);
  const label = basename(manifestFilename, ".manifest.json");
  const normalized = normalizeAnalysis(
    analysis,
    label,
    String(analysis.audience || "student"),
    pageCount
  );
  const unitMetadata = buildLearningUnitMetadata({
    label,
    role: normalized.audience,
    pageCount,
    pages: Array.from({ length: pageCount }, (_, pageIndex) => ({
      pageIndex,
      label: analysis.pageLedger?.[pageIndex]?.contentPageLabel ?? null,
      text: ""
    })),
    pageNumberMapping: normalized.pageNumberMapping ?? null,
    sections: normalized.sections
  });
  await writeFile(path, `${JSON.stringify({
    ...analysis,
    ...normalized,
    structureVersion: 3,
    classificationVersion: 3,
    ...unitMetadata
  }, null, 2)}\n`, "utf8");
}

const indexPath = join(manifestDirectory, "index.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));
for (const file of index.files ?? []) {
  const manifest = JSON.parse(
    await readFile(join(manifestDirectory, String(file.manifestFilename)), "utf8")
  );
  file.learningUnitCount = manifest.learningUnits?.length ?? 0;
}
index.rebuiltAt = new Date().toISOString();
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
process.stdout.write(`Rebuilt ${manifestFilenames.length} manifests without additional model calls.\n`);
