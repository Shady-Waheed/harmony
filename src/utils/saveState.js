export const SAVE_STATUS = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  DIRTY: "dirty",
  SAVING: "saving",
  SAVED: "saved",
  OFFLINE: "offline",
  PENDING_SYNC: "pending-sync",
  ERROR: "error",
});

export function getSaveStateLabel(status) {
  switch (status) {
    case SAVE_STATUS.LOADING:
      return "جاري التحميل...";
    case SAVE_STATUS.DIRTY:
      return "تغييرات غير محفوظة";
    case SAVE_STATUS.SAVING:
      return "جارٍ الحفظ...";
    case SAVE_STATUS.OFFLINE:
      return "غير متصل — تم حفظ التعديلات محليًا";
    case SAVE_STATUS.PENDING_SYNC:
      return "محفوظ محليًا — في انتظار المزامنة";
    case SAVE_STATUS.ERROR:
      return "تعذر الحفظ على السيرفر";
    case SAVE_STATUS.IDLE:
      return "جاهز";
    case SAVE_STATUS.SAVED:
    default:
      return "محفوظ";
  }
}

export function resolveSaveAttempt({
  isDirty = false,
  isSaving = false,
  firestoreWriteCompleted = false,
} = {}) {
  if (isSaving) return "in-progress";
  if (firestoreWriteCompleted) return "already-written";
  if (!isDirty) return "unchanged";
  return "save";
}

export function resolveSaveSuccessNotification({ isOffline = false } = {}) {
  if (isOffline) {
    return {
      type: "info",
      message:
        "تم حفظ التغييرات على الجهاز فقط — ستتم مزامنتها عند عودة الإنترنت.",
    };
  }
  return { type: "success", message: "تم حفظ التغييرات بنجاح." };
}

export function showSaveSuccessNotification(
  showNotice,
  { isOffline = false } = {},
) {
  const notification = resolveSaveSuccessNotification({ isOffline });
  showNotice(notification.message, notification.type);
}

export function resolveSaveErrorNotification(
  error,
  {
    isOffline = false,
    localDraftSaved = false,
    firestoreWriteCompleted = false,
  } = {},
) {
  const code = String(error?.code || "");
  const codeSuffix = code ? ` (${code})` : "";
  const localDraftSuffix = localDraftSaved
    ? " احتُفظ بالتغييرات كمسودة محلية."
    : "";

  if (firestoreWriteCompleted) {
    return {
      type: "info",
      message:
        "تم حفظ الترنيمة على السيرفر، لكن تعذّر إكمال التحديث المحلي. لن نكرر الكتابة." +
        codeSuffix,
    };
  }

  if (code === "permission-denied") {
    return {
      type: "error",
      message:
        "فشل الحفظ: الحساب لا يملك صلاحية الحفظ على السيرفر." +
        localDraftSuffix,
    };
  }

  if (code === "not-found") {
    return {
      type: "error",
      message:
        "الترنيمة غير موجودة على السيرفر؛ احتُفظ بالمسودة المحلية ولم يتم إنشاؤها بالمعرّف القديم.",
    };
  }

  if (code === "unauthenticated") {
    return {
      type: "error",
      message: "فشل الحفظ: سجّل الدخول مرة أخرى." + localDraftSuffix,
    };
  }

  if (code === "unavailable" || code === "network-request-failed" || isOffline) {
    return {
      type: "error",
      message:
        "تعذر إكمال الحفظ على السيرفر. تحقق من الإنترنت وحاول مجددًا." +
        localDraftSuffix,
    };
  }

  if (code === "deadline-exceeded") {
    return {
      type: "error",
      message:
        "انتهت مهلة الاتصال بالسيرفر. حاول مرة أخرى." + localDraftSuffix,
    };
  }

  if (code === "resource-exhausted") {
    return {
      type: "error",
      message:
        "رفضت الخدمة الطلب بسبب تجاوز حد الاستخدام." + localDraftSuffix,
    };
  }

  if (code === "failed-precondition") {
    return {
      type: "error",
      message:
        `تعذر إكمال الحفظ بسبب شرط من الخدمة${codeSuffix}. حاول مرة أخرى.` +
        localDraftSuffix,
    };
  }

  return {
    type: "error",
    message: `حدث خطأ أثناء الحفظ${codeSuffix}. حاول مرة أخرى.${localDraftSuffix}`,
  };
}

export function resolveSaveState({
  isDirty = false,
  isSaving = false,
  isOffline = false,
  isLoading = false,
  hasLocalDraft = false,
  saveFailed = false,
  pendingSync = false,
  hasServerState = false,
} = {}) {
  if (isLoading) {
    return {
      status: SAVE_STATUS.LOADING,
      label: getSaveStateLabel(SAVE_STATUS.LOADING),
      retryable: false,
    };
  }

  if (isSaving) {
    return {
      status: SAVE_STATUS.SAVING,
      label: getSaveStateLabel(SAVE_STATUS.SAVING),
      retryable: false,
    };
  }

  if (saveFailed) {
    return {
      status: SAVE_STATUS.ERROR,
      label: getSaveStateLabel(SAVE_STATUS.ERROR),
      retryable: true,
    };
  }

  if (isDirty) {
    return {
      status: isOffline ? SAVE_STATUS.OFFLINE : SAVE_STATUS.DIRTY,
      label: getSaveStateLabel(
        isOffline ? SAVE_STATUS.OFFLINE : SAVE_STATUS.DIRTY,
      ),
      retryable: false,
    };
  }

  if (pendingSync) {
    return {
      status: SAVE_STATUS.PENDING_SYNC,
      label: getSaveStateLabel(SAVE_STATUS.PENDING_SYNC),
      retryable: false,
    };
  }

  if (hasLocalDraft && !hasServerState) {
    return {
      status: SAVE_STATUS.PENDING_SYNC,
      label: getSaveStateLabel(SAVE_STATUS.PENDING_SYNC),
      retryable: false,
    };
  }

  if (isOffline && hasLocalDraft) {
    return {
      status: SAVE_STATUS.OFFLINE,
      label: getSaveStateLabel(SAVE_STATUS.OFFLINE),
      retryable: false,
    };
  }

  return {
    status: SAVE_STATUS.SAVED,
    label: getSaveStateLabel(SAVE_STATUS.SAVED),
    retryable: false,
  };
}

export function shouldPromptBeforeDiscard({
  isDirty = false,
  saveFailed = false,
}) {
  return Boolean(isDirty || saveFailed);
}

export function shouldBlockBeforeUnload(saveState) {
  const state =
    typeof saveState === "string"
      ? saveState
      : saveState?.status || SAVE_STATUS.SAVED;

  return [SAVE_STATUS.DIRTY, SAVE_STATUS.OFFLINE, SAVE_STATUS.ERROR].includes(
    state,
  );
}
