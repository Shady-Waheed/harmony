const SETLIST_KEY_PREFIX = "harmony-notes-setlist-v1:";
const LEGACY_SETLIST_KEY = "harmony-notes-setlist-v1";

function storageKey(uid) {
  return `${SETLIST_KEY_PREFIX}${String(uid || "guest")}`;
}

export function loadSetlist(uid) {
  try {
    const scopeUid = String(uid || "guest");
    const key = storageKey(scopeUid);
    let raw = localStorage.getItem(key);
    if (!raw && scopeUid === "guest") {
      raw = localStorage.getItem(LEGACY_SETLIST_KEY);
      if (raw) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(LEGACY_SETLIST_KEY);
      }
    }
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id || ""),
        title: String(item?.title || "ترنيمة بدون عنوان"),
      }))
      .filter((item) => item.id);
  } catch {
    return [];
  }
}

export function saveSetlist(items, uid) {
  localStorage.setItem(storageKey(uid), JSON.stringify(items));
}
