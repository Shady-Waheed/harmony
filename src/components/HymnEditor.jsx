import { useEffect, useMemo, useState } from "react";
import { useHymnStore } from "../store/hymnStore.jsx";
import {
  normalizeLineStructure,
  splitWordLetters,
  splitWords,
} from "../utils/lineChords";
import { ROOT_NOTES, formatChordLabel } from "../utils/chords";

const EMPTY_BASS = "__no_bass__";
const EMPTY_INVERSION = "__no_inversion__";

const CUSTOM_INVERSION_OPTIONS = [
  { id: EMPTY_INVERSION, label: "Root / بدون انقلاب" },
  { id: "first", label: "1st Inversion" },
  { id: "second", label: "2nd Inversion" },
  { id: "third", label: "3rd Inversion" },
];
const CHORD_TYPES = ["", "m", "7", "m7", "maj7", "sus4", "sus2", "dim", "aug"];
const SHARP_NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const FLAT_NOTES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
const NOTE_INDEX = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const CUSTOM_CHORD_SUFFIXES = [
  "",
  "m",
  "min",
  "7",
  "m7",
  "min7",
  "maj7",
  "maj9",
  "maj11",
  "maj13",
  "m9",
  "m11",
  "m13",
  "m7b5",
  "dim7",
  "7b5",
  "7#5",
  "7b9",
  "7#9",
  "7#11",
  "11",
  "13",
  "b5",
  "#5",
  "b9",
  "#9",
  "#11",
  "add2",
  "add4",
  "add9",
  "add11",
  "add13",
  "sus2",
  "sus4",
  "dim",
  "aug",
];

