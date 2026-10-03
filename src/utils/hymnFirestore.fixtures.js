export const simpleHymnFixture = {
  id: "fixture-simple",
  title: "Simple hymn",
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
          wordChords: ["G", "Am", "F"],
          wordChordGroups: [["G"], ["Am"], ["F"]],
          wordInversions: [[""], ["first"], [""]],
          beforeWordChords: [["D"]],
          afterWordChords: [["C"]],
          gapChords: [["E"]],
        },
      ],
    },
  ],
};

export const multiChordWordFixture = {
  id: "fixture-multi-word",
  title: "Multi chord word",
  key: "C",
  schemaVersion: 2,
  sections: [
    {
      id: "sec-1",
      title: "Section 1",
      lines: [
        {
          id: "line-1",
          lyrics: "يا محب",
          wordChords: ["C", "G"],
          wordChordGroups: [
            ["C", "G"],
            ["Am", "F"],
          ],
          wordLetterChords: [
            [["C"], ["G"]],
            [["Am"], ["F"]],
          ],
          gapChords: [["D"]],
        },
      ],
    },
  ],
};

export const mixedChordFixture = {
  id: "fixture-mixed",
  title: "Mixed formation",
  key: "D",
  schemaVersion: 2,
  sections: [
    {
      id: "sec-1",
      title: "Section 1",
      lines: [
        {
          id: "line-1",
          lyrics: "سأحفظك في كل حين",
          wordChords: ["D", "G", "A", "Bm"],
          wordChordGroups: [["D"], ["G", "A"], ["Bm"], ["D"]],
          beforeWordChords: [["F"], ["E"], ["D"], ["G"]],
          afterWordChords: [["C"], ["D"], ["A"], ["G"]],
          gapChords: [["E"], ["A"], ["C"]],
          wordLetterChords: [
            [["D"], ["F"]],
            [["G"], ["A"]],
            [["Bm"], ["D"]],
            [["E"], ["G"]],
          ],
        },
      ],
    },
  ],
};

export const legacyMissingSchemaFixture = {
  id: "fixture-legacy-no-version",
  title: "Legacy without schema",
  key: "F",
  sections: [
    {
      id: "sec-legacy",
      title: "Legacy",
      lines: [
        {
          id: "line-legacy",
          lyrics: "أنا أعبدك",
          wordChords: ["F", "C", "G"],
          wordChordGroups: [["F"], ["C"], ["G"]],
          beforeWordChords: [["Bb"]],
          afterWordChords: [["G"]],
          gapChords: [["C"]],
        },
      ],
    },
  ],
};

export const flattenedLegacyFixture = {
  id: "fixture-flattened",
  title: "Flattened legacy",
  key: "E",
  sections: [
    {
      id: "sec-flat",
      lines: [
        {
          id: "line-flat",
          lyrics: "أنت نعمتي",
          wordChords: ["E", "A", "B"],
          wordChordGroups: [["E"], ["A"], ["B"]],
          beforeWordChords: ["D"],
          afterWordChords: ["C"],
          gapChords: ["A"],
        },
      ],
    },
  ],
};

export const futureSchemaFixture = {
  id: "fixture-future",
  title: "Future schema",
  key: "A",
  schemaVersion: 99,
  sections: [],
};
