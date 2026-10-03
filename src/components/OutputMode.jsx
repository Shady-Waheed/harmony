import { useEffect, useRef, useState } from "react";
import HymnView from "./HymnView";
import {
  createOutputViewOptions,
  OUTPUT_PROFILE,
  requestBrowserPrint,
} from "../utils/outputMode";

export default function OutputMode({ onClose }) {
  const [profile, setProfile] = useState(OUTPUT_PROFILE.PRINT);
  const [fontSize, setFontSize] = useState(36);
  const [showChords, setShowChords] = useState(true);
  const [showKey, setShowKey] = useState(true);
  const [status, setStatus] = useState("");
  const closeButtonRef = useRef(null);
  const previewRef = useRef(null);
  const options = createOutputViewOptions({
    profile,
    fontSize,
    showChords,
    showKey,
  });

  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose]);

  const printOutput = () => {
    setStatus(
      requestBrowserPrint()
        ? "سيتم فتح نافذة الطباعة أو حفظ PDF من المتصفح."
        : "تعذر فتح نافذة الطباعة في هذا المتصفح.",
    );
  };

  const enterFullscreen = async () => {
    if (!previewRef.current?.requestFullscreen) {
      setStatus("ملء الشاشة غير متاح في هذا المتصفح.");
      return;
    }
    try {
      await previewRef.current.requestFullscreen();
      setStatus("");
    } catch {
      setStatus("لم يسمح المتصفح بملء الشاشة.");
    }
  };

  return (
    <div
      className="outputOverlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        className="outputDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="output-mode-title"
      >
        <header className="outputToolbar">
          <div className="outputToolbarHeading">
            <h2 id="output-mode-title">إخراج الترنيمة</h2>
            <div className="outputProfiles" aria-label="ملف الإخراج">
              <button
                type="button"
                className={`btn ${profile === OUTPUT_PROFILE.PRINT ? "primary" : ""}`}
                aria-pressed={profile === OUTPUT_PROFILE.PRINT}
                onClick={() => setProfile(OUTPUT_PROFILE.PRINT)}
              >
                طباعة / PDF
              </button>
              <button
                type="button"
                className={`btn ${profile === OUTPUT_PROFILE.PROJECTION ? "primary" : ""}`}
                aria-pressed={profile === OUTPUT_PROFILE.PROJECTION}
                onClick={() => setProfile(OUTPUT_PROFILE.PROJECTION)}
              >
                عرض للشاشة
              </button>
            </div>
          </div>
          <div className="outputToolbarActions">
            <label className="outputFontControl">
              <span>حجم الكلمات</span>
              <input
                type="range"
                min="18"
                max="72"
                step="2"
                value={options.fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                aria-label="حجم كلمات الإخراج"
              />
            </label>
            <label className="outputToggle">
              <input
                type="checkbox"
                checked={showChords}
                onChange={(event) => setShowChords(event.target.checked)}
              />
              <span>إظهار الكوردات</span>
            </label>
            <label className="outputToggle">
              <input
                type="checkbox"
                checked={showKey}
                onChange={(event) => setShowKey(event.target.checked)}
              />
              <span>إظهار المقام</span>
            </label>
            {profile === OUTPUT_PROFILE.PROJECTION ? (
              <button
                type="button"
                className="btn"
                onClick={enterFullscreen}
                aria-label="عرض معاينة الإخراج بملء الشاشة"
              >
                ملء الشاشة
              </button>
            ) : null}
            <button type="button" className="btn primary" onClick={printOutput}>
              طباعة / حفظ PDF
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              className="btn"
              onClick={onClose}
              aria-label="إغلاق وضع الإخراج"
            >
              إغلاق
            </button>
          </div>
          <p className="outputStatus" role="status" aria-live="polite">
            {status}
          </p>
        </header>
        <main
          ref={previewRef}
          className={`outputPreview outputPreview--${options.profile}`}
          style={{ "--output-lyric-size": `${options.fontSize}px` }}
          aria-label="معاينة الإخراج"
        >
          <HymnView outputOptions={options} />
        </main>
      </section>
    </div>
  );
}
