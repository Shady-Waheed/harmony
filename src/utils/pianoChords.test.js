import { describe, expect, it } from "vitest";
import { transposeHymnShape } from "../store/hymnStore.jsx";
import { getChordVoicingKeyIndexes } from "./chords.js";
import {
  getChordPianoInfo,
  getDisplayedKey,
  getTransposeLabel,
} from "./pianoChords.js";

describe("piano musician tools", () => {
  it("derives the currently displayed key without mutating the canonical hymn", () => {
    const hymn = {
      id: "hymn-1",
      title: "Test hymn",
      key: "G",
      sections: [
        {
          id: "sec-1",
          title: "Section 1",
          lines: [
            {
              id: "line-1",
              lyrics: "Hello",
              wordChords: ["G", "C", "D", "G"],
              gapChords: [[], [], [], []],
            },
          ],
        },
      ],
    };

    const transposed = transposeHymnShape(hymn, 2);

    expect(getDisplayedKey("G", 2)).toBe("A");
    expect(transposed.key).toBe("A");
    expect(hymn.key).toBe("G");
    expect(hymn.sections[0].lines[0].wordChords[0]).toBe("G");
  });

  it("maps common chords to their piano note names", () => {
    expect(getChordPianoInfo("C").notes).toEqual(["C", "E", "G"]);
    expect(getChordPianoInfo("Cm").notes).toEqual(["C", "D#", "G"]);
    expect(getChordPianoInfo("Cmaj7").notes).toEqual(["C", "E", "G", "B"]);
    expect(getChordPianoInfo("G/B").bass).toBe("B");
    expect(getChordPianoInfo("G/B").notes).toEqual(["G", "B", "D"]);
    expect(getChordPianoInfo("C/E").bass).toBe("E");
    expect(getChordPianoInfo("C/E").notes).toEqual(["C", "E", "G"]);
  });

  it("includes added tones and extended chord tones in note and keyboard previews", () => {
    const cases = [
      ["Cadd2", ["C", "D", "E", "G"]],
      ["Cadd4", ["C", "E", "F", "G"]],
      ["Cadd9", ["C", "E", "G", "D"]],
      ["Cadd11", ["C", "E", "G", "F"]],
      ["Cadd13", ["C", "E", "G", "A"]],
      ["Csus2", ["C", "D", "G"]],
      ["Csus4", ["C", "F", "G"]],
      ["Cdim", ["C", "D#", "F#"]],
      ["Caug", ["C", "E", "G#"]],
      ["C6", ["C", "E", "G", "A"]],
      ["C7", ["C", "E", "G", "A#"]],
      ["Cm7", ["C", "D#", "G", "A#"]],
      ["Cmaj9", ["C", "E", "G", "B", "D"]],
      ["Cmaj11", ["C", "E", "G", "B", "D", "F"]],
      ["Cmaj13", ["C", "E", "G", "B", "D", "F", "A"]],
      ["Cm9", ["C", "D#", "G", "A#", "D"]],
      ["Cm11", ["C", "D#", "G", "A#", "D", "F"]],
      ["Cm13", ["C", "D#", "G", "A#", "D", "F", "A"]],
      ["Cm7b5", ["C", "Eb", "Gb", "Bb"]],
      ["Cdim7", ["C", "D#", "F#", "A"]],
      ["C7b5", ["C", "E", "Gb", "Bb"]],
      ["C7#5", ["C", "E", "G#", "A#"]],
      ["C7b9", ["C", "E", "G", "Bb", "Db"]],
      ["C7b13", ["C", "E", "G", "Bb", "Ab"]],
      ["C7#9", ["C", "E", "G", "A#", "D#"]],
      ["C11", ["C", "E", "G", "A#", "D", "F"]],
      ["C7#11", ["C", "E", "G", "A#", "F#"]],
      ["C13", ["C", "E", "G", "A#", "D", "F", "A"]],
    ];

    for (const [chord, notes] of cases) {
      expect(getChordPianoInfo(chord).notes, chord).toEqual(notes);
    }

    expect(getChordPianoInfo("Gadd2").notes).toEqual(["G", "A", "B", "D"]);
    expect(getChordVoicingKeyIndexes("Gadd2")).toEqual([7, 9, 11, 14]);
  });

  it("supports compact transpose labels and reset states", () => {
    expect(getTransposeLabel(-2)).toBe("-2");
    expect(getTransposeLabel(0)).toBe("0");
    expect(getTransposeLabel(3)).toBe("+3");
  });
});
