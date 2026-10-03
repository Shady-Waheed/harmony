import { useEffect, useMemo } from "react";
import HymnView from "./HymnView";
import { resolveServiceIndex } from "../utils/serviceMode";

export default function ServiceMode({
  serviceMode,
  hymns = [],
  currentUser,
  onExit,
  onSelectIndex,
  onMove,
  canReadHymn,
}) {
  const normalizedMode = useMemo(() => {
    if (!serviceMode || !Array.isArray(serviceMode.hymnIds)) {
      return null;
    }

    return {
      ...serviceMode,
      currentIndex: resolveServiceIndex(
        serviceMode.hymnIds,
        serviceMode.currentIndex,
      ),
    };
  }, [serviceMode]);

  useEffect(() => {
    if (!normalizedMode) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onMove?.(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onMove?.(-1);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onExit?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [normalizedMode, onExit, onMove]);

  if (!normalizedMode || !normalizedMode.hymnIds.length) {
    return (
      <div className="app dark" dir="rtl" lang="ar">
        <header className="topBar">
          <div>
            <h1>Harmony Notes</h1>
            <p>وضع الخدمة</p>
          </div>
        </header>
        <main className="content">
          <div className="card emptyState">
            <h3>لا توجد ترانيم في هذه القائمة.</h3>
            <button type="button" className="btn primary" onClick={onExit}>
              العودة إلى التحرير
            </button>
          </div>
        </main>
      </div>
    );
  }

  const currentIndex = normalizedMode.currentIndex;
  const currentHymnId = normalizedMode.hymnIds[currentIndex];
  const currentHymn = hymns.find((item) => item.id === currentHymnId) || null;
  const canReadCurrent = Boolean(currentHymnId && canReadHymn?.(currentHymnId));

  return (
    <div className="app dark" dir="rtl" lang="ar">
      <header className="topBar">
        <div>
          <h1>Harmony Notes</h1>
          <p>
            {normalizedMode.title || "قائمة الخدمة"} • {currentIndex + 1} /{" "}
            {normalizedMode.hymnIds.length}
          </p>
        </div>
        <div className="row wrap">
          <button type="button" className="btn" onClick={() => onMove?.(-1)}>
            السابق
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => onMove?.(1)}
          >
            التالي
          </button>
          <button type="button" className="btn" onClick={onExit}>
            الخروج
          </button>
        </div>
      </header>

      <main className="content withSidebar">
        <aside className="card hymnsSidebar">
          <div className="row between sidebarHeader">
            <h3>ترتيب الخدمة</h3>
          </div>

          <ul className="hymnList setlistList">
            {normalizedMode.hymnIds.map((hymnId, index) => {
              const hymnDoc = hymns.find((item) => item.id === hymnId);
              const readable = canReadHymn?.(hymnId);
              const label = hymnDoc?.title || "ترنيمة غير متاحة";

              return (
                <li key={`${hymnId}-${index}`} className="setlistRow">
                  <button
                    type="button"
                    className={`hymnListItem ${currentIndex === index ? "active" : ""}`}
                    onClick={() => onSelectIndex?.(index)}
                  >
                    <span>
                      {index + 1}. {label}
                    </span>
                    {!readable ? <small> ⚠</small> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="editorPane">
          {!canReadCurrent || !currentHymn ? (
            <div className="card emptyState">
              <h3>الترنيمة الحالية غير متاحة في هذا الحساب.</h3>
              <p>قد تكون محجوبة أو غير موجودة في السجل الحالي.</p>
              <div className="row wrap">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onMove?.(-1)}
                >
                  السابق
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onMove?.(1)}
                >
                  التالي
                </button>
              </div>
            </div>
          ) : (
            <HymnView isExporting={false} currentUser={currentUser} readOnly />
          )}
        </div>
      </main>
    </div>
  );
}
