import { describe, expect, test } from "bun:test";
import { moveItemAtInsertionPoint } from "./editor-drag";

describe("editor drag insertion", () => {
  test("moves an item earlier in one collection", () => {
    const items = ["a", "b", "c", "d"];
    expect(moveItemAtInsertionPoint(items, 2, items, 0)).toBe(0);
    expect(items).toEqual(["c", "a", "b", "d"]);
  });

  test("adjusts a later insertion point after removing the source", () => {
    const items = ["a", "b", "c", "d"];
    expect(moveItemAtInsertionPoint(items, 0, items, 3)).toBe(2);
    expect(items).toEqual(["b", "c", "a", "d"]);
  });

  test("moves an item between collections", () => {
    const source = ["a", "b"];
    const target = ["c", "d"];
    expect(moveItemAtInsertionPoint(source, 1, target, 1)).toBe(1);
    expect(source).toEqual(["a"]);
    expect(target).toEqual(["c", "b", "d"]);
  });
});
