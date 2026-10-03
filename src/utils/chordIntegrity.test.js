import { describe, expect, it } from "vitest";
import { normalizeLineStructure, buildDisplayCells } from "./lineChords.js";
import {
  formatChordLabel,
  getChordEffectiveInversion,
  transposeChord,
} from "./chords.js";
import {
  decodeStoredHymn,
  encodeHymnForFirestore,
  normalizeCanonicalHymn,
} from "./hymnFirestore.js";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

describe("line chord normalization", () => {
  it("preserves plain Arabic text without unexpected chord slots", () => {
    const line = { lyrics: "يا سيدي أنت؟" };
    const normalized = normalizeLineStructure(line);

    expect(normalized.lyrics).toBe("يا سيدي أنت؟");
    expect(normalized.wordChords).toEqual(["", "", ""]);
    expect(normalized.wordChordGroups).toEqual([[], [], []]);
  });

  it("keeps word chords attached to the correct words in order", () => {
    const line = { lyrics: "يا سيدي", wordChords: ["C", "G"] };
    const normalized = normalizeLineStructure(line);

    expect(normalized.wordChords).toEqual(["C", "G"]);
    expect(normalized.wordChordGroups).toEqual([["C"], ["G"]]);
    expect(normalized.wordLetterChords[0][0]).toEqual(["C"]);
    expect(normalized.wordLetterChords[1][0]).toEqual(["G"]);
  });

  it("preserves multiple chords attached to the same word without collapsing order", () => {
    const line = {
      lyrics: "يا",
      wordChordGroups: [["C", "G", "Am"]],
    };
    const normalized = normalizeLineStructure(line);

    expect(normalized.wordChordGroups).toEqual([["C", "G", "Am"]]);
    expect(normalized.wordInversions).toEqual([["", "", ""]]);
    expect(normalized.wordLetterChords[0][0]).toEqual(["C"]);
    expect(normalized.wordLetterChords[0][1]).toEqual(["G", "Am"]);
  });

  it("keeps letter-level chord placement stable for specific Arabic characters", () => {
    const line = {
      lyrics: "يا",
      wordLetterChords: [[["C"], ["G"]]],
    };
    const normalized = normalizeLineStructure(line);

    expect(normalized.wordLetterChords[0][0]).toEqual(["C"]);
    expect(normalized.wordLetterChords[0][1]).toEqual(["G"]);
    expect(normalized.wordChordGroups).toEqual([["C", "G"]]);
    expect(normalized.wordChords).toEqual(["C"]);
  });

  it("keeps before, after, and gap chord slots distinct", () => {
    const line = {
      lyrics: "يا سيدي",
      beforeWordChords: [["D"], ["E"]],
      afterWordChords: [["C"], ["F"]],
      gapChords: [["G"]],
    };
    const normalized = normalizeLineStructure(line);

    expect(normalized.beforeWordChords).toEqual([["D"], ["E"]]);
    expect(normalized.afterWordChords).toEqual([["C"], ["F"]]);
    expect(normalized.gapChords).toEqual([["C"]]);
    expect(normalized.gapInversions).toEqual([[""]]);
  });

  it("keeps mixed word, letter, before, after, and gap chord positions intact", () => {
    const line = {
      lyrics: "يا سيدي أنت",
      wordChords: ["C", "G", "Am"],
      wordChordGroups: [["C"], ["G", "Am"], ["F"]],
      beforeWordChords: [["D"], ["E"], ["F"]],
      afterWordChords: [["A"], ["B"], ["C"]],
      gapChords: [["G"], ["Am"]],
      wordLetterChords: [
        [["C"], ["G"]],
        [["Am"], ["F"]],
        [["D"], ["E"]],
      ],
    };
    const normalized = normalizeLineStructure(line);

    expect(normalized.wordChordGroups).toEqual([
      ["C", "G"],
      ["Am", "F"],
      ["D", "E"],
    ]);
    expect(normalized.beforeWordChords.flat()).toEqual(["D", "E", "F"]);
    expect(normalized.afterWordChords.flat()).toEqual(["A", "B", "C"]);
    expect(normalized.gapChords.flat()).toEqual(["A", "B"]);
    expect(buildDisplayCells(normalized).length).toBeGreaterThan(0);
  });

  it("does not mutate the input lyrics while normalizing chord data", () => {
    const line = {
      lyrics: "أنت؟ ١٢، نعم",
      wordChords: ["F", "C"],
    };
    const original = deepClone(line);

    normalizeLineStructure(line);

    expect(line).toEqual(original);
    expect(line.lyrics).toBe("أنت؟ ١٢، نعم");
  });
});

