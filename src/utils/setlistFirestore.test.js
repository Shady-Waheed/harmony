import { describe, expect, it } from "vitest";
import {
  SETLIST_SCHEMA_VERSION,
  decodeStoredSetlist,
  encodeSetlistForFirestore,
  normalizeSharedSetlist,
  reorderSetlistHymns,
} from "./setlistFirestore";

describe("shared setlist model", () => {
  it("accepts a valid canonical setlist and preserves order", () => {
    const input = {
      id: "setlist-1",
      name: "Sunday Service",
      hymnIds: ["hymn-a", "hymn-b", "hymn-c"],
      ownerUid: "uid-1",
      createdBy: "uid-1",
      updatedBy: "uid-1",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };

    expect(normalizeSharedSetlist(input)).toMatchObject({
      schemaVersion: SETLIST_SCHEMA_VERSION,
      id: "setlist-1",
      name: "Sunday Service",
      hymnIds: ["hymn-a", "hymn-b", "hymn-c"],
      ownerUid: "uid-1",
      createdBy: "uid-1",
      updatedBy: "uid-1",
    });
  });

  it("deduplicates hymn references while preserving the original order", () => {
    const normalized = normalizeSharedSetlist({
      id: "setlist-1",
      name: "Service",
      hymnIds: ["hymn-a", "hymn-b", "hymn-a", "hymn-c"],
      ownerUid: "uid-1",
      createdBy: "uid-1",
      updatedBy: "uid-1",
    });

    expect(normalized.hymnIds).toEqual(["hymn-a", "hymn-b", "hymn-c"]);
  });

  it("round-trips encode and decode without changing the canonical setlist data", () => {
    const original = normalizeSharedSetlist({
      id: "setlist-7",
      name: "Youth Meeting",
      hymnIds: ["a", "b", "c"],
      ownerUid: "uid-7",
      createdBy: "uid-7",
      updatedBy: "uid-7",
      createdAt: "2025-02-02T00:00:00.000Z",
      updatedAt: "2025-02-02T00:00:00.000Z",
    });

    const encoded = encodeSetlistForFirestore(original);
    const decoded = decodeStoredSetlist(encoded);

    expect(decoded.id).toBe(original.id);
    expect(decoded.name).toBe(original.name);
    expect(decoded.hymnIds).toEqual(original.hymnIds);
    expect(decoded.ownerUid).toBe(original.ownerUid);
    expect(decoded.createdBy).toBe(original.createdBy);
    expect(decoded.updatedBy).toBe(original.updatedBy);
  });

  it("reorders hymns safely by moving the selected item to the target index", () => {
    const reordered = reorderSetlistHymns(["A", "B", "C", "D"], 0, 2);
    expect(reordered).toEqual(["B", "C", "A", "D"]);
  });

  it("rejects future schema versions instead of silently accepting unknown data", () => {
    expect(() =>
      decodeStoredSetlist({
        schemaVersion: 999,
        id: "setlist-9",
        name: "Future",
        hymnIds: ["hymn-x"],
        ownerUid: "uid-9",
        createdBy: "uid-9",
        updatedBy: "uid-9",
      }),
    ).toThrow(/future/i);
  });

  it("treats missing hymn IDs as a graceful empty item list for rendering", () => {
    const setlist = normalizeSharedSetlist({
      id: "setlist-3",
      name: "Missing Hymn",
      hymnIds: ["hymn-a", "", "deleted-hymn"],
      ownerUid: "uid-3",
      createdBy: "uid-3",
      updatedBy: "uid-3",
    });

    expect(setlist.hymnIds).toEqual(["hymn-a", "deleted-hymn"]);
  });
});
