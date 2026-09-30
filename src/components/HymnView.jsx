import { forwardRef } from "react";
import { useHymnStore } from "../store/hymnStore.jsx";
import { buildDisplayCells } from "../utils/lineChords";
import {
  formatChordLabel,
  getChordEffectiveInversion,
  getChordOrderedNoteNames,
  getChordVoicingKeyIndexes,
} from "../utils/chords";

const WHITE_KEY_STEPS = [
  { rel: 0, note: "C" },
  { rel: 2, note: "D" },
  { rel: 4, note: "E" },
  { rel: 5, note: "F" },
  { rel: 7, note: "G" },
  { rel: 9, note: "A" },
  { rel: 11, note: "B" },
];

const BLACK_KEY_STEPS = [
  { rel: 1, note: "C#", left: 11.5 },
  { rel: 3, note: "D#", left: 25.7 },
  { rel: 6, note: "F#", left: 54.2 },
  { rel: 8, note: "G#", left: 68.4 },
  { rel: 10, note: "A#", left: 82.6 },
];

function buildMiniKeyboardKeys(baseC, nOctaves) {
  const whites = [];
  const blacks = [];
  for (let o = 0; o < nOctaves; o += 1) {
    const octaveBase = baseC + o * 12;
    for (const { rel, note } of WHITE_KEY_STEPS) {
      const abs = octaveBase + rel;
      whites.push({ abs, note, key: `w-${abs}` });
    }
    for (const { rel, note, left } of BLACK_KEY_STEPS) {
      const abs = octaveBase + rel;
      blacks.push({ abs, note, left, o, key: `b-${abs}` });
    }
  }
  return { whites, blacks };
}

function ChordPianoPreview({ chord, inversion }) {
  const voicingIndexes = getChordVoicingKeyIndexes(chord, inversion);
  const orderedNoteNames = getChordOrderedNoteNames(chord, inversion);
  const effectiveInversion = getChordEffectiveInversion(chord, inversion);
  if (voicingIndexes.length === 0) return null;

  const minV = Math.min(...voicingIndexes);
  const maxV = Math.max(...voicingIndexes);
  const baseC = Math.floor(minV / 12) * 12;
  const nOctaves = Math.max(2, Math.ceil((maxV + 1 - baseC) / 12));
  const { whites, blacks } = buildMiniKeyboardKeys(baseC, nOctaves);

  const activeAbs = new Set(voicingIndexes);
  const bassAbs = voicingIndexes[0];
  const orderByAbs = new Map(voicingIndexes.map((abs, idx) => [abs, idx + 1]));

  const inversionLabel =
    effectiveInversion === "first"
      ? "1st"
      : effectiveInversion === "second"
        ? "2nd"
        : effectiveInversion === "third"
          ? "3rd"
          : "Root";

  const octaveWidthPct = 100 / nOctaves;

  return (
    <span className="chordPreviewPopup" role="tooltip" aria-hidden="true">
      <span className="chordPreviewTitle">
        {formatChordLabel(chord, inversion)}
      </span>
      <span className="chordPreviewMeta">{inversionLabel}</span>
      <span
        className="miniPiano"
        aria-hidden="true"
        style={{
          gridTemplateColumns: `repeat(${whites.length}, minmax(0, 1fr))`,
          "--mini-white-count": whites.length,
        }}
      >
        {whites.map((key) => (
          <span
            key={key.key}
            className={`miniKey white ${activeAbs.has(key.abs) ? "active" : ""} ${bassAbs === key.abs ? "bass" : ""}`}
          >
            {orderByAbs.has(key.abs) ? (
              <span className="miniKeyOrder">{orderByAbs.get(key.abs)}</span>
            ) : null}
          </span>
        ))}
        {blacks.map((key) => (
          <span
            key={key.key}
            className={`miniKey black ${activeAbs.has(key.abs) ? "active" : ""} ${bassAbs === key.abs ? "bass" : ""}`}
            style={{ left: `${octaveWidthPct * (key.o + key.left / 100)}%` }}
          >
            {orderByAbs.has(key.abs) ? (
              <span className="miniKeyOrder">{orderByAbs.get(key.abs)}</span>
            ) : null}
          </span>
        ))}
      </span>
      {orderedNoteNames.length > 0 ? (
        <span className="chordPreviewNotes">
          {orderedNoteNames.join(" - ")}
        </span>
      ) : null}
    </span>
  );
}

function SheetStaffMark() {
  return (
    <svg
      className="sheetStaffMark"
      viewBox="0 0 88 22"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      >
        <path d="M4 3.2h80M4 7.4h80M4 11.6h80M4 15.8h80" />
        <path d="M18 1.6v18.2" />
        <path d="M22.2 6.2c4.8-4.4 11.4 0.4 7.2 6.4-3.6 5.2-9.4 7.6-9.4 7.6" />
      </g>
    </svg>
  );
}

