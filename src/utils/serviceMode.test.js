import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findNextServiceIndex,
  loadServiceModeFromStorage,
  moveServiceIndex,
  normalizeServiceSetlist,
  resolveServiceIndex,
  saveServiceModeToStorage,
} from "./serviceMode";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("restores a UID-scoped service session and switches using cached hymn IDs", () => {
    const values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    });
    saveServiceModeToStorage(
      { title: "Saved offline", hymnIds: ["cached-a", "cached-b"] },
      "user-a",
    );

    const restored = loadServiceModeFromStorage("user-a");
    expect(restored.hymnIds).toEqual(["cached-a", "cached-b"]);
    expect(findNextServiceIndex(restored.hymnIds, 0, 1)).toBe(1);
    expect(loadServiceModeFromStorage("user-b")).toBeNull();
  });
});
