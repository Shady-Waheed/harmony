import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  getAllDrafts,
  getDraft,
  markDraftConflict,
  markDraftPendingSync,
  setDraftScope,
  writeDraft,
} from "./hymnDrafts.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

describe("UID-scoped local hymn drafts", () => {
  afterEach(() => {
    setDraftScope("guest");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("survives a scope switch and reload for the same UID", () => {
    vi.stubGlobal("localStorage", createStorage());
    setDraftScope("user-a");
    writeDraft("hymn-1", { id: "hymn-1", title: "Offline edit" });

    setDraftScope("user-b");
    expect(getDraft("hymn-1")).toBeNull();
    setDraftScope("user-a");
    expect(getDraft("hymn-1").hymn.title).toBe("Offline edit");
    expect(getAllDrafts()).toHaveLength(1);
  });

  it("keeps a newer local edit when an older queued version is acknowledged", () => {
    vi.stubGlobal("localStorage", createStorage());
    setDraftScope("user-a");
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200);

    writeDraft("hymn-1", { id: "hymn-1", title: "Queued version" });
    const queued = markDraftPendingSync("hymn-1");
    writeDraft("hymn-1", { id: "hymn-1", title: "Newer edit" });
    clearDraft("hymn-1", queued.updatedAt);

    expect(getDraft("hymn-1")).toMatchObject({
      hymn: { title: "Newer edit" },
      pendingSync: true,
    });
  });

  it("does not clear another user's draft when a shared hymn ID matches", () => {
    vi.stubGlobal("localStorage", createStorage());
    setDraftScope("user-a");
    writeDraft("same-id", { id: "same-id", title: "A's draft" });
    setDraftScope("user-b");
    writeDraft("same-id", { id: "same-id", title: "B's draft" });

    clearDraft("same-id");
    expect(getDraft("same-id")).toBeNull();
    setDraftScope("user-a");
    expect(getDraft("same-id").hymn.title).toBe("A's draft");
  });

  it("preserves a conflict for unchanged content and clears it after a new edit", () => {
    vi.stubGlobal("localStorage", createStorage());
    setDraftScope("user-a");
    const baseHymn = { id: "hymn-1", title: "Server version" };
    const queuedHymn = { id: "hymn-1", title: "Local version" };
    writeDraft("hymn-1", queuedHymn, {
      baseHymn,
      pendingSync: true,
    });
    markDraftConflict("hymn-1");
    writeDraft("hymn-1", queuedHymn, { baseHymn });

    expect(getDraft("hymn-1")).toMatchObject({
      baseHymn,
      conflict: true,
      pendingSync: true,
    });

    writeDraft("hymn-1", { ...queuedHymn, title: "Reviewed version" });
    expect(getDraft("hymn-1")).toMatchObject({
      hymn: { title: "Reviewed version" },
      baseHymn,
      conflict: false,
      pendingSync: true,
    });
  });
});