function customChordSuggestions(value) {
  const query = String(value || "").trim();
  const rootMatch = query.match(/^([A-G](?:#|b)?)/i);
  const root = rootMatch ? rootMatch[1] : "G";
  const bassNotes = ROOT_NOTES.map((note) => `${root}/${note}`);
  const candidates = query.includes("/")
    ? bassNotes
    : CUSTOM_CHORD_SUFFIXES.map((suffix) => `${root}${suffix}`);
  const normalizedQuery = query.toLowerCase();
  return [...new Set(candidates)].filter(
    (candidate) =>
      !normalizedQuery || candidate.toLowerCase().startsWith(normalizedQuery),
  );
}

function isExtendedChordLike(value) {
  return /^([A-G](?:#|b)?)(?:[a-zA-Z+#b0-9()-]*)?(?:\/[A-G](?:#|b)?)?$/.test(
    String(value || "").trim(),
  );
}

function parseChordParts(chord) {
  if (!chord?.trim()) {
    return { root: "", type: "", bass: "", custom: false };
  }

  const match = chord
    .trim()
    .match(
      /^([A-G](?:#|b)?)(maj7|m7|sus4|sus2|dim|aug|m|7)?(?:\/([A-G](?:#|b)?))?$/,
    );
  if (!match) {
    return { root: "", type: "", bass: "", custom: true };
  }

  const [, root, type = "", bass = ""] = match;
  if (
    !ROOT_NOTES.includes(root) ||
    !CHORD_TYPES.includes(type) ||
    (bass && !ROOT_NOTES.includes(bass))
  ) {
    return { root: "", type: "", bass: "", custom: true };
  }

  return { root, type, bass, custom: false };
}

function composeChord({ root, type, bass }) {
  if (!root) {
    return "";
  }
  const quality = type || "";
  const bassPart = bass ? `/${bass}` : "";
  return `${root}${quality}${bassPart}`;
}

function getChordIntervals(type) {
  switch (type) {
    case "m":
      return [0, 3, 7];
    case "7":
      return [0, 4, 7, 10];
    case "m7":
      return [0, 3, 7, 10];
    case "maj7":
      return [0, 4, 7, 11];
    case "sus4":
      return [0, 5, 7];
    case "sus2":
      return [0, 2, 7];
    case "dim":
      return [0, 3, 6];
    case "aug":
      return [0, 4, 8];
    default:
      return [0, 4, 7];
  }
}

function getInversionOptions(root, type) {
  if (!root) {
    return [];
  }
  const rootIndex = NOTE_INDEX[root];
  if (rootIndex === undefined) {
    return [];
  }

  const preferFlat = root.includes("b");
  const notes = preferFlat ? FLAT_NOTES : SHARP_NOTES;
  const intervals = getChordIntervals(type);
  const chordNotes = intervals.map(
    (interval) => notes[(rootIndex + interval) % 12],
  );

  const options = [{ id: EMPTY_INVERSION, label: "بدون Inversion" }];
  if (chordNotes[1]) options.push({ id: "first", label: "1st Inversion" });
  if (chordNotes[2]) options.push({ id: "second", label: "2nd Inversion" });
  if (chordNotes[3]) options.push({ id: "third", label: "3rd Inversion" });
  return options;
}

function ChordPicker({
  value,
  inversion,
  onChange,
  onInversionChange,
  compact = false,
}) {
  const parts = parseChordParts(value);
  const [customMode, setCustomMode] = useState(value === "X" || parts.custom);
  const bassSelectValue = parts.bass || EMPTY_BASS;
  const inversionOptions = getInversionOptions(parts.root, parts.type);
  const inversionValue = inversionOptions.some(
    (option) => option.id === inversion,
  )
    ? inversion
    : EMPTY_INVERSION;

  if (customMode) {
    const customInversionValue = ["first", "second", "third"].includes(
      inversion,
    )
      ? inversion
      : EMPTY_INVERSION;
    const customValue = value === "X" ? "" : value || "";
    const suggestions = customChordSuggestions(customValue);
    const chordLooksValid = !customValue || isExtendedChordLike(customValue);

    const commitCustomValue = (nextValue = customValue) => {
      const trimmed = String(nextValue || "").trim();
      onChange(trimmed || "X");
    };

    return (
      <div className="chordBuilder chordBuilderCustom">
        <div className="customChordInputWrap">
          <input
            className={`input chordInput chordCustomInput ${chordLooksValid ? "" : "invalid"}`}
            value={customValue}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                commitCustomValue();
              }
            }}
            placeholder="اكتب الكورد مثل Gadd9 أو Bm7b5"
            aria-label="كورد مخصص"
            autoComplete="off"
          />
          {suggestions.length > 0 ? (
            <div className="customChordSuggestions" role="listbox">
              {suggestions.slice(0, 8).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="customChordSuggestion"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitCustomValue(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <select
          className="input chordInput chordSelect"
          value={customInversionValue}
          onChange={(e) =>
            onInversionChange(
              e.target.value === EMPTY_INVERSION ? "" : e.target.value,
            )
          }
          aria-label="انقلاب الكورد"
        >
          {CUSTOM_INVERSION_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="btn chordModeBtn"
          onClick={() => {
            setCustomMode(false);
            onChange("");
          }}
          type="button"
        >
          رجوع للتقسيم
        </button>
      </div>
    );
  }

  return (
    <div className="chordBuilder">
      <div className={`chordParts ${compact ? "compact" : ""}`}>
        <select
          className="input chordInput chordSelect"
          value={parts.root}
          onChange={(e) => {
            const nextRoot = e.target.value;
            const nextChord = composeChord({
              root: nextRoot,
              type: parts.type,
              bass: parts.bass,
            });
            onChange(nextChord);
          }}
        >
          <option value="">النغمة</option>
          {ROOT_NOTES.map((note) => (
            <option key={note} value={note}>
              {note}
            </option>
          ))}
        </select>
        <select
          className="input chordInput chordSelect"
          value={parts.type}
          onChange={(e) => {
            const nextType = e.target.value;
            const nextChord = composeChord({
              root: parts.root,
              type: nextType,
              bass: parts.bass,
            });
            onChange(nextChord);
          }}
        >
          <option value="">Major</option>
          {CHORD_TYPES.filter(Boolean).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select
          className="input chordInput chordSelect"
          value={bassSelectValue}
          onChange={(e) => {
            const nextBass = e.target.value === EMPTY_BASS ? "" : e.target.value;
            const nextChord = composeChord({
              root: parts.root,
              type: parts.type,
              bass: nextBass,
            });
            onChange(nextChord);
          }}
        >
          <option value={EMPTY_BASS}>بدون Bass</option>
          {ROOT_NOTES.map((note) => (
            <option key={note} value={note}>
              /{note}
            </option>
          ))}
        </select>
        <select
          className="input chordInput chordSelect"
          value={inversionValue}
          onChange={(e) =>
            onInversionChange(
              e.target.value === EMPTY_INVERSION ? "" : e.target.value,
            )
          }
          disabled={!parts.root}
        >
          {inversionOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button
        className="btn chordModeBtn"
        onClick={() => {
          setCustomMode(true);
          onChange(value || "X");
        }}
        type="button"
      >
        كورد مخصص
      </button>
    </div>
  );
}

function getEditorId(lineId, kind, wordIndex, slotIndex = -1) {
  return `${lineId}:${kind}:${wordIndex}:${slotIndex}`;
}

function linePreviewSnippet(text, maxLen = 58) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "فارغ…";
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

function HymnEditor() {
  const {
    state,
    updateHymn,
    addSection,
    removeSection,
    updateSectionTitle,
    addLine,
    removeLine,
    updateLine,
    transposeHymn,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHymnStore();
  const { hymn } = state;
  const [activeEditorId, setActiveEditorId] = useState("");
  const [openSectionId, setOpenSectionId] = useState(
    () => hymn.sections[0]?.id ?? null,
  );
  const [openLineId, setOpenLineId] = useState(
    () => hymn.sections[0]?.lines[0]?.id ?? null,
  );
  const sectionCount = useMemo(
    () => hymn.sections.length,
    [hymn.sections.length],
  );

  useEffect(() => {
    if (!hymn.sections.length) {
      setOpenSectionId(null);
      return;
    }
    setOpenSectionId((prev) =>
      prev && hymn.sections.some((s) => s.id === prev)
        ? prev
        : hymn.sections[0].id,
    );
  }, [hymn.sections]);

  useEffect(() => {
    if (!openSectionId) {
      setOpenLineId(null);
      return;
    }
    const section = hymn.sections.find((s) => s.id === openSectionId);
    if (!section || !section.lines.length) {
      setOpenLineId(null);
      return;
    }
    setOpenLineId((prev) =>
      prev && section.lines.some((line) => line.id === prev)
        ? prev
        : section.lines[0].id,
    );
  }, [hymn.sections, openSectionId]);

  return (
    <section className="card">
      <div className="row between editorToolbar">
        <h2>وضع التعديل</h2>
        <div className="row wrap">
          <button
            type="button"
            className="btn"
            onClick={undo}
            disabled={!canUndo}
            title="Ctrl+Z"
          >
            تراجع
          </button>
          <button
            type="button"
            className="btn"
            onClick={redo}
            disabled={!canRedo}
            title="Ctrl+Y"
          >
            إعادة
          </button>
        </div>
      </div>
      <div className="metaGrid">
        <input
          className="input modernInput"
          value={hymn.title}
          onChange={(e) => updateHymn({ title: e.target.value })}
          placeholder="عنوان الترانيمة"
        />
        <input
          className="input modernInput"
          value={hymn.key}
          onChange={(e) => updateHymn({ key: e.target.value })}
          placeholder="المقام (Key)"
        />
      </div>
      <div className="row wrap transposeRow">
        <button
          className="btn"
          onClick={() => transposeHymn(-1)}
          title="Transpose -1 semitone"
          aria-label="Transpose down"
        >
          -
        </button>
        <button
          className="btn"
          onClick={() => transposeHymn(1)}
          title="Transpose +1 semitone"
          aria-label="Transpose up"
        >
          +
        </button>
      </div>

      {hymn.sections.map((section, secIndex) => {
        const sectionOpen = openSectionId === section.id;
        return (
          <article
            key={section.id}
            className={`sectionCard modernCard ${sectionOpen ? "sectionAccordionOpen" : ""}`}
          >
            <div className="row between sectionHeaderRow sectionAccordionHead">
              <button
                type="button"
                className={`btn sectionAccordionToggle ${sectionOpen ? "sectionAccordionToggleOpen" : ""}`}
                aria-expanded={sectionOpen}
                title={
                  sectionOpen
                    ? "القسم مفتوح"
                    : "افتح هذا القسم (يتم طيّ الأقسام الأخرى تلقائيًا)"
                }
                onClick={() => {
                  setOpenSectionId(section.id);
                  setActiveEditorId("");
                  setOpenLineId(section.lines[0]?.id ?? null);
                }}
              >
                <span className="sectionAccordionChevron" aria-hidden>
                  {sectionOpen ? "▼" : "▶"}
                </span>
              </button>
              <input
                className="input modernInput sectionAccordionTitleInput"
                value={section.title}
                onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                placeholder={`اسم القسم ${secIndex + 1}`}
              />
              <button
                className="btn danger deleteSectionBtn"
                type="button"
                onClick={() => removeSection(section.id)}
                disabled={sectionCount <= 1}
              >
                حذف القسم
              </button>
            </div>

            {!sectionOpen ? (
              <p className="sectionAccordionMuted">
                {section.lines.length} سطر في هذا القسم — اضغط السهم لعرض الأسطر
                وتعديلها.
              </p>
            ) : (
              <>
                {section.lines.map((line, lineIndex) => {
                  const normalizedLine = normalizeLineStructure(line);
                  const words = splitWords(normalizedLine.lyrics);
                  const lineOpen = openLineId === line.id;

                  if (!lineOpen) {
                    return (
                      <div
                        key={line.id}
                        className="lineEditorCollapsed row between wrap"
                      >
                        <button
                          type="button"
                          className="lineEditorSummaryBtn"
                          onClick={() => {
                            setOpenSectionId(section.id);
                            setOpenLineId(line.id);
                            setActiveEditorId("");
                          }}
                        >
                          <span className="lineEditorSummaryIndex">
                            السطر {lineIndex + 1}
                          </span>
                          <span className="lineEditorSummarySnippet">
                            {linePreviewSnippet(normalizedLine.lyrics)}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn ghost lineEditorSummaryDelete"
                          onClick={() => removeLine(section.id, line.id)}
                        >
                          حذف
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={line.id}
                      className="lineEditor modernLineEditor lineEditorExpanded"
                    >
                      <label>السطر {lineIndex + 1} - اكتب الكلمات كاملة</label>
                      <textarea
                        className="input textarea modernInput"
                        value={normalizedLine.lyrics}
                        onChange={(e) =>
                          updateLine(section.id, line.id, {
                            lyrics: e.target.value,
                          })
                        }
                        placeholder="اكتب كلمات السطر هنا"
                      />

                      {words.length === 0 ? (
                        <div className="emptyHint">
                          اكتب كلمات السطر الأول، وبعدها ستظهر خانات الكورد فوق
                          كل كلمة.
                        </div>
                      ) : (
                        <>
                          <label>
                            الكوردات فوق الكلمات + إضافة كورد قبل/بعد أي كلمة
                          </label>
                          <div className="wordComposer">
                            {words.map((word, wordIndex) => (
                              <div
                                key={`${line.id}-${wordIndex}`}
                                className="wordBlockWrap"
                              >
                                <div className="gapEditor">
                                  <button
                                    className="miniAddBtn"
                                    onClick={() => {
                                      const nextBeforeWordChords =
                                        normalizedLine.beforeWordChords.map(
                                          (group) => [...group],
                                        );
                                      nextBeforeWordChords[wordIndex] = [
                                        ...(nextBeforeWordChords[wordIndex] ||
                                          []),
                                        "",
                                      ];
                                      const nextBeforeWordInversions =
                                        normalizedLine.beforeWordInversions.map(
                                          (group) => [...group],
                                        );
                                      nextBeforeWordInversions[wordIndex] = [
                                        ...(nextBeforeWordInversions[
                                          wordIndex
                                        ] || []),
                                        "",
                                      ];
                                      updateLine(section.id, line.id, {
                                        beforeWordChords: nextBeforeWordChords,
                                        beforeWordInversions:
                                          nextBeforeWordInversions,
                                      });
                                    }}
                                  >
                                    + قبل
                                  </button>

                                  <div className="gapSlotList">
                                    {(
                                      normalizedLine.beforeWordChords[
                                        wordIndex
                                      ] || []
                                    ).map((beforeChord, slotIndex) => (
                                      <button
                                        key={`${line.id}-before-${wordIndex}-${slotIndex}`}
                                        className="gapTokenBtn"
                                        type="button"
                                        onClick={() =>
                                          setActiveEditorId(
                                            getEditorId(
                                              line.id,
                                              "before",
                                              wordIndex,
                                              slotIndex,
                                            ),
                                          )
                                        }
                                      >
                                        {formatChordLabel(
                                          beforeChord,
                                          normalizedLine.beforeWordInversions[
                                            wordIndex
                                          ]?.[slotIndex] || "",
                                        ) || `قبل ${slotIndex + 1}`}
                                      </button>
                                    ))}
                                  </div>
                                  {(() => {
                                    const activeBeforeIndex = (
                                      normalizedLine.beforeWordChords[
                                        wordIndex
                                      ] || []
                                    ).findIndex(
                                      (_, slotIndex) =>
                                        activeEditorId ===
                                        getEditorId(
                                          line.id,
                                          "before",
                                          wordIndex,
                                          slotIndex,
                                        ),
                                    );
                                    if (activeBeforeIndex === -1) return null;
                                    return (
                                      <div className="inlineEditorPanel">
                                        <ChordPicker
                                          value={
                                            normalizedLine.beforeWordChords[
                                              wordIndex
                                            ][activeBeforeIndex] || ""
                                          }
                                          inversion={
                                            normalizedLine.beforeWordInversions[
                                              wordIndex
                                            ]?.[activeBeforeIndex] || ""
                                          }
                                          compact
                                          onChange={(nextChord) => {
                                            const nextBeforeWordChords =
                                              normalizedLine.beforeWordChords.map(
                                                (group) => [...group],
                                              );
                                            nextBeforeWordChords[wordIndex][
                                              activeBeforeIndex
                                            ] = nextChord;
                                            updateLine(section.id, line.id, {
                                              beforeWordChords:
                                                nextBeforeWordChords,
                                            });
                                          }}
                                          onInversionChange={(
                                            nextInversion,
                                          ) => {
                                            const nextBeforeWordInversions =
                                              normalizedLine.beforeWordInversions.map(
                                                (group) => [...group],
                                              );
                                            nextBeforeWordInversions[wordIndex][
                                              activeBeforeIndex
                                            ] = nextInversion;
                                            updateLine(section.id, line.id, {
                                              beforeWordInversions:
                                                nextBeforeWordInversions,
                                            });
                                          }}
                                        />
                                        <div className="row wrap">
                                          <button
                                            className="btn chordModeBtn"
                                            type="button"
                                            onClick={() =>
                                              setActiveEditorId("")
                                            }
                                          >
                                            تم
                                          </button>
                                          <button
                                            className="btn chordModeBtn danger"
                                            type="button"
                                            onClick={() => {
                                              const nextBeforeWordChords =
                                                normalizedLine.beforeWordChords.map(
                                                  (group) => [...group],
                                                );
                                              nextBeforeWordChords[
                                                wordIndex
                                              ].splice(activeBeforeIndex, 1);
                                              const nextBeforeWordInversions =
                                                normalizedLine.beforeWordInversions.map(
                                                  (group) => [...group],
                                                );
                                              nextBeforeWordInversions[
                                                wordIndex
                                              ].splice(activeBeforeIndex, 1);
                                              updateLine(section.id, line.id, {
                                                beforeWordChords:
                                                  nextBeforeWordChords,
                                                beforeWordInversions:
                                                  nextBeforeWordInversions,
                                              });
                                              setActiveEditorId("");
                                            }}
                                          >
                                            حذف
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>

                                <div className="wordChordCell word">
                                  <div className="letterEditorRun">
                                    {splitWordLetters(word).map(
                                      (letter, letterIndex) => {
                                        const chordGroup =
                                          normalizedLine.wordLetterChords[
                                            wordIndex
                                          ]?.[letterIndex] || [];
                                        const inversionGroup =
                                          normalizedLine.wordLetterInversions[
                                            wordIndex
                                          ]?.[letterIndex] || [];
                                        return (
                                          <div
                                            className="letterEditorCell"
                                            key={`${line.id}-letter-${wordIndex}-${letterIndex}`}
                                          >
                                            <div className="letterChordSlotList">
                                              {chordGroup.map(
                                                (chord, chordIndex) => (
                                                  <button
                                                    key={`${line.id}-letter-chord-${wordIndex}-${letterIndex}-${chordIndex}`}
                                                    className="wordTokenBtn"
                                                    type="button"
                                                    onClick={() =>
                                                      setActiveEditorId(
                                                        getEditorId(
                                                          line.id,
                                                          "letter",
                                                          wordIndex,
                                                          letterIndex * 100 +
                                                            chordIndex,
                                                        ),
                                                      )
                                                    }
                                                  >
                                                    <span className="wordTokenChord">
                                                      {formatChordLabel(
                                                        chord,
                                                        inversionGroup[
                                                          chordIndex
                                                        ] || "",
                                                      ) ||
                                                        `كورد ${chordIndex + 1}`}
                                                    </span>
                                                  </button>
                                                ),
                                              )}
                                            </div>
                                            <span className="letterLabel">
                                              {letter}
                                            </span>
                                            <button
                                              className="miniAddBtn wordChordAddBtn"
                                              type="button"
                                              onClick={() => {
                                                const nextChords =
                                                  normalizedLine.wordLetterChords.map(
                                                    (group) =>
                                                      group.map((letters) => [
                                                        ...letters,
                                                      ]),
                                                  );
                                                const nextInversions =
                                                  normalizedLine.wordLetterInversions.map(
                                                    (group) =>
                                                      group.map((letters) => [
                                                        ...letters,
                                                      ]),
                                                  );
                                                nextChords[wordIndex][
                                                  letterIndex
                                                ] = [...chordGroup, ""];
                                                nextInversions[wordIndex][
                                                  letterIndex
                                                ] = [...inversionGroup, ""];
                                                updateLine(
                                                  section.id,
                                                  line.id,
                                                  {
                                                    wordLetterChords:
                                                      nextChords,
                                                    wordLetterInversions:
                                                      nextInversions,
                                                  },
                                                );
                                              }}
                                            >
                                              +
                                            </button>
                                            {chordGroup.map((_, chordIndex) => {
                                              const editorId = getEditorId(
                                                line.id,
                                                "letter",
                                                wordIndex,
                                                letterIndex * 100 + chordIndex,
                                              );
                                              if (activeEditorId !== editorId)
                                                return null;
                                              return (
                                                <div
                                                  className="inlineEditorPanel"
                                                  key={`${editorId}-panel`}
                                                >
                                                  <ChordPicker
                                                    value={
                                                      chordGroup[chordIndex] ||
                                                      ""
                                                    }
                                                    inversion={
                                                      inversionGroup[
                                                        chordIndex
                                                      ] || ""
                                                    }
                                                    onChange={(nextChord) => {
                                                      const nextChords =
                                                        normalizedLine.wordLetterChords.map(
                                                          (group) =>
                                                            group.map(
                                                              (letters) => [
                                                                ...letters,
                                                              ],
                                                            ),
                                                        );
                                                      nextChords[wordIndex][
                                                        letterIndex
                                                      ][chordIndex] = nextChord;
                                                      updateLine(
                                                        section.id,
                                                        line.id,
                                                        {
                                                          wordLetterChords:
                                                            nextChords,
                                                        },
                                                      );
                                                    }}
                                                    onInversionChange={(
                                                      nextInversion,
                                                    ) => {
                                                      const nextInversions =
                                                        normalizedLine.wordLetterInversions.map(
                                                          (group) =>
                                                            group.map(
                                                              (letters) => [
                                                                ...letters,
                                                              ],
                                                            ),
                                                        );
                                                      nextInversions[wordIndex][
                                                        letterIndex
                                                      ][chordIndex] =
                                                        nextInversion;
                                                      updateLine(
                                                        section.id,
                                                        line.id,
                                                        {
                                                          wordLetterInversions:
                                                            nextInversions,
                                                        },
                                                      );
                                                    }}
                                                  />
                                                  <div className="row wrap">
                                                    <button
                                                      className="btn chordModeBtn"
                                                      type="button"
                                                      onClick={() =>
                                                        setActiveEditorId("")
                                                      }
                                                    >
                                                      تم
                                                    </button>
                                                    <button
                                                      className="btn chordModeBtn danger"
                                                      type="button"
                                                      onClick={() => {
                                                        const nextChords =
                                                          normalizedLine.wordLetterChords.map(
                                                            (group) =>
                                                              group.map(
                                                                (letters) => [
                                                                  ...letters,
                                                                ],
                                                              ),
                                                          );
                                                        const nextInversions =
                                                          normalizedLine.wordLetterInversions.map(
                                                            (group) =>
                                                              group.map(
                                                                (letters) => [
                                                                  ...letters,
                                                                ],
                                                              ),
                                                          );
                                                        nextChords[wordIndex][
                                                          letterIndex
                                                        ].splice(chordIndex, 1);
                                                        nextInversions[
                                                          wordIndex
                                                        ][letterIndex].splice(
                                                          chordIndex,
                                                          1,
                                                        );
                                                        updateLine(
                                                          section.id,
                                                          line.id,
                                                          {
                                                            wordLetterChords:
                                                              nextChords,
                                                            wordLetterInversions:
                                                              nextInversions,
                                                          },
                                                        );
                                                        setActiveEditorId("");
                                                      }}
                                                    >
                                                      حذف
                                                    </button>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      },
                                    )}
                                  </div>
                                  <span className="wordLabel">{word}</span>
                                </div>

                                <div className="gapEditor">
                                  <button
                                    className="miniAddBtn"
                                    onClick={() => {
                                      const nextAfterWordChords =
                                        normalizedLine.afterWordChords.map(
                                          (group) => [...group],
                                        );
                                      nextAfterWordChords[wordIndex] = [
                                        ...(nextAfterWordChords[wordIndex] ||
                                          []),
                                        "",
                                      ];
                                      const nextAfterWordInversions =
                                        normalizedLine.afterWordInversions.map(
                                          (group) => [...group],
                                        );
                                      nextAfterWordInversions[wordIndex] = [
                                        ...(nextAfterWordInversions[
                                          wordIndex
                                        ] || []),
                                        "",
                                      ];
                                      updateLine(section.id, line.id, {
                                        afterWordChords: nextAfterWordChords,
                                        afterWordInversions:
                                          nextAfterWordInversions,
                                      });
                                    }}
                                  >
                                    + بعد
                                  </button>

                                  <div className="gapSlotList">
                                    {(
                                      normalizedLine.afterWordChords[
                                        wordIndex
                                      ] || []
                                    ).map((afterChord, slotIndex) => (
                                      <button
                                        key={`${line.id}-after-${wordIndex}-${slotIndex}`}
                                        className="gapTokenBtn"
                                        type="button"
                                        onClick={() =>
                                          setActiveEditorId(
                                            getEditorId(
                                              line.id,
                                              "after",
                                              wordIndex,
                                              slotIndex,
                                            ),
                                          )
                                        }
                                      >
                                        {formatChordLabel(
                                          afterChord,
                                          normalizedLine.afterWordInversions[
                                            wordIndex
                                          ]?.[slotIndex] || "",
                                        ) || `بعد ${slotIndex + 1}`}
                                      </button>
                                    ))}
                                  </div>
                                  {(() => {
                                    const activeAfterIndex = (
                                      normalizedLine.afterWordChords[
                                        wordIndex
                                      ] || []
                                    ).findIndex(
                                      (_, slotIndex) =>
                                        activeEditorId ===
                                        getEditorId(
                                          line.id,
                                          "after",
                                          wordIndex,
                                          slotIndex,
                                        ),
                                    );
                                    if (activeAfterIndex === -1) return null;
                                    return (
                                      <div className="inlineEditorPanel">
                                        <ChordPicker
                                          value={
                                            normalizedLine.afterWordChords[
                                              wordIndex
                                            ][activeAfterIndex] || ""
                                          }
                                          inversion={
                                            normalizedLine.afterWordInversions[
                                              wordIndex
                                            ]?.[activeAfterIndex] || ""
                                          }
                                          compact
                                          onChange={(nextChord) => {
                                            const nextAfterWordChords =
                                              normalizedLine.afterWordChords.map(
                                                (group) => [...group],
                                              );
                                            nextAfterWordChords[wordIndex][
                                              activeAfterIndex
                                            ] = nextChord;
                                            updateLine(section.id, line.id, {
                                              afterWordChords:
                                                nextAfterWordChords,
                                            });
                                          }}
                                          onInversionChange={(
                                            nextInversion,
                                          ) => {
                                            const nextAfterWordInversions =
                                              normalizedLine.afterWordInversions.map(
                                                (group) => [...group],
                                              );
                                            nextAfterWordInversions[wordIndex][
                                              activeAfterIndex
                                            ] = nextInversion;
                                            updateLine(section.id, line.id, {
                                              afterWordInversions:
                                                nextAfterWordInversions,
                                            });
                                          }}
                                        />
                                        <div className="row wrap">
                                          <button
                                            className="btn chordModeBtn"
                                            type="button"
                                            onClick={() =>
                                              setActiveEditorId("")
                                            }
                                          >
                                            تم
                                          </button>
                                          <button
                                            className="btn chordModeBtn danger"
                                            type="button"
                                            onClick={() => {
                                              const nextAfterWordChords =
                                                normalizedLine.afterWordChords.map(
                                                  (group) => [...group],
                                                );
                                              nextAfterWordChords[
                                                wordIndex
                                              ].splice(activeAfterIndex, 1);
                                              const nextAfterWordInversions =
                                                normalizedLine.afterWordInversions.map(
                                                  (group) => [...group],
                                                );
                                              nextAfterWordInversions[
                                                wordIndex
                                              ].splice(activeAfterIndex, 1);
                                              updateLine(section.id, line.id, {
                                                afterWordChords:
                                                  nextAfterWordChords,
                                                afterWordInversions:
                                                  nextAfterWordInversions,
                                              });
                                              setActiveEditorId("");
                                            }}
                                          >
                                            حذف
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      <div className="row end">
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => removeLine(section.id, line.id)}
                        >
                          حذف السطر
                        </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  className="btn"
                  type="button"
                  onClick={() => addLine(section.id)}
                >
                  + إضافة سطر
                </button>
              </>
            )}
          </article>
        );
      })}

      <button className="btn primary" onClick={addSection}>
        + إضافة قسم
      </button>
    </section>
  );
}

export default HymnEditor;