function chordEntriesFromLetter(letter = {}) {
  const chords = Array.isArray(letter.chords) ? letter.chords : [];
  const inversions = Array.isArray(letter.inversions) ? letter.inversions : [];
  return chords
    .map((item, index) => {
      if (item && typeof item === "object") {
        return {
          chord: item.chord || "",
          inversion: item.inversion || inversions[index] || "",
        };
      }
      return { chord: item || "", inversion: inversions[index] || "" };
    })
    .filter((entry) => Boolean(entry.chord));
}

function ChordLabels({ entries = [], isExporting = false }) {
  const visibleEntries = entries.filter((entry) => Boolean(entry.chord));

  return (
    <span
      className={`lyricWordChords ${visibleEntries.length === 0 ? "lyricWordChords--empty" : ""}`}
      dir="ltr"
      style={{
        display: "inline-flex",
        gap: "0.3rem",
        direction: "ltr",
        alignItems: "baseline",
      }}
    >
      {visibleEntries.map((entry, index) => (
        <span className="lyricWordChord" key={`${entry.chord}-${index}`}>
          <span
            className="chord hasPreview"
            tabIndex={0}
            style={
              isExporting
                ? {
                    background: "transparent",
                    backgroundColor: "transparent",
                    border: "none",
                    borderColor: "transparent",
                    color: "#c0392b",
                    boxShadow: "none",
                    padding: "0",
                    fontWeight: "bold",
                  }
                : undefined
            }
          >
            {formatChordLabel(entry.chord, entry.inversion)}
            <ChordPianoPreview
              chord={entry.chord}
              inversion={entry.inversion}
            />
          </span>
        </span>
      ))}
    </span>
  );
}

const HymnView = forwardRef(function HymnView({ isExporting = false }, ref) {
  const { state } = useHymnStore();
  const { hymn } = state;
  const hasSections = (hymn.sections || []).some(
    (section) => (section.lines || []).length > 0,
  );

  return (
    <section
      ref={ref}
      className="card hymnSheet hymn-viewer-container"
      dir="rtl"
      style={{ direction: "rtl", textAlign: isExporting ? "right" : undefined }}
    >
      <div className="watermark-overlay" aria-hidden="true">
        HARMONY NOTES
      </div>

      <div className="hymn-content">
        <header
          className="sheetHeader"
          style={{ textAlign: isExporting ? "right" : undefined }}
        >
          <SheetStaffMark />
          <p className="sheetKicker">Harmony Notes</p>
          <h1>{hymn.title || "ترنيمة بدون عنوان"}</h1>
          <div className="sheetMeta">
            <span className="sheetKeyPill">
              <small>Key</small>
              <strong>{hymn.key || "—"}</strong>
            </span>
            <span className="sheetMetaHint">
              مرّر على الكورد لمعاينة البيانو
            </span>
          </div>
        </header>

        {!hasSections ? (
          <p className="sheetEmpty">
            لا توجد كلمات بعد. اكتب الترنيمة من وضع التعديل.
          </p>
        ) : null}

        {(hymn.sections || []).map((section, sectionIndex) => (
          <article key={section.id} className="sheetSection">
            <div className="sheetSectionHead">
              <span className="sheetSectionIndex">
                {String(sectionIndex + 1).padStart(2, "0")}
              </span>
              <h2>{section.title || "قسم"}</h2>
            </div>
            <div className="sheetLines">
              {(section.lines || []).map((line) => {
                const cells = buildDisplayCells(line);
                if (cells.length === 0) {
                  return (
                    <div key={line.id} className="sheetLine sheetLine--empty" />
                  );
                }
                return (
                  <div
                    key={line.id}
                    className="sheetLine"
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      direction: "rtl",
                      justifyContent: "flex-start",
                    }}
                  >
                    {cells.map((cell, i) => {
                      const isGap =
                        cell.type === "before" || cell.type === "after";
                      const letterEntries = isGap
                        ? [
                            {
                              letter: "\u00A0",
                              entries: cell.chord
                                ? [
                                    {
                                      chord: cell.chord,
                                      inversion: cell.inversion || "",
                                    },
                                  ]
                                : [],
                            },
                          ]
                        : (cell.letters || []).map((letter) => ({
                            letter: letter.letter,
                            entries: chordEntriesFromLetter(letter),
                          }));
                      const hasChord = letterEntries.some(
                        (letter) => letter.entries.length > 0,
                      );
                      return (
                        <div
                          key={`${line.id}-${i}`}
                          className={`cell cell--${cell.type} ${isGap ? "gap" : ""} ${hasChord ? "hasChord" : "noChord"}`}
                        >
                          <div
                            className={`lyric-word-container ${isGap ? "lyric-word-container--gap" : "lyric-word-container--letters"}`}
                            style={{
                              display: "inline-flex",
                              flexDirection: "row",
                              direction: "rtl",
                              textAlign: isExporting ? "right" : undefined,
                            }}
                          >
                            {letterEntries.map((letter, letterIndex) => (
                              <span
                                className="lyricWord"
                                key={`${line.id}-${i}-${letterIndex}`}
                              >
                                <ChordLabels
                                  entries={letter.entries}
                                  isExporting={isExporting}
                                />
                                <span className="lyricWordText">
                                  {letter.letter}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
});

export default HymnView;
