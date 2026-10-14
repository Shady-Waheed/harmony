export function selectPendingSyncDraft(drafts = [], uid = "") {
  const currentUid = String(uid || "");
  const eligible = (Array.isArray(drafts) ? drafts : []).filter((draft) => {
    if (!draft || !draft.hymn || !draft.hymn.id) return false;
    if (!draft.pendingSync || draft.conflict) return false;
    if (currentUid && draft.uid && String(draft.uid) !== currentUid) {
      return false;
    }
    return true;
  });

  if (!eligible.length) return null;

  return eligible.reduce((latest, draft) => {
    if (!latest) return draft;
    return Number(draft.updatedAt || 0) > Number(latest.updatedAt || 0)
      ? draft
      : latest;
  }, null);
}

export function isDraftStale(entry, latestDraft) {
  if (!entry) return false;
  if (!latestDraft) return true;
  return Number(latestDraft.updatedAt || 0) !== Number(entry.updatedAt || 0);
}

export function isPermissionFailure(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code.includes("permission") ||
    message.includes("permission") ||
    message.includes("permission_denied") ||
    message.includes("permission denied")
  );
}

export function shouldClearPendingDraft({ saveSucceeded, error, hymnId }) {
  if (!saveSucceeded || !hymnId) return false;
  if (error && isPermissionFailure(error)) return false;
  return true;
}
