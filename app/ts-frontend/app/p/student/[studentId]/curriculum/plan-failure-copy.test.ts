import { describe, expect, test } from "bun:test";
import {
  QUALITY_CONTROL_FAILURE_LABEL,
  QUALITY_CONTROL_RETRY_HELP,
  qualityControlFailureDetail
} from "./plan-failure-copy";

describe("lesson-plan quality failure copy", () => {
  test("asks for an explicit retry instead of promising automatic recovery", () => {
    const copy = [
      QUALITY_CONTROL_FAILURE_LABEL,
      qualityControlFailureDetail(42),
      QUALITY_CONTROL_RETRY_HELP
    ].join(" ");

    expect(copy).toContain("Retry");
    expect(copy.toLowerCase()).not.toContain("automatically");
    expect(copy).toContain("42 generated weeks");
  });
});
