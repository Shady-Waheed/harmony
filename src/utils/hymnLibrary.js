export const FAVORITES_STORAGE_KEY = "harmony-notes-favorites-v1";
export const RECENT_HYMNS_STORAGE_KEY = "harmony-notes-recent-v1";
export const RECENT_HYMNS_LIMIT = 20;
export const HYMN_LIBRARY_EVENT = "harmony-notes:hymn-library-change";

function normalizeIds(value, limit = Infinity) {
  if (!Array.isArray(value)) return [];
  const ids = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

function getStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readList(key, storage) {
  try {
    const raw = getStorage(storage)?.getItem(key);
    if (!raw) return { ids: [], supported: true };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ids: [], supported: true };
    }
    if (parsed.version !== 1) return { ids: [], supported: false };
    return { ids: normalizeIds(parsed.hymnIds), supported: true };
  } catch {
    return { ids: [], supported: true };
  }
}

function publishChange(kind, hymnIds) {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(HYMN_LIBRARY_EVENT, {
          detail: { kind, hymnIds: [...hymnIds] },
        }),
      );
    }
  } catch {
    // Local metadata must not interfere with hymn loading if events are unavailable.
  }
}

function writeList(key, kind, hymnIds, storage, limit = Infinity) {
  const ids = normalizeIds(hymnIds, limit);
  const target = getStorage(storage);
  try {
    if (!target) return false;
    const current = readList(key, target);
    if (!current.supported) return false;
    target.setItem(key, JSON.stringify({ version: 1, hymnIds: ids }));
  } catch {
    return false;
  }
  publishChange(kind, ids);
  return true;
}

export function readFavoriteIds(storage) {
  return readList(FAVORITES_STORAGE_KEY, storage).ids;
}

export function writeFavoriteIds(hymnIds, storage) {
  return writeList(FAVORITES_STORAGE_KEY, "favorites", hymnIds, storage);
}

export function toggleFavorite(hymnId, currentIds, storage) {
  const id = typeof hymnId === "string" ? hymnId.trim() : "";
  const ids = normalizeIds(
    Array.isArray(currentIds) ? currentIds : readFavoriteIds(storage),
  );
  if (!id) return ids;
  const next = ids.includes(id)
    ? ids.filter((item) => item !== id)
    : [id, ...ids];
  writeFavoriteIds(next, storage);
  return next;
}

export function isFavorite(hymnId, hymnIds = readFavoriteIds()) {
  const id = typeof hymnId === "string" ? hymnId.trim() : "";
  return Boolean(id && normalizeIds(hymnIds).includes(id));
}

export function resolveHymnsByIds(hymnIds, accessibleHymns = []) {
  const availableById = new Map(
    accessibleHymns
      .filter((hymn) => hymn?.id)
      .map((hymn) => [String(hymn.id), hymn]),
  );
  return normalizeIds(hymnIds).flatMap((id) =>
    availableById.has(id) ? [availableById.get(id)] : [],
  );
}

export function readRecentHymnIds(storage) {
  return readList(RECENT_HYMNS_STORAGE_KEY, storage).ids.slice(
    0,
    RECENT_HYMNS_LIMIT,
  );
}

export function writeRecentHymnIds(hymnIds, storage) {
  return writeList(
    RECENT_HYMNS_STORAGE_KEY,
    "recent",
    hymnIds,
    storage,
    RECENT_HYMNS_LIMIT,
  );
}

export function recordRecentHymn(hymnId, storage) {
  const id = typeof hymnId === "string" ? hymnId.trim() : "";
  if (!id) return readRecentHymnIds(storage);
  const current = readList(RECENT_HYMNS_STORAGE_KEY, storage);
  const next = [id, ...current.ids.filter((item) => item !== id)].slice(
    0,
    RECENT_HYMNS_LIMIT,
  );
  if (current.ids[0] === id && current.supported) return current.ids;
  const saved = writeRecentHymnIds(next, storage);
  if (!saved) publishChange("recent", next);
  return next;
}
