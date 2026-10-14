import { describe, expect, it } from "vitest";
import {
  isDraftStale,
  isPermissionFailure,
  selectPendingSyncDraft,
  shouldClearPendingDraft,
} from "./pendingSyncRecovery.js";

describe("pending sync recovery", () => {
  it("persists an offline edit as a pending draft and selects the newest eligible retry candidate", () => {
    const drafts = [
      {
        uid: "user-a",
        hymn: { id: "hymn-a", title: "older local edit" },
        updatedAt: 100,
        pendingSync: true,
        conflict: false,
      },
      {
        uid: "user-a",
        hymn: { id: "hymn-a", title: "newer local edit" },
        updatedAt: 200,
        pendingSync: true,
        conflict: false,
      },
    ];

    expect(selectPendingSyncDraft(drafts, "user-a")).toMatchObject({
      updatedAt: 200,
      hymn: { id: "hymn-a", title: "newer local edit" },
    });
  });

  it("ignores conflict entries and stale retries when a newer edit already exists", () => {
    const drafts = [
      {
        uid: "user-a",
        hymn: { id: "hymn-a", title: "queued" },
        updatedAt: 100,
        pendingSync: true,
        conflict: false,
      },
      {
        uid: "user-a",
        hymn: { id: "hymn-a", title: "newer" },
        updatedAt: 200,
        pendingSync: true,
        conflict: true,
      },
      {
        uid: "user-a",
        hymn: { id: "hymn-a", title: "newest" },
        updatedAt: 300,
        pendingSync: true,
        conflict: false,
      },
    ];

    expect(selectPendingSyncDraft(drafts, "user-a")).toMatchObject({
      updatedAt: 300,
    });
    expect(
      isDraftStale(
        drafts[0],
        { id: "hymn-a", title: "newer" },
      ),
    ).toBe(true);
  });

  it("does not clear a draft after a failed save or permission failure", () => {
    expect(
      shouldClearPendingDraft({
        saveSucceeded: false,
        error: { code: "permission-denied" },
      }),
    ).toBe(false);
    expect(
      shouldClearPendingDraft({
        saveSucceeded: false,
        error: { code: "unavailable" },
      }),
    ).toBe(false);
  });

  it("only clears after a confirmed successful save and keeps the stable hymn ID", () => {
    expect(
      shouldClearPendingDraft({
        saveSucceeded: true,
        hymnId: "hymn-a",
      }),
    ).toBe(true);
    expect(
      shouldClearPendingDraft({
        saveSucceeded: false,
        hymnId: "hymn-a",
      }),
    ).toBe(false);
  });

  it("does not retry another account's pending draft after a UID switch", () => {
    const drafts = [
      {
        uid: "user-a",
        hymn: { id: "hymn-a", title: "user-A draft" },
        updatedAt: 111,
        pendingSync: true,
        conflict: false,
      },
      {
        uid: "user-b",
        hymn: { id: "hymn-b", title: "user-B draft" },
        updatedAt: 222,
        pendingSync: true,
        conflict: false,
      },
    ];

    expect(selectPendingSyncDraft(drafts, "user-a")).toMatchObject({
      hymn: { id: "hymn-a" },
    });
    expect(selectPendingSyncDraft(drafts, "user-b")).toMatchObject({
      hymn: { id: "hymn-b" },
    });
  });

  it("treats permission-denied responses as non-retryable failures", () => {
    expect(isPermissionFailure({ code: "permission-denied" })).toBe(true);
    expect(isPermissionFailure({ message: "PERMISSION_DENIED" })).toBe(true);
    expect(isPermissionFailure({ code: "unavailable" })).toBe(false);
  });
});
