const DRAFTS_KEY = "harmony-notes-drafts-v1";

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(all));
}

export function getDraft(id) {
  const key = String(id || "");
  if (!key) return null;
  const entry = readAll()[key];
  return entry?.hymn ? entry : null;
}

export function writeDraft(id, hymn) {
  const key = String(id || "");
  if (!key || !hymn) return;
  const all = readAll();
  all[key] = { hymn, updatedAt: Date.now() };
  writeAll(all);
}

export function clearDraft(id) {
  const key = String(id || "");
  if (!key) return;
  const all = readAll();
  if (!(key in all)) return;
  delete all[key];
  writeAll(all);
}
