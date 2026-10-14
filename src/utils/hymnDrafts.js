const DRAFTS_KEY_PREFIX = "harmony-notes-drafts-v1:";
const LEGACY_DRAFTS_KEY = "harmony-notes-drafts-v1";
let draftScopeUid = "guest";

function draftsKey(uid = draftScopeUid) {
  return `${DRAFTS_KEY_PREFIX}${String(uid || "guest")}`;
}

function readAll(uid = draftScopeUid) {
  try {
    const scopeUid = String(uid || "guest");
    const key = draftsKey(scopeUid);
    let raw = localStorage.getItem(key);
    if (!raw && scopeUid === "guest") {
      raw = localStorage.getItem(LEGACY_DRAFTS_KEY);
      if (raw) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(LEGACY_DRAFTS_KEY);
      }
    }
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all, uid) {
  localStorage.setItem(draftsKey(uid), JSON.stringify(all));
}

export function setDraftScope(uid) {
  draftScopeUid = String(uid || "guest");
}

export function getDraft(id, uid = draftScopeUid) {
  const key = String(id || "");
  if (!key) return null;
  const entry = readAll(uid)[key];
  return entry?.hymn ? entry : null;
}

export function getAllDrafts(uid = draftScopeUid) {
  return Object.values(readAll(uid)).filter((entry) => entry?.hymn);
}

export function writeDraft(
  id,
  hymn,
  { pendingSync, baseHymn, isNew } = {},
) {
  const key = String(id || "");
  if (!key || !hymn) return;
  const all = readAll();
  const sameHymn = JSON.stringify(all[key]?.hymn) === JSON.stringify(hymn);
  all[key] = {
    hymn,
    baseHymn: baseHymn || all[key]?.baseHymn || null,
    isNew: isNew ?? Boolean(all[key]?.isNew),
    conflict: sameHymn && Boolean(all[key]?.conflict),
    updatedAt: Date.now(),
    pendingSync: pendingSync ?? Boolean(all[key]?.pendingSync),
  };
  writeAll(all);
}

export function markDraftPendingSync(id, uid = draftScopeUid) {
  const key = String(id || "");
  if (!key) return null;
  const all = readAll(uid);
  if (!all[key]?.hymn) return null;
  all[key] = { ...all[key], pendingSync: true };
  writeAll(all, uid);
  return all[key];
}

export function markDraftConflict(id, uid = draftScopeUid) {
  const key = String(id || "");
  if (!key) return null;
  const all = readAll(uid);
  if (!all[key]?.hymn) return null;
  all[key] = { ...all[key], conflict: true };
  writeAll(all, uid);
  return all[key];
}

export function clearDraft(id, expectedUpdatedAt, uid = draftScopeUid) {
  const key = String(id || "");
  if (!key) return;
  const all = readAll(uid);
  if (!(key in all)) return;
  if (
    expectedUpdatedAt !== undefined &&
    all[key].updatedAt !== expectedUpdatedAt
  ) {
    return;
  }
  delete all[key];
  writeAll(all, uid);
}
