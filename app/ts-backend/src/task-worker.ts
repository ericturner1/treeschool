import { runNextLessonGenerationJob } from "./services/lessons";
import { runNextPaperDocumentJob, runNextWeeklyPlanJob } from "./services/paper-plans";
import { runNextNativeWorkbookJob } from "./services/native-workbooks";
import { client, env } from "./db";

const workerId = process.env.TASK_WORKER_ID ?? `ts-tasks-${crypto.randomUUID().slice(0, 8)}`;
const legacyLessonWorkerEnabled = process.env.ENABLE_LEGACY_LESSON_WORKER === "true";

async function main() {
  const startedAt = Date.now();
  let processedJobs = 0;
  console.log(`ts-tasks drain worker ${workerId} starting`);

  while (
    processedJobs < env.PROCESSOR_MAX_JOBS &&
    Date.now() - startedAt < env.PROCESSOR_MAX_RUNTIME_SECONDS * 1000
  ) {
    try {
      const nativeWorkbookResult = await runNextNativeWorkbookJob(workerId);

      if (nativeWorkbookResult) {
        console.log(
          `[${workerId}] processed native workbook job ${nativeWorkbookResult.jobId} for version ${
            nativeWorkbookResult.versionId
          }: ${nativeWorkbookResult.outcome}${
            "error" in nativeWorkbookResult && nativeWorkbookResult.error
              ? ` (${nativeWorkbookResult.error})`
              : ""
          }`
        );
        processedJobs += 1;
        continue;
      }

      const documentResult = await runNextPaperDocumentJob(workerId);

      if (documentResult) {
        console.log(
          `[${workerId}] processed paper document job ${documentResult.jobId} for document ${
            documentResult.documentId
          }: ${documentResult.outcome}${
            "error" in documentResult && documentResult.error ? ` (${documentResult.error})` : ""
          }`
        );
        processedJobs += 1;
        continue;
      }

      const weeklyPlanResult = await runNextWeeklyPlanJob(workerId);

      if (weeklyPlanResult) {
        console.log(
          `[${workerId}] processed weekly plan job ${weeklyPlanResult.jobId} for week ${
            weeklyPlanResult.weekNumber
          }: ${weeklyPlanResult.outcome}${
            "error" in weeklyPlanResult && weeklyPlanResult.error ? ` (${weeklyPlanResult.error})` : ""
          }`
        );
        processedJobs += 1;
        continue;
      }

      if (!legacyLessonWorkerEnabled) {
        break;
      }

      const result = await runNextLessonGenerationJob(workerId);

      if (!result) {
        break;
      }

      console.log(
        `[${workerId}] processed lesson job ${result.jobId} for lesson ${result.lessonId}: ${result.outcome}${
          "error" in result && result.error ? ` (${result.error})` : ""
        }`
      );
      processedJobs += 1;
    } catch (error) {
      console.error(`[${workerId}] task loop error:`, error);
      process.exitCode = 1;
      break;
    }
  }

  console.log(`ts-tasks drain worker ${workerId} finished after ${processedJobs} job(s)`);
  await client.end({ timeout: 5 });
}

void main().catch(async (error) => {
  console.error(`[${workerId}] task worker fatal error:`, error);
  process.exitCode = 1;
  await client.end({ timeout: 5 }).catch(() => undefined);
});
