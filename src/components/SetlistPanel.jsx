import { useEffect, useState } from "react";
import { loadSetlist, saveSetlist } from "../utils/setlistStorage";

export default function SetlistPanel({
  currentId,
  currentTitle,
  onOpen,
  canAdd,
}) {
  const [items, setItems] = useState(loadSetlist);

  useEffect(() => {
    saveSetlist(items);
  }, [items]);

  const alreadyAdded = items.some((item) => item.id === currentId);

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
    </div>
  );
}
