import { normalizeLineStructure } from "./lineChords.js";
import { decodeStoredHymn } from "./hymnFirestore.js";

export function normalizeHymnSearchText(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/ـ/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim()
    .toLocaleLowerCase("ar")
    .replace(/\s+/g, " ");
}

function normalizeChordSearchToken(value) {
  return normalizeHymnSearchText(value).replace(/\s*\/\s*/g, "/");
}

function appendChordValues(target, value) {
  if (Array.isArray(value)) {
    value.forEach((item) => appendChordValues(target, item));
    return;
  }
  if (typeof value === "string" && value.trim()) {
    target.add(normalizeChordSearchToken(value));
  }
}

function collectCanonicalChords(hymn) {
  const chords = new Set();
  const sections = Array.isArray(hymn?.sections) ? hymn.sections : [];
  for (const section of sections) {
    const lines = Array.isArray(section?.lines) ? section.lines : [];
    for (const line of lines) {
      const normalized = normalizeLineStructure(line);
      for (const field of [
        "wordChords",
        "wordChordGroups",
        "wordLetterChords",
        "gapChords",
        "beforeWordChords",
        "afterWordChords",
      ]) {
        appendChordValues(chords, normalized[field]);
      }
    }
  }
  return chords;
}

export function collectHymnSearchBlob(hymn) {
  const parts = [hymn?.title, hymn?.key];
  for (const section of hymn?.sections || []) {
    parts.push(section?.title);
    for (const line of section?.lines || []) {
      parts.push(line?.lyrics);
    }
  }
  return parts.filter(Boolean).join(" ");
}

export function buildHymnSearchIndex(hymns = []) {
  return (Array.isArray(hymns) ? hymns : []).map((hymn) => {
    let searchSource = hymn;
    try {
      searchSource = decodeStoredHymn(hymn);
    } catch {
      searchSource = hymn;
    }

    const textParts = [searchSource?.title];
    const sections = Array.isArray(searchSource?.sections)
      ? searchSource.sections
      : [];
    for (const section of sections) {
      textParts.push(section?.title);
      const lines = Array.isArray(section?.lines) ? section.lines : [];
      for (const line of lines) {
        textParts.push(line?.lyrics);
      }
    }

    return {
      hymn,
      id: String(searchSource?.id || hymn?.id || ""),
      title: normalizeHymnSearchText(searchSource?.title),
      text: normalizeHymnSearchText(textParts.filter(Boolean).join(" ")),
      key: normalizeChordSearchToken(searchSource?.key),
      chords: collectCanonicalChords(searchSource),
    };
  });
}

export function getHymnKeyOptions(index = []) {
  const keys = [];
  const seen = new Set();
  for (const entry of index) {
    const key = String(entry?.hymn?.key || "").trim();
    const normalizedKey = normalizeChordSearchToken(key);
    if (!key || !normalizedKey || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    keys.push(key);
  }
  return keys;
}

export function filterHymnSearchIndex(
  index = [],
  {
    query = "",
    key = "",
    favoritesOnly = false,
    favoriteIds = [],
    recentOnly = false,
    recentIds = [],
  } = {},
) {
  const normalizedQuery = normalizeHymnSearchText(query);
  const normalizedChordQuery = normalizeChordSearchToken(query);
  const normalizedKey = normalizeChordSearchToken(key);
  const favorites = new Set(
    (Array.isArray(favoriteIds) ? favoriteIds : []).map(String),
  );
  const recent = new Set(
    (Array.isArray(recentIds) ? recentIds : []).map(String),
  );
  const recentOrder = new Map(
    (Array.isArray(recentIds) ? recentIds : []).map((id, position) => [
      String(id),
      position,
    ]),
  );
  const favoriteOrder = new Map(
    (Array.isArray(favoriteIds) ? favoriteIds : []).map((id, position) => [
      String(id),
      position,
    ]),
  );

  const matches = index.filter((entry) => {
    if (
      normalizedQuery &&
      !entry.title.includes(normalizedQuery) &&
      !entry.text.includes(normalizedQuery) &&
      !entry.key.includes(normalizedQuery) &&
      !entry.chords.has(normalizedChordQuery)
    ) {
      return false;
    }
    if (normalizedKey && entry.key !== normalizedKey) return false;
    if (favoritesOnly && !favorites.has(entry.id)) return false;
    if (recentOnly && !recent.has(entry.id)) return false;
    return true;
  });

  if (recentOnly) {
    matches.sort(
      (a, b) =>
        (recentOrder.get(a.id) ?? Infinity) -
        (recentOrder.get(b.id) ?? Infinity),
    );
  } else if (favoritesOnly) {
    matches.sort(
      (a, b) =>
        (favoriteOrder.get(a.id) ?? Infinity) -
        (favoriteOrder.get(b.id) ?? Infinity),
    );
  }

  return matches.map((entry) => entry.hymn);
}

export function hymnMatchesQuery(hymn, query) {
  return (
    filterHymnSearchIndex(buildHymnSearchIndex([hymn]), { query }).length > 0
  );
}
