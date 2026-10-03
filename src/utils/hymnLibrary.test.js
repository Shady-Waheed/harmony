import { describe, expect, it } from "vitest";
import {
  FAVORITES_STORAGE_KEY,
  RECENT_HYMNS_LIMIT,
  RECENT_HYMNS_STORAGE_KEY,
  isFavorite,
  readFavoriteIds,
  readRecentHymnIds,
  recordRecentHymn,
  resolveHymnsByIds,
  toggleFavorite,
  writeFavoriteIds,
  writeRecentHymnIds,
} from "./hymnLibrary.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    readRaw: (key) => values.get(key) ?? null,
  };
}

const canonicalHymn = {
  id: "hymn-a",
  title: "يا رب النعمة",
  key: "G",
  sections: [
    {
      id: "section-1",
      lines: [
        {
          id: "line-1",
          lyrics: "يا سيدي أنت",
          wordChords: ["G", "C"],
          wordChordGroups: [["G", "D"], ["C"]],
          wordLetterChords: [[["G"], ["D"]], [["C"]]],
          gapChords: [["Am"]],
          beforeWordChords: [["C/E"]],
          afterWordChords: [["G/B"]],
          wordInversions: [["first"], [""]],
        },
      ],
    },
  ],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

describe("local hymn favorites", () => {
  it("starts empty and safely handles invalid local storage data", () => {
    const storage = createStorage({ [FAVORITES_STORAGE_KEY]: "not json" });
    expect(readFavoriteIds(storage)).toEqual([]);
  });

  it("adds, removes, toggles, and checks favorites without duplicates", () => {
    const storage = createStorage();
    const added = toggleFavorite("hymn-a", [], storage);
    expect(added).toEqual(["hymn-a"]);
    expect(isFavorite("hymn-a", readFavoriteIds(storage))).toBe(true);

    expect(toggleFavorite("hymn-a", added, storage)).toEqual([]);
    expect(toggleFavorite("hymn-a", ["hymn-a", "hymn-a"], storage)).toEqual([]);
  });

  it("normalizes invalid and duplicate IDs and survives a reload read", () => {
    const storage = createStorage();
    writeFavoriteIds([" hymn-a ", "", "hymn-a", null, 4], storage);
    expect(readFavoriteIds(storage)).toEqual(["hymn-a"]);
    expect(readFavoriteIds(storage)).toEqual(["hymn-a"]);
  });

  it("does not interpret or overwrite a future storage version", () => {
    const future = JSON.stringify({ version: 2, hymnIds: ["future-id"] });
    const storage = createStorage({ [FAVORITES_STORAGE_KEY]: future });
    expect(readFavoriteIds(storage)).toEqual([]);
    writeFavoriteIds(["hymn-a"], storage);
    expect(storage.readRaw(FAVORITES_STORAGE_KEY)).toBe(future);
  });

  it("keeps favorite metadata separate from the canonical hymn", () => {
    const original = clone(canonicalHymn);
    const storage = createStorage();
    toggleFavorite(canonicalHymn.id, [], storage);
    toggleFavorite(canonicalHymn.id, [canonicalHymn.id], storage);
    expect(canonicalHymn).toEqual(original);
    expect(JSON.parse(storage.readRaw(FAVORITES_STORAGE_KEY))).toEqual({
      version: 1,
      hymnIds: [],
    });
  });

  it("resolves only IDs present in the accessible hymn collection", () => {
    const publicHymn = { id: "public", title: "Public" };
    const privateHymn = { id: "private", title: "Private" };
    expect(
      resolveHymnsByIds(["public", "private", "deleted"], [publicHymn]),
    ).toEqual([publicHymn]);
    expect(privateHymn.id).toBe("private");
  });
});

describe("local recently used hymns", () => {
  it("starts empty, handles malformed storage, and ignores invalid IDs", () => {
    const storage = createStorage({ [RECENT_HYMNS_STORAGE_KEY]: "null{" });
    expect(readRecentHymnIds(storage)).toEqual([]);
    expect(recordRecentHymn("", storage)).toEqual([]);
  });

  it("continues with session data when local storage throws", () => {
    const unavailableStorage = {
      getItem() {
        throw new Error("storage unavailable");
      },
      setItem() {
        throw new Error("storage unavailable");
      },
    };
    expect(recordRecentHymn("hymn-a", unavailableStorage)).toEqual(["hymn-a"]);
  });

  it("records newest first and moves reopened hymns to the front", () => {
    const storage = createStorage();
    recordRecentHymn("hymn-a", storage);
    recordRecentHymn("hymn-b", storage);
    expect(recordRecentHymn("hymn-a", storage)).toEqual(["hymn-a", "hymn-b"]);
    expect(readRecentHymnIds(storage)).toEqual(["hymn-a", "hymn-b"]);
  });

  it("deduplicates IDs and bounds recent history to twenty hymns", () => {
    const storage = createStorage();
    const ids = Array.from(
      { length: RECENT_HYMNS_LIMIT + 5 },
      (_, index) => `hymn-${index}`,
    );
    writeRecentHymnIds(ids, storage);
    expect(readRecentHymnIds(storage)).toHaveLength(RECENT_HYMNS_LIMIT);
    expect(readRecentHymnIds(storage)).toEqual(
      ids.slice(0, RECENT_HYMNS_LIMIT),
    );
    expect(recordRecentHymn("hymn-10", storage)).toHaveLength(
      RECENT_HYMNS_LIMIT,
    );
    expect(readRecentHymnIds(storage)[0]).toBe("hymn-10");
    expect(new Set(readRecentHymnIds(storage)).size).toBe(RECENT_HYMNS_LIMIT);
  });

  it("does not interpret or overwrite a future storage version", () => {
    const future = JSON.stringify({ version: 9, hymnIds: ["future-id"] });
    const storage = createStorage({ [RECENT_HYMNS_STORAGE_KEY]: future });
    expect(readRecentHymnIds(storage)).toEqual([]);
    recordRecentHymn("hymn-a", storage);
    expect(storage.readRaw(RECENT_HYMNS_STORAGE_KEY)).toBe(future);
  });

  it("stores only IDs and leaves canonical hymn data unchanged when reopened", () => {
    const original = clone(canonicalHymn);
    const storage = createStorage();
    recordRecentHymn(canonicalHymn.id, storage);
    recordRecentHymn(canonicalHymn.id, storage);
    expect(canonicalHymn).toEqual(original);
    expect(JSON.parse(storage.readRaw(RECENT_HYMNS_STORAGE_KEY))).toEqual({
      version: 1,
      hymnIds: ["hymn-a"],
    });
  });
});
