import { describe, expect, test } from "bun:test";
import { planSubjectKey } from "./plan-subject-key";

describe("plan subject keys", () => {
  test("uses the system subject id when one exists", () => {
    expect(planSubjectKey({ subjectId: "subject-id", subjectLabel: "Math" }))
      .toBe("system:subject-id");
  });

  test("keeps non-Latin custom subject labels stable", () => {
    expect(planSubjectKey({ subjectLabel: "日本語" })).toBe("custom:日本語");
    expect(planSubjectKey({ subjectLabel: "  Études sociales  " })).toBe("custom:e-tudes-sociales");
  });

  test("uses the same fallback for an empty custom subject", () => {
    expect(planSubjectKey({ subjectLabel: "" })).toBe("custom:uncategorized");
  });
});
