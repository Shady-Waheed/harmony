export function normalizeHymnSearchText(value) {
  return String(value || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

export function hymnMatchesQuery(hymn, query) {
  const q = normalizeHymnSearchText(query);
  if (!q) return true;
  return normalizeHymnSearchText(collectHymnSearchBlob(hymn)).includes(q);
}
