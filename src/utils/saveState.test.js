import { describe, expect, it } from "vitest";
import {
  SAVE_STATUS,
  resolveSaveState,
  shouldBlockBeforeUnload,
  shouldPromptBeforeDiscard,
} from "./saveState.js";

describe("save-state model", () => {
  it("starts clean when the server-loaded hymn has no local drift", () => {
    expect(
      resolveSaveState({
        isDirty: false,
        hasLocalDraft: false,
        hasServerState: true,
      }).status,
    ).toBe(SAVE_STATUS.SAVED);
  });

  it("marks a user edit as dirty", () => {
    expect(
      resolveSaveState({
        isDirty: true,
        isOffline: false,
        hasLocalDraft: true,
      }).status,
    ).toBe(SAVE_STATUS.DIRTY);
  });

  it("returns to saved after a successful save", () => {
    expect(
      resolveSaveState({
        isDirty: false,
        isSaving: false,
        saveFailed: false,
        hasLocalDraft: false,
      }).status,
    ).toBe(SAVE_STATUS.SAVED);
  });

  it("keeps the hymn dirty after a failed save", () => {
    expect(
      resolveSaveState({
        isDirty: true,
        isSaving: false,
        saveFailed: true,
        hasLocalDraft: true,
      }).status,
    ).toBe(SAVE_STATUS.ERROR);
  });

  it("retains the local draft after a save failure", () => {
    const result = resolveSaveState({
      isDirty: true,
      isSaving: false,
      saveFailed: true,
      hasLocalDraft: true,
    });

    expect(result.retryable).toBe(true);
    expect(result.status).toBe(SAVE_STATUS.ERROR);
  });

  it("tracks offline edits as recoverable local changes", () => {
    expect(
      resolveSaveState({
        isDirty: true,
        isOffline: true,
        hasLocalDraft: true,
      }).status,
    ).toBe(SAVE_STATUS.OFFLINE);
  });

  it("requires explicit confirmation before discarding an unsaved draft", () => {
    expect(shouldPromptBeforeDiscard({ isDirty: true })).toBe(true);
    expect(
      shouldPromptBeforeDiscard({ isDirty: false, saveFailed: true }),
    ).toBe(true);
    expect(
      shouldPromptBeforeDiscard({ isDirty: false, saveFailed: false }),
    ).toBe(false);
  });

  it("blocks beforeunload only while the hymn is still unsafe to leave", () => {
    expect(shouldBlockBeforeUnload({ status: SAVE_STATUS.DIRTY })).toBe(true);
    expect(shouldBlockBeforeUnload({ status: SAVE_STATUS.OFFLINE })).toBe(true);
    expect(shouldBlockBeforeUnload({ status: SAVE_STATUS.ERROR })).toBe(true);
    expect(shouldBlockBeforeUnload({ status: SAVE_STATUS.SAVED })).toBe(false);
  });

  it("flags pending local sync when the draft is waiting for the server", () => {
    expect(
      resolveSaveState({
        isDirty: false,
        hasLocalDraft: true,
        pendingSync: true,
      }).status,
    ).toBe(SAVE_STATUS.PENDING_SYNC);
  });

  it("treats a clean server version as saved even without a fresh draft", () => {
    expect(
      resolveSaveState({
        isDirty: false,
        hasLocalDraft: false,
        hasServerState: false,
      }).status,
    ).toBe(SAVE_STATUS.SAVED);
  });

  it("keeps save failure retryable", () => {
    const result = resolveSaveState({
      saveFailed: true,
      isDirty: true,
    });

    expect(result.retryable).toBe(true);
    expect(result.label).toContain("تعذر الحفظ");
  });

  it("keeps clean state when no draft or unsaved change exists", () => {
    expect(
      resolveSaveState({
        isDirty: false,
        hasLocalDraft: false,
        pendingSync: false,
        isOffline: false,
      }).status,
    ).toBe(SAVE_STATUS.SAVED);
  });
});
