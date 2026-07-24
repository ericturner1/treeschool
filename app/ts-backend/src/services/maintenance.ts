import { requeueStaleLessonGenerations } from "./lessons";
import {
  cleanupExpiredPlanRecovery,
  finalizeReadyPlanVersions,
  recoverOutdatedMetadataQualityFailures
} from "./paper-plans";

export async function runMaintenanceJob() {
  const staleLessons = await requeueStaleLessonGenerations();
  const metadataQualityRecovery = await recoverOutdatedMetadataQualityFailures();
  const planActivation = await finalizeReadyPlanVersions();
  const planRecovery = await cleanupExpiredPlanRecovery();

  return {
    ok: true,
    ranAt: new Date().toISOString(),
    staleLessons,
    metadataQualityRecovery,
    planActivation,
    planRecovery
  };
}
