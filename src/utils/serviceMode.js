export const SERVICE_MODE_STORAGE_KEY = "harmony-notes-service-mode-v1";
const LEGACY_SERVICE_MODE_KEY = SERVICE_MODE_STORAGE_KEY;

function storageKey(uid) {
  return `${SERVICE_MODE_STORAGE_KEY}:${String(uid || "guest")}`;
}

export function resolveServiceIndex(hymnIds, currentIndex) {
  const ids = Array.isArray(hymnIds) ? hymnIds.filter(Boolean) : [];
  if (!ids.length) return 0;

  const numericIndex = Number(currentIndex);
  if (!Number.isFinite(numericIndex)) return 0;

  const safeIndex = Math.trunc(numericIndex);
  if (safeIndex < 0) return 0;
  if (safeIndex >= ids.length) return ids.length - 1;

  return safeIndex;
}

export function moveServiceIndex(hymnIds, currentIndex, direction) {
  const ids = Array.isArray(hymnIds) ? hymnIds.filter(Boolean) : [];
  if (!ids.length) return 0;

  const baseIndex = resolveServiceIndex(ids, currentIndex);
  const nextIndex = baseIndex + direction;
  if (nextIndex < 0) return 0;
  if (nextIndex >= ids.length) return ids.length - 1;

  return nextIndex;
}

export function findNextServiceIndex(
  hymnIds,
  currentIndex,
  direction,
  predicate = () => true,
) {
  const ids = Array.isArray(hymnIds) ? hymnIds.filter(Boolean) : [];
  if (!ids.length) return 0;

  const safeIndex = resolveServiceIndex(ids, currentIndex);
  const stepDirection = Number(direction) || 1;

  for (let step = 1; step <= ids.length; step += 1) {
    const candidate = safeIndex + step * stepDirection;
    if (candidate < 0 || candidate >= ids.length) {
      return safeIndex;
    }

    const candidateId = ids[candidate];
    if (predicate(candidateId, candidate)) {
      return candidate;
    }
  }

  return safeIndex;
}

export function normalizeServiceSetlist(serviceMode = {}) {
  const hymnIds = Array.isArray(serviceMode.hymnIds) ? serviceMode.hymnIds : [];
  const uniqueIds = [
    ...new Set(hymnIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
  ];

  const currentIndex = resolveServiceIndex(uniqueIds, serviceMode.currentIndex);

  return {
    setlistId: String(serviceMode.setlistId || serviceMode.id || ""),
    title:
      String(serviceMode.title || serviceMode.name || "قائمة الخدمة").trim() ||
      "قائمة الخدمة",
    source: serviceMode.source === "shared" ? "shared" : "local",
    hymnIds: uniqueIds,
    currentIndex,
  };
}

export function saveServiceModeToStorage(serviceMode, uid) {
  const key = storageKey(uid);
  if (!serviceMode || !Array.isArray(serviceMode.hymnIds)) {
    localStorage.removeItem(key);
    return;
  }

  const nextMode = normalizeServiceSetlist(serviceMode);
  if (!nextMode.hymnIds.length) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify(nextMode));
}

export function loadServiceModeFromStorage(uid) {
  try {
    const scopeUid = String(uid || "guest");
    const key = storageKey(scopeUid);
    let raw = localStorage.getItem(key);
    if (!raw && scopeUid === "guest") {
      raw = localStorage.getItem(LEGACY_SERVICE_MODE_KEY);
      if (raw) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(LEGACY_SERVICE_MODE_KEY);
      }
    }
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const normalized = normalizeServiceSetlist(parsed);
    return normalized.hymnIds.length ? normalized : null;
  } catch {
    return null;
  }
}
