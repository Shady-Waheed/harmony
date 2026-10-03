import { forwardRef, useEffect, useMemo, useState } from "react";
import { transposeHymnShape, useHymnStore } from "../store/hymnStore.jsx";
import { buildDisplayCells, stretchArabicWord } from "../utils/lineChords";
import {
  formatChordLabel,
  getChordEffectiveInversion,
  getChordOrderedNoteNames,
  getChordVoicingKeyIndexes,
} from "../utils/chords";
import {
  getChordPianoInfo,
  getDisplayedKey,
  getTransposeLabel,
} from "../utils/pianoChords";

function TransposeControls({ hymnKey, transposeOffset, onTranspose, onReset }) {
  const keyLabel = getDisplayedKey(hymnKey || "", transposeOffset || 0);
  const hasTranspose = Number(transposeOffset || 0) !== 0;

  return (
    <div className="musicianControls" aria-label="Music controls">
      <div className="transposeControlGroup">
        <button
          type="button"
          className="btn compactTransposeBtn"
          onClick={() => onTranspose?.(-1)}
          aria-label="Transpose down semitone"
          title="Transpose down"
        >
          −
        </button>
        <span className="transposeReadout" aria-live="polite">
          {getTransposeLabel(transposeOffset || 0)}
        </span>
        <button
          type="button"
          className="btn compactTransposeBtn"
          onClick={() => onTranspose?.(1)}
          aria-label="Transpose up semitone"
          title="Transpose up"
        >
          +
        </button>
        {hasTranspose ? (
          <button
            type="button"
            className="btn compactTransposeBtn reset"
            onClick={onReset}
            aria-label="Reset transpose"
          >
            Reset
          </button>
        ) : null}
      </div>
      <div className="sheetKeyPill singerKeyPill">
        <small>Key</small>
        <strong>{keyLabel || "—"}</strong>
      </div>
    </div>
  );
}

function ChordDetailCard({ entry }) {
  const info = getChordPianoInfo(entry?.chord, entry?.inversion);
  if (!info.notes?.length) return null;

  return (
    <div className="chordDetailPanel" role="dialog" aria-label="Chord details">
      <div className="chordDetailHeader">
        <span className="chordDetailName">{info.label || entry?.chord}</span>
        {info.inversion ? (
          <span className="chordDetailTag">{info.inversion}</span>
        ) : null}
      </div>
      <div className="chordDetailGrid">
        <div>
          <span className="chordDetailLabel">Root</span>
          <strong>{info.root || "—"}</strong>
        </div>
        <div>
          <span className="chordDetailLabel">Quality</span>
          <strong>{info.quality || "—"}</strong>
        </div>
        {info.bass ? (
          <div>
            <span className="chordDetailLabel">Bass</span>
            <strong>{info.bass}</strong>
          </div>
        ) : null}
      </div>
      <div className="chordDetailNotesWrap">
        <span className="chordDetailLabel">Notes</span>
        <strong>{info.notes.join(" - ")}</strong>
      </div>
    </div>
  );
}

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

function ChordLabels({
  entries = [],
  isExporting = false,
  interactive = true,
  selectionScope = "",
  selectedChordId = null,
  onSelectChord,
}) {
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
      {visibleEntries.map((entry, index) => {
        const entryKey = `${selectionScope}:${index}`;
        const isActive = selectedChordId === entryKey && !isExporting;
        const chordLabel = formatChordLabel(entry.chord, entry.inversion);

        if (!interactive) {
          return (
            <span className="lyricWordChord" key={entryKey}>
              <span className="chord outputChordLabel">{chordLabel}</span>
            </span>
          );
        }

        return (
          <span className="lyricWordChord" key={entryKey}>
            <button
              type="button"
              className={`chord hasPreview ${isActive ? "isActive" : ""}`}
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
              onClick={() => onSelectChord?.(isActive ? null : entryKey)}
              aria-expanded={isActive}
              aria-label={`Chord ${formatChordLabel(entry.chord, entry.inversion)}`}
            >
              {chordLabel}
              {!isExporting ? (
                <ChordPianoPreview
                  chord={entry.chord}
                  inversion={entry.inversion}
                />
              ) : null}
            </button>
            {isActive ? <ChordDetailCard entry={entry} /> : null}
          </span>
        );
      })}
    </span>
  );
}

