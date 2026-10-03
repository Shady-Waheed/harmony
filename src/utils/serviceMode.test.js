import { describe, expect, it } from "vitest";
import {
  findNextServiceIndex,
  moveServiceIndex,
  normalizeServiceSetlist,
  resolveServiceIndex,
} from "./serviceMode";

describe("service mode navigation", () => {
  it("starts at a valid index and clamps invalid indexes safely", () => {
    expect(resolveServiceIndex(["A", "B", "C"], 5)).toBe(2);
    expect(resolveServiceIndex(["A", "B", "C"], -3)).toBe(0);
    expect(resolveServiceIndex(["A", "B", "C"], NaN)).toBe(0);
  });

  it("moves forward and backward within the current setlist without wrapping", () => {
    expect(moveServiceIndex(["A", "B", "C"], 0, 1)).toBe(1);
    expect(moveServiceIndex(["A", "B", "C"], 2, 1)).toBe(2);
    expect(moveServiceIndex(["A", "B", "C"], 1, -1)).toBe(0);
    expect(moveServiceIndex(["A", "B", "C"], 0, -1)).toBe(0);
  });

  it("jumps directly to an item when a valid selection is provided", () => {
    expect(resolveServiceIndex(["A", "B", "C", "D"], 2)).toBe(2);
  });

  it("skips inaccessible items when walking next/previous through a setlist", () => {
    const canRead = (id) => id !== "B";
    expect(findNextServiceIndex(["A", "B", "C"], 0, 1, canRead)).toBe(2);
    expect(findNextServiceIndex(["A", "B", "C"], 2, -1, canRead)).toBe(0);
  });

  it("normalizes a valid service setlist and filters duplicate hymn ids", () => {
    const normalized = normalizeServiceSetlist({
      setlistId: "shared-1",
      title: " Sunday ",
      source: "shared",
      hymnIds: ["A", "B", "B", "C"],
      currentIndex: 2,
    });

    expect(normalized).toMatchObject({
      setlistId: "shared-1",
      title: "Sunday",
      source: "shared",
      hymnIds: ["A", "B", "C"],
      currentIndex: 2,
    });
  });

  it("keeps empty setlists safe and non-startable", () => {
    expect(resolveServiceIndex([], 0)).toBe(0);
    expect(moveServiceIndex([], 0, 1)).toBe(0);
  });
});
