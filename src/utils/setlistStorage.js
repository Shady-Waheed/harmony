const SETLIST_KEY = "harmony-notes-setlist-v1";

export function loadSetlist() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETLIST_KEY) || "[]");
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

export function saveSetlist(items) {
  localStorage.setItem(SETLIST_KEY, JSON.stringify(items));
}
