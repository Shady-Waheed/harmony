import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSetlist, saveSetlist } from "./setlistStorage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UID-scoped local setlists", () => {
  it("restores saved fallback setlists only for the matching account", () => {
    const values = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, String(value)),
    });
    const list = [{ id: "private-hymn", title: "Offline hymn" }];
    saveSetlist(list, "user-a");

    expect(loadSetlist("user-a")).toEqual(list);
    expect(loadSetlist("user-b")).toEqual([]);
  });
});