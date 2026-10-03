export const SETLIST_SCHEMA_VERSION = 1;

function asIsoTimestamp(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  return null;
}

export function normalizeSharedSetlist(setlist = {}) {
  const hymnIds = Array.isArray(setlist.hymnIds) ? setlist.hymnIds : [];
  const uniqueHymnIds = [
    ...new Set(
      hymnIds.map((item) => String(item ?? "").trim()).filter(Boolean),
    ),
  ];

  const name = String(setlist.name || "قائمة الخدمة").trim() || "قائمة الخدمة";

  return {
    schemaVersion: SETLIST_SCHEMA_VERSION,
    id: String(setlist.id || ""),
    name,
    hymnIds: uniqueHymnIds,
    ownerUid: String(setlist.ownerUid || ""),
    createdBy: String(setlist.createdBy || setlist.ownerUid || ""),
    updatedBy: String(setlist.updatedBy || setlist.ownerUid || ""),
    createdAt: asIsoTimestamp(setlist.createdAt),
    updatedAt: asIsoTimestamp(setlist.updatedAt),
  };
}

export function detectStoredSetlistVersion(data) {
  return Number(data?.schemaVersion ?? 0) || 0;
}

export function decodeStoredSetlist(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Shared setlist payload is required.");
  }

  const version = detectStoredSetlistVersion(data);
  if (version > SETLIST_SCHEMA_VERSION) {
    throw new Error(
      `Future shared setlist schema version: ${version} is not supported.`,
    );
  }

  return normalizeSharedSetlist({
    ...data,
    schemaVersion: version || SETLIST_SCHEMA_VERSION,
  });
}

export function encodeSetlistForFirestore(setlist) {
  const normalized = normalizeSharedSetlist(setlist);

  return {
    schemaVersion: normalized.schemaVersion,
    id: normalized.id,
    name: normalized.name,
    hymnIds: normalized.hymnIds,
    ownerUid: normalized.ownerUid,
    createdBy: normalized.createdBy,
    updatedBy: normalized.updatedBy,
    createdAt: normalized.createdAt || new Date().toISOString(),
    updatedAt: normalized.updatedAt || new Date().toISOString(),
  };
}

export function reorderSetlistHymns(hymnIds, fromIndex, toIndex) {
  const next = [...(Array.isArray(hymnIds) ? hymnIds : [])];
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return next;
  }

  const clampedFrom = Math.min(Math.max(fromIndex, 0), next.length - 1);
  const clampedTo = Math.min(Math.max(toIndex, 0), next.length - 1);

  const [moved] = next.splice(clampedFrom, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}
