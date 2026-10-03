import { describe, expect, it } from "vitest";
import { transposeHymnShape } from "../store/hymnStore.jsx";
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

  it("supports compact transpose labels and reset states", () => {
    expect(getTransposeLabel(-2)).toBe("-2");
    expect(getTransposeLabel(0)).toBe("0");
    expect(getTransposeLabel(3)).toBe("+3");
  });
});
