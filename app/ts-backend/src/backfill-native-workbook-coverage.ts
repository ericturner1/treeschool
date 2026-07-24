import { client } from "./db";
import { backfillNativeWorkbookCoverageProfiles } from "./services/native-workbooks";

const force = process.argv.includes("--force");
const limitArgument = process.argv.find((value) => value.startsWith("--limit="));
const limit = limitArgument ? Number(limitArgument.split("=")[1]) : undefined;

try {
  const result = await backfillNativeWorkbookCoverageProfiles({ force, limit });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed.length) process.exitCode = 1;
} finally {
  await client.end();
}