const HymnView = forwardRef(function HymnView(
  { isExporting = false, outputOptions = null },
  ref,
) {
  const { state, transposeHymn, resetTranspose } = useHymnStore();
  const { hymn, transposeOffset } = state;
  const [selectedChordId, setSelectedChordId] = useState(null);
  const displayedHymn = useMemo(
    () => transposeHymnShape(hymn, transposeOffset || 0),
    [hymn, transposeOffset],
  );
  const displayedKey = getDisplayedKey(hymn.key || "", transposeOffset || 0);
  const hasSections = (displayedHymn.sections || []).some(
    (section) => (section.lines || []).length > 0,
  );

  useEffect(() => {
    setSelectedChordId(null);
  }, [hymn.id]);

  const dismissChordOnEmptySpace = (event) => {
    if (!selectedChordId || outputOptions || isExporting) return;
    if (!(event.target instanceof Element)) return;
    if (
      event.target.closest(
        'button, a[href], input, select, textarea, summary, [role="button"], [role="link"], [role="dialog"], [role="listbox"], [role="option"], [contenteditable="true"], .musicianControls',
      )
    ) {
      return;
    }
    setSelectedChordId(null);
  };

  return (
    <section
      ref={ref}
      className={`card hymnSheet hymn-viewer-container ${outputOptions ? `outputHymnSheet outputHymnSheet--${outputOptions.profile}` : ""}`}
      onClick={dismissChordOnEmptySpace}
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
          {outputOptions ? (
            outputOptions.showKey ? (
              <div className="outputSheetKey sheetKeyPill">
                <small>Key</small>
                <strong>{displayedKey || "—"}</strong>
              </div>
            ) : null
          ) : (
            <>
              <div className="sheetMeta">
                <span className="sheetMetaHint">
                  {Number(transposeOffset || 0) !== 0
                    ? `Current key: ${displayedKey || "—"} • Saved key: ${hymn.key || "—"}`
                    : `Current key: ${displayedKey || "—"}`}
                </span>
              </div>
              <TransposeControls
                hymnKey={hymn.key}
                transposeOffset={transposeOffset || 0}
                onTranspose={transposeHymn}
                onReset={resetTranspose}
              />
            </>
          )}
        </header>

        {!hasSections ? (
          <p className="sheetEmpty">
            لا توجد كلمات بعد. اكتب الترنيمة من وضع التعديل.
          </p>
        ) : null}

        {(displayedHymn.sections || []).map((section, sectionIndex) => (
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
                      const wordChordEntries = isGap
                        ? cell.chord
                          ? [
                              {
                                chord: cell.chord,
                                inversion: cell.inversion || "",
                              },
                            ]
                          : []
                        : (() => {
                            const fromLetters = (cell.letters || []).flatMap(
                              (letter) => chordEntriesFromLetter(letter),
                            );
                            if (fromLetters.length)
                              return fromLetters.toReversed();
                            return (
                              Array.isArray(cell.chords)
                                ? cell.chords
                                : [cell.chord]
                            )
                              .filter(Boolean)
                              .map((chord, chordIndex) => ({
                                chord,
                                inversion: Array.isArray(cell.inversions)
                                  ? cell.inversions[chordIndex] || ""
                                  : cell.inversion || "",
                              }))
                              .toReversed();
                          })();
                      const outputChordEntries =
                        outputOptions && !outputOptions.showChords
                          ? []
                          : wordChordEntries;
                      const visibleChordCount = outputChordEntries.length;
                      const hasChord = visibleChordCount > 0;
                      return (
                        <div
                          key={`${line.id}-${i}`}
                          className={`cell cell--${cell.type} ${isGap ? "gap" : ""} ${hasChord ? "hasChord" : "noChord"}`}
                        >
                          <div
                            className={`lyric-word-container ${isGap ? "lyric-word-container--gap" : ""} ${visibleChordCount > 1 ? "lyric-word-container--multi" : ""}`}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              direction: "rtl",
                              textAlign: isExporting ? "right" : undefined,
                            }}
                          >
                            <ChordLabels
                              entries={outputChordEntries}
                              isExporting={isExporting}
                              interactive={!outputOptions}
                              selectionScope={`${hymn.id || "hymn"}:${section.id || sectionIndex}:${line.id || "line"}:${i}`}
                              selectedChordId={selectedChordId}
                              onSelectChord={setSelectedChordId}
                            />
                            <span className="lyricWordText">
                              {cell.type === "word"
                                ? stretchArabicWord(
                                    cell.word,
                                    visibleChordCount,
                                  )
                                : "\u00A0"}
                            </span>
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
