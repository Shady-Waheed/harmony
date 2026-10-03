import { useEffect, useState } from "react";
import { loadSetlist, saveSetlist } from "../utils/setlistStorage";

export default function SetlistPanel({
  currentId,
  currentTitle,
  onOpen,
  canAdd,
  canManageSharedSetlists = false,
  sharedSetlists = [],
  selectedSharedSetlistId = "",
  onSelectSharedSetlist,
  onCreateSharedSetlist,
  onDeleteSharedSetlist,
  onRenameSharedSetlist,
  onAddCurrentToSharedSetlist,
  onMoveSharedSetlistItem,
  onRemoveSharedSetlistItem,
  sharedSetlistItems = [],
  sharedSetlistsLoading = false,
}) {
  const [items, setItems] = useState(loadSetlist);

  useEffect(() => {
    saveSetlist(items);
  }, [items]);

  const alreadyAdded = items.some((item) => item.id === currentId);
  const activeSharedSetlist =
    sharedSetlists.find((item) => item.id === selectedSharedSetlistId) || null;

  const addCurrent = () => {
    if (!canAdd || !currentId || alreadyAdded) return;
    setItems((prev) => [
      ...prev,
      { id: currentId, title: currentTitle || "ترنيمة بدون عنوان" },
    ]);
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const moveItem = (index, direction) => {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      const [row] = next.splice(index, 1);
      next.splice(target, 0, row);
      return next;
    });
  };

  const addCurrentToSharedSetlist = () => {
    if (!canManageSharedSetlists || !selectedSharedSetlistId || !currentId)
      return;
    onAddCurrentToSharedSetlist?.(selectedSharedSetlistId, currentId);
  };

  return (
    <div className="setlistPanel">
      <div className="row between sidebarHeader">
        <h3>سيت ليست</h3>
        <button
          type="button"
          className="btn"
          onClick={addCurrent}
          disabled={!canAdd || !currentId || alreadyAdded}
        >
          {alreadyAdded ? "مضافة" : "أضف الحالية"}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="sidebarHint">لا توجد ترانيم في قائمة الخدمة بعد.</p>
      ) : (
        <ul className="hymnList setlistList">
          {items.map((item, index) => (
            <li key={item.id} className="setlistRow">
              <button
                type="button"
                className={`hymnListItem ${currentId === item.id ? "active" : ""}`}
                onClick={() => onOpen(item.id)}
              >
                <span>
                  {index + 1}. {item.title}
                </span>
              </button>
              <div className="setlistRowActions">
                <button
                  type="button"
                  className="btn setlistIconBtn"
                  onClick={() => moveItem(index, -1)}
                  disabled={index === 0}
                  aria-label="تحريك لأعلى"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn setlistIconBtn"
                  onClick={() => moveItem(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label="تحريك لأسفل"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn danger setlistIconBtn"
                  onClick={() => removeItem(item.id)}
                  aria-label="حذف من السيت ليست"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(canManageSharedSetlists || sharedSetlists.length > 0) && (
        <div className="setlistPanel sharedSetlistPanel">
          <div className="row between sidebarHeader">
            <h3>قوائم الخدمة المشتركة</h3>
            {canManageSharedSetlists ? (
              <button
                type="button"
                className="btn"
                onClick={onCreateSharedSetlist}
              >
                جديد
              </button>
            ) : null}
          </div>

          {sharedSetlistsLoading ? (
            <p className="sidebarHint">جاري تحميل القوائم المشتركة...</p>
          ) : sharedSetlists.length === 0 ? (
            <p className="sidebarHint">لا توجد قوائم خدمة مشتركة بعد.</p>
          ) : (
            <div
              className="row wrap"
              style={{ gap: "0.4rem", marginBottom: "0.5rem" }}
            >
              {sharedSetlists.map((setlist) => (
                <button
                  key={setlist.id}
                  type="button"
                  className={`btn ${selectedSharedSetlistId === setlist.id ? "primary" : ""}`}
                  onClick={() => onSelectSharedSetlist?.(setlist.id)}
                >
                  {setlist.name}
                </button>
              ))}
            </div>
          )}

          {selectedSharedSetlistId && activeSharedSetlist ? (
            <>
              <div className="row wrap sidebarActions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={addCurrentToSharedSetlist}
                  disabled={!canManageSharedSetlists || !currentId}
                >
                  إضافة الحالية
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    onRenameSharedSetlist?.(selectedSharedSetlistId)
                  }
                >
                  تعديل الاسم
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() =>
                    onDeleteSharedSetlist?.(selectedSharedSetlistId)
                  }
                >
                  حذف القائمة
                </button>
              </div>

              {sharedSetlistItems.length === 0 ? (
                <p className="sidebarHint">
                  لا توجد ترانيم في هذه القائمة بعد.
                </p>
              ) : (
                <ul className="hymnList setlistList">
                  {sharedSetlistItems.map((item, index) => (
                    <li key={`${item.id}-${index}`} className="setlistRow">
                      <button
                        type="button"
                        className={`hymnListItem ${currentId === item.id ? "active" : ""}`}
                        onClick={() => onOpen(item.id)}
                      >
                        <span>
                          {index + 1}. {item.title}
                        </span>
                        {item.missing ? <small> ⚠</small> : null}
                      </button>
                      <div className="setlistRowActions">
                        <button
                          type="button"
                          className="btn setlistIconBtn"
                          onClick={() =>
                            onMoveSharedSetlistItem?.(
                              selectedSharedSetlistId,
                              index,
                              -1,
                            )
                          }
                          disabled={index === 0}
                          aria-label="تحريك لأعلى"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn setlistIconBtn"
                          onClick={() =>
                            onMoveSharedSetlistItem?.(
                              selectedSharedSetlistId,
                              index,
                              1,
                            )
                          }
                          disabled={index === sharedSetlistItems.length - 1}
                          aria-label="تحريك لأسفل"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn danger setlistIconBtn"
                          onClick={() =>
                            onRemoveSharedSetlistItem?.(
                              selectedSharedSetlistId,
                              item.id,
                            )
                          }
                          aria-label="حذف من القائمة المشتركة"
                        >
                          ×
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