describe("Arabic text integrity", () => {
  it("leaves real lyric text unchanged across normalization and re-encoding", () => {
    const samples = [
      "يا سيدي أنت؟",
      "أنت نعمتي، يا ربي",
      "١٢ في الطريق",
      "(يا) سيدي، أنت",
    ];

    for (const sample of samples) {
      const line = {
        lyrics: sample,
        wordChords: Array(sample.split(/\s+/).length).fill(""),
      };
      const normalized = normalizeLineStructure(line);
      const hymn = {
        id: "hymn-arabic",
        title: "Arabic",
        key: "G",
        schemaVersion: 2,
        sections: [{ id: "sec", lines: [normalized] }],
      };
      const roundTrip = decodeStoredHymn(encodeHymnForFirestore(hymn));

      expect(normalized.lyrics).toBe(sample);
      expect(roundTrip.sections[0].lines[0].lyrics).toBe(sample);
    }
  });
});

describe("transpose and inversion behavior", () => {
  it("transposes common chord shapes and bass notes correctly", () => {
    expect(transposeChord("C", 1)).toBe("C#");
    expect(transposeChord("C", 2)).toBe("D");
    expect(transposeChord("Db", 1)).toBe("D");
    expect(transposeChord("G", 2)).toBe("A");
    expect(transposeChord("Am", 2)).toBe("Bm");
    expect(transposeChord("Em", 1)).toBe("Fm");
    expect(transposeChord("G/B", 2)).toBe("A/C#");
    expect(transposeChord("Cmaj7/E", 2)).toBe("Dmaj7/F#");
  });

  it("keeps inversion labels and chord formatting stable", () => {
    expect(getChordEffectiveInversion("C", "first")).toBe("first");
    expect(getChordEffectiveInversion("Am", "second")).toBe("second");
    expect(formatChordLabel("C", "first")).toBe("C 1st");
    expect(formatChordLabel("G/B", "first")).toBe("G/B 1st");
  });

  it("transposition and inversion remain consistent when combined", () => {
    const chord = "Cmaj7/E";
    const transposed = transposeChord(chord, 2);
    const formatted = formatChordLabel(transposed, "first");

    expect(transposed).toBe("Dmaj7/F#");
    expect(getChordEffectiveInversion(transposed, "first")).toBe("first");
    expect(formatted).toContain("1st");
  });
});

describe("round-trips and invariants", () => {
  it("keeps canonical hymn semantics stable through encode/decode/normalize", () => {
    const hymn = {
      id: "hymn-rt",
      title: "Round trip",
      key: "G",
      schemaVersion: 2,
      sections: [
        {
          id: "sec-1",
          title: "Section 1",
          lines: [
            {
              id: "line-1",
              lyrics: "يا سيدي أنت",
              wordChords: ["C", "G", "Am"],
              wordChordGroups: [["C"], ["G", "Am"], ["F"]],
              beforeWordChords: [["D"], ["E"], ["F"]],
              afterWordChords: [["A"], ["B"], ["C"]],
              gapChords: [["G"], ["Am"]],
              wordLetterChords: [
                [["C"], ["G"]],
                [["Am"], ["F"]],
                [["D"], ["E"]],
              ],
            },
          ],
        },
      ],
    };

    const canonical = normalizeCanonicalHymn(hymn);
    const persisted = encodeHymnForFirestore(canonical);
    const decoded = decodeStoredHymn(persisted);

    expect(decoded.title).toBe(hymn.title);
    expect(decoded.sections[0].lines[0].lyrics).toBe("يا سيدي أنت");
    expect(decoded.sections[0].lines[0].wordChordGroups).toEqual(
      canonical.sections[0].lines[0].wordChordGroups,
    );
    expect(decoded.sections[0].lines[0].beforeWordChords).toEqual(
      canonical.sections[0].lines[0].beforeWordChords,
    );
  });

  it("is idempotent on normalization and transposition inversion", () => {
    const line = {
      lyrics: "يا سيدي",
      wordChords: ["C", "G"],
      wordChordGroups: [["C"], ["G"]],
    };

    const normalized = normalizeLineStructure(line);
    const reNormalized = normalizeLineStructure(normalized);
    expect(reNormalized).toEqual(normalized);

    const originalChord = "G/B";
    const restored = transposeChord(transposeChord(originalChord, 2), -2);
    expect(restored).toBe(originalChord);
  });

  it("does not mutate the hymns passed into normalize or encode/decode helpers", () => {
    const hymn = {
      id: "hymn-immut",
      title: "No mutation",
      key: "G",
      schemaVersion: 2,
      sections: [
        {
          id: "sec-1",
          lines: [
            {
              id: "line-1",
              lyrics: "يا",
              wordChordGroups: [["C", "G"]],
            },
          ],
        },
      ],
    };
    const original = deepClone(hymn);

    normalizeCanonicalHymn(hymn);
    encodeHymnForFirestore(hymn);
    decodeStoredHymn(hymn);

    expect(hymn).toEqual(original);
  });
});
