import { describe, expect, test } from "bun:test";
import { toAdminBackupExecution } from "./admin-backups";

describe("admin backup execution summaries", () => {
  test("reports a verified archive as succeeded", () => {
    expect(toAdminBackupExecution({
      name: "projects/treeschool/locations/asia-northeast3/jobs/backup/executions/backup-abc12",
      createTime: "2026-08-29T01:00:00.000Z",
      startTime: "2026-08-29T01:00:05.000Z",
      completionTime: "2026-08-29T01:01:10.000Z",
      succeededCount: 1,
    })).toEqual({
      id: "backup-abc12",
      status: "succeeded",
      createdAt: "2026-08-29T01:00:00.000Z",
      startedAt: "2026-08-29T01:00:05.000Z",
      completedAt: "2026-08-29T01:01:10.000Z",
      durationSeconds: 65,
      retryCount: 0,
    });
  });

  test("reports incomplete executions as running", () => {
    expect(toAdminBackupExecution({
      name: "projects/treeschool/locations/asia-northeast3/jobs/backup/executions/backup-running",
      createTime: "2026-08-29T01:00:00.000Z",
      startTime: "2026-08-29T01:00:05.000Z",
    }).status).toBe("running");
  });

  test("uses the completed condition when counters are absent", () => {
    expect(toAdminBackupExecution({
      name: "backup-failed",
      completionTime: "2026-08-29T01:01:10.000Z",
      retriedCount: 1,
      conditions: [{ type: "Completed", state: "CONDITION_FAILED" }],
    }).status).toBe("failed");
  });
});
