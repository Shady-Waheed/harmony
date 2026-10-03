import { describe, expect, it } from "vitest";
import {
  buildHymnSearchIndex,
  filterHymnSearchIndex,
  getHymnKeyOptions,
  normalizeHymnSearchText,
} from "./hymnSearch.js";
import { encodeHymnForFirestore } from "./hymnFirestore.js";

const hymnA = {
  id: "hymn-a",
  title: "يا يسوع الحبيب",
  key: "C",
  sections: [
    {
      title: "العدد الأول",
      lines: [
        {
          lyrics: "أَحِبُّكَ يا يسوع",
          wordChords: ["C", "Am", ""],
          wordChordGroups: [["C", "Cmaj7"], ["Am"], []],
          beforeWordChords: [["C/E", "Gadd9"]],
          afterWordChords: [[], ["F#m"]],
          wordInversions: [["", "first"], [""]],
        },
      ],
    },
    {
      title: "القرار",
      lines: [
        {
          lyrics: "نسبح اسمك",
          wordChords: ["G7", "G/B"],
          wordLetterChords: [[["G7"], ["G/B"]], []],
          gapChords: [["Bb"]],
        },
      ],
    },
  ],
};

const hymnB = {
  id: "hymn-b",
  title: "ترنيمة المساء",
  key: "G",
  sections: [{ lines: [{ lyrics: "سلام ونعمة", wordChords: ["D"] }] }],
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const index = buildHymnSearchIndex([hymnA, hymnB]);

function ids(options = {}) {
  return filterHymnSearchIndex(index, options).map((hymn) => hymn.id);
}

describe("hymn search text normalization", () => {
  it("matches partial titles and collapses repeated whitespace", () => {
    expect(ids({ query: "يا يسوع الحبيب" })).toContain("hymn-a");
    expect(ids({ query: "  يا   يسوع " })).toContain("hymn-a");
    expect(ids({ query: "المساء" })).toContain("hymn-b");
    expect(ids({ query: "نسبح اسمك" })).toContain("hymn-a");
  });

  it("normalizes Arabic hamza forms and removes diacritics for comparison", () => {
    expect(normalizeHymnSearchText("أَحِبُّكَ")).toBe("احبك");
    expect(ids({ query: "احبك" })).toContain("hymn-a");
  });

  it("handles empty lyrics and does not collapse distinct ta marbuta forms", () => {
    expect(
      filterHymnSearchIndex(
        buildHymnSearchIndex([{ id: "empty", title: "", sections: [] }]),
        {
          query: "anything",
        },
      ),
    ).toEqual([]);
    expect(
      normalizeHymnSearchText("رحمة").includes(normalizeHymnSearchText("رحمه")),
    ).toBe(false);
  });
});

describe("hymn key and chord search", () => {
  it.each([
    "C",
    "Am",
    "G7",
    "Cmaj7",
    "G/B",
    "C/E",
    "F#m",
    "Bb",
    "Gadd9",
    "f#m",
  ])("finds chord %s in canonical chord slots", (chord) => {
    expect(ids({ query: chord })).toContain("hymn-a");
  });

  it.each(["C", "G"])("searches canonical key %s", (key) => {
    expect(ids({ query: key })).toContain(key === "C" ? "hymn-a" : "hymn-b");
  });

  it("offers only canonical keys from the supplied hymn collection", () => {
    expect(getHymnKeyOptions(index)).toEqual(["C", "G"]);
  });

  it.each(["C", "G", "Am", "F#m", "Bb"])(
    "uses the canonical key %s for the key filter",
    (key) => {
      const keyIndex = buildHymnSearchIndex([
        { id: "key-match", title: "", key, sections: [] },
        { id: "other-key", title: "", key: "D", sections: [] },
      ]);
      expect(
        filterHymnSearchIndex(keyIndex, { key }).map((hymn) => hymn.id),
      ).toEqual(["key-match"]);
    },
  );

  it("matches chords stored in multiple-word, letter, gap, before, and after slots", () => {
    for (const chord of ["Cmaj7", "G7", "Bb", "C/E", "F#m", "G/B"]) {
      expect(ids({ query: chord })).toContain("hymn-a");
    }
  });

  it("searches chord fields from the encoded Firestore snapshot format", () => {
    const encodedHymn = encodeHymnForFirestore(hymnA);
    const encodedIndex = buildHymnSearchIndex([encodedHymn]);
    for (const chord of ["Cmaj7", "G/B", "C/E", "F#m", "Bb", "Gadd9"]) {
      expect(
        filterHymnSearchIndex(encodedIndex, { query: chord }).map(
          (hymn) => hymn.id,
        ),
      ).toEqual(["hymn-a"]);
    }
  });
});

describe("composable search filters and access boundaries", () => {
  it("combines query, canonical key, favorites, and recent filters with AND", () => {
    const options = {
      query: "يسوع",
      key: "C",
      favoritesOnly: true,
      favoriteIds: ["hymn-a", "hymn-b"],
      recentOnly: true,
      recentIds: ["hymn-a"],
    };
    expect(ids(options)).toEqual(["hymn-a"]);
    expect(ids({ ...options, key: "G" })).toEqual([]);
    expect(ids({ ...options, favoriteIds: ["hymn-b"] })).toEqual([]);
    expect(ids({ ...options, recentIds: [] })).toEqual([]);
  });

  it("keeps Recent results in newest-first order after other filters", () => {
    expect(
      ids({
        recentOnly: true,
        recentIds: ["hymn-b", "hymn-a"],
      }),
    ).toEqual(["hymn-b", "hymn-a"]);
    expect(
      ids({
        recentOnly: true,
        recentIds: ["hymn-b", "hymn-a"],
        favoritesOnly: true,
        favoriteIds: ["hymn-a"],
      }),
    ).toEqual(["hymn-a"]);
  });

  it("preserves supplied hymn order instead of inventing relevance ranking", () => {
    const results = filterHymnSearchIndex(index);
    expect(results.map((hymn) => hymn.id)).toEqual(["hymn-a", "hymn-b"]);
  });

  it("cannot expose a hymn that was excluded before index construction", () => {
    const publicHymn = {
      id: "public",
      title: "Public",
      key: "C",
      sections: [],
    };
    const inaccessible = {
      id: "private",
      title: "Secret title",
      key: "F#m",
      isExclusive: true,
      exclusiveOwnerUid: "owner",
      sections: [{ lines: [{ lyrics: "secret lyric", wordChords: ["G/B"] }] }],
    };
    const currentUser = { uid: "viewer" };
    const availableHymns = [publicHymn, inaccessible].filter((hymn) => {
      if (!hymn.isExclusive && !hymn.exclusiveOwnerUid) return true;
      return hymn.exclusiveOwnerUid === currentUser.uid;
    });
    const accessibleIndex = buildHymnSearchIndex(availableHymns);
    for (const query of ["Secret title", "secret lyric", "F#m", "G/B"]) {
      expect(filterHymnSearchIndex(accessibleIndex, { query })).toEqual([]);
    }
    expect(availableHymns.map((hymn) => hymn.id)).toEqual(["public"]);
  });

  it("does not mutate canonical hymn data while indexing and filtering", () => {
    const original = clone(hymnA);
    const derived = buildHymnSearchIndex([hymnA]);
    filterHymnSearchIndex(derived, {
      query: "G/B",
      key: "C",
      favoritesOnly: true,
      favoriteIds: [hymnA.id],
      recentOnly: true,
      recentIds: [hymnA.id],
    });
    expect(hymnA).toEqual(original);
  });
});
