import {
  formatChordLabel,
  getChordEffectiveInversion,
  getChordOrderedNoteNames,
  transposeChord,
} from "./chords.js";

export function getTransposeLabel(value = 0) {
  const offset = Number(value) || 0;
  if (offset === 0) return "0";
  return `${offset > 0 ? "+" : ""}${offset}`;
}

export function getDisplayedKey(baseKey = "", transposeOffset = 0) {
  if (!baseKey) return "";
  const offset = Number(transposeOffset) || 0;
  if (offset === 0) return baseKey;
  return transposeChord(baseKey, offset);
}

export function getChordPianoInfo(chord, inversion = "") {
  const value = String(chord || "").trim();
  if (!value) {
    return {
      root: "",
      quality: "",
      bass: "",
      inversion: "",
      notes: [],
      label: "",
    };
  }

  const [head = "", bass = ""] = value.split("/");
  const match = String(head || "").match(/^([A-G](?:#|b)?)(.*)$/);
  if (!match) {
    return {
      root: "",
      quality: "",
      bass: "",
      inversion: "",
      notes: [],
      label: formatChordLabel(value, inversion),
    };
  }

  const root = match[1];
  const rawQuality = String(match[2] || "").replace(
    /\s*(?:1st|2nd|3rd|first|second|third)\s*$/i,
    "",
  );
  const bassNote = bass ? String(bass).trim() : "";
  const effectiveInversion = getChordEffectiveInversion(value, inversion);
  const noteNames = getChordOrderedNoteNames(value, inversion);
  const orderedNotes = [root];
  for (const note of noteNames) {
    if (note !== root && !orderedNotes.includes(note)) {
      orderedNotes.push(note);
    }
  }

  return {
    root,
    quality: rawQuality,
    bass: bassNote,
    inversion: effectiveInversion,
    notes: orderedNotes,
    label: formatChordLabel(value, inversion),
  };
}
