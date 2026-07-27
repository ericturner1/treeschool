import { describe, expect, test } from "bun:test";
import { mapEditionLearningUnits } from "./native-workbooks";

describe("native workbook edition carryovers", () => {
  test("prefers stable unit identifiers across editions", () => {
    const result = mapEditionLearningUnits({
      sourceUnits: [{ id: "unit-1", title: "Old lesson title" }],
      targetUnits: [{ id: "unit-1", title: "Improved lesson title" }],
      protectedSourceUnitIds: ["unit-1"]
    });

    expect(result.unmatched).toEqual([]);
    expect(result.mappings.get("unit-1")).toEqual({
      targetSourceUnitId: "unit-1",
      matchMethod: "exact_id"
    });
  });

  test("uses a unique normalized title when identifiers changed", () => {
    const result = mapEditionLearningUnits({
      sourceUnits: [{ id: "old-unit", title: "Plants & Their Needs" }],
      targetUnits: [{ id: "new-unit", title: "Plants and their needs!" }],
      protectedSourceUnitIds: ["old-unit"]
    });

    expect(result.unmatched).toEqual([]);
    expect(result.mappings.get("old-unit")).toEqual({
      targetSourceUnitId: "new-unit",
      matchMethod: "exact_title"
    });
  });

  test("rejects ambiguous title matches rather than guessing", () => {
    const result = mapEditionLearningUnits({
      sourceUnits: [{ id: "old-unit", title: "Review" }],
      targetUnits: [
        { id: "new-unit-1", title: "Review" },
        { id: "new-unit-2", title: "Review" }
      ],
      protectedSourceUnitIds: ["old-unit"]
    });

    expect(result.mappings.size).toBe(0);
    expect(result.unmatched).toEqual(["Review"]);
  });
});
