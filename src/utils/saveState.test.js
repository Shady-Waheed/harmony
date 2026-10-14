import { describe, expect, it, vi } from "vitest";
import {
  SAVE_STATUS,
  resolveSaveAttempt,
  resolveSaveErrorNotification,
  resolveSaveSuccessNotification,
  resolveSaveState,
  showSaveSuccessNotification,
  shouldBlockBeforeUnload,
  shouldPromptBeforeDiscard,
} from "./saveState.js";

describe("save notifications", () => {
  it("does not start a save when the hymn has no changes", () => {
    const writeFirestore = vi.fn();
    const attempt = resolveSaveAttempt({ isDirty: false });

    if (attempt === "save") writeFirestore();

    expect(attempt).toBe("unchanged");
    expect(writeFirestore).not.toHaveBeenCalled();
  });

  it("prevents a duplicate save while another save is in progress", () => {
    expect(resolveSaveAttempt({ isDirty: true, isSaving: true })).toBe(
      "in-progress",
    );
  });

  it("prevents a repeated write after Firestore succeeded but local work failed", () => {
    expect(
      resolveSaveAttempt({
        isDirty: true,
        firestoreWriteCompleted: true,
      }),
    ).toBe("already-written");
  });

  it("allows saving a dirty hymn", () => {
    expect(resolveSaveAttempt({ isDirty: true, isSaving: false })).toBe("save");
  });

  it("announces a confirmed server save as success", () => {
    expect(resolveSaveSuccessNotification()).toEqual({
      type: "success",
      message: "تم حفظ التغييرات بنجاح.",
    });
  });

  it("shows exactly one success notification for a confirmed save", () => {
    const showNotice = vi.fn();

    showSaveSuccessNotification(showNotice);

    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenCalledWith(
      "تم حفظ التغييرات بنجاح.",
      "success",
    );
  });

  it("does not label an offline local draft as a server save", () => {
    const notification = resolveSaveSuccessNotification({ isOffline: true });

    expect(notification.type).toBe("info");
    expect(notification.message).toContain("على الجهاز فقط");
  });

  it("explains permission errors in Arabic", () => {
    expect(
      resolveSaveErrorNotification({ code: "permission-denied" }).message,
    ).toContain("الحساب لا يملك صلاحية الحفظ");
  });

  it("asks unauthenticated users to sign in again", () => {
    expect(
      resolveSaveErrorNotification({ code: "unauthenticated" }).message,
    ).toContain("سجّل الدخول مرة أخرى");
  });

  it("explains connectivity errors and notes a retained local draft", () => {
    const notification = resolveSaveErrorNotification(
      { code: "unavailable" },
      { localDraftSaved: true },
    );

    expect(notification.message).toContain("تحقق من الإنترنت");
    expect(notification.message).toContain("مسودة محلية");
  });

  it("explains timeouts and exhausted service limits", () => {
    expect(
      resolveSaveErrorNotification({ code: "deadline-exceeded" }).message,
    ).toContain("انتهت مهلة الاتصال");
    expect(
      resolveSaveErrorNotification({ code: "resource-exhausted" }).message,
    ).toContain("تجاوز حد الاستخدام");
  });

  it("reports precondition errors without guessing their cause", () => {
    const notification = resolveSaveErrorNotification({
      code: "failed-precondition",
      message: "internal details",
    });

    expect(notification.message).toContain("failed-precondition");
    expect(notification.message).not.toContain("internal details");
  });

  it("includes a technical code for unknown errors without exposing internals", () => {
    const notification = resolveSaveErrorNotification({
      code: "internal",
      message: "sensitive server detail",
    });

    expect(notification.message).toContain("(internal)");
    expect(notification.message).not.toContain("sensitive server detail");
  });

  it("does not classify a local post-write failure as a Firestore write failure", () => {
    const notification = resolveSaveErrorNotification(
      { code: "internal" },
      { firestoreWriteCompleted: true },
    );

    expect(notification.type).toBe("info");
    expect(notification.message).toContain("تم حفظ الترنيمة على السيرفر");
    expect(notification.message).toContain("لن نكرر الكتابة");
  });
});

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
