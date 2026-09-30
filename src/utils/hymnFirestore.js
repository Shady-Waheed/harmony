function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceIndexArray(value) {
  if (Array.isArray(value)) return value;
  if (!isPlainObject(value)) return [];
  return Object.keys(value)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => value[key]);
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      Array.isArray(item) ? String(item[0] || "") : String(item || ""),
    );
  }
  if (isPlainObject(value)) {
    return asStringArray(coerceIndexArray(value));
  }
  return value ? [String(value)] : [];
}

function coerceChordGroups(values) {
  const list = coerceIndexArray(values);
  if (!list.length) return null;
  return list.map((item) => {
    if (Array.isArray(item) || isPlainObject(item)) {
      return asStringArray(item);
    }
    return item ? [String(item)] : [];
  });
}

function coerceLetterMatrix(values) {
  const words = coerceIndexArray(values);
  if (!words.length) return null;
  const looksNested = words.some(
    (word) => Array.isArray(word) || isPlainObject(word),
  );
  if (!looksNested) return null;
  return words.map((word) => {
    const letters = coerceIndexArray(word);
    return letters.map((letter) => {
      if (Array.isArray(letter) || isPlainObject(letter)) {
        return asStringArray(letter);
      }
      return letter ? [String(letter)] : [];
    });
  });
}

function groupsHaveValues(groups) {
  return (groups || []).some((group) =>
    Array.isArray(group) ? group.some(Boolean) : Boolean(group),
  );
}

function nonEmptySlotCount(groups) {
  return (groups || []).filter((group) =>
    Array.isArray(group) ? group.some(Boolean) : Boolean(group),
  ).length;
}

function groupsFromWordChords(wordChords) {
  return asStringArray(wordChords).map((chord) => (chord ? [chord] : []));
}

function recoverWordGroups(entryGroups, storedGroups, wordChords) {
  const chords = asStringArray(wordChords);
  if (groupsHaveValues(entryGroups)) {
    if (!chords.length || entryGroups.length === chords.length) {
      return entryGroups;
    }
  }

  const stored = coerceChordGroups(storedGroups);
  if (groupsHaveValues(stored)) {
    if (!chords.length || stored.length === chords.length) {
      return stored;
    }
  }

  if (chords.some(Boolean)) {
    return groupsFromWordChords(chords);
  }

  return groupsHaveValues(entryGroups) ? entryGroups : stored;
}

function recoverLetterMatrix(entryMatrix, storedMatrix, wordCount) {
  if (groupsHaveValues(entryMatrix)) {
    if (!wordCount || entryMatrix.length === wordCount) return entryMatrix;
  }
  const stored = coerceLetterMatrix(storedMatrix);
  if (groupsHaveValues(stored)) {
    if (!wordCount || stored.length === wordCount) return stored;
  }
  return null;
}

function encodeSlotEntries(chords = [], inversions = []) {
  const count = Math.max(
    Array.isArray(chords) ? chords.length : 0,
    Array.isArray(inversions) ? inversions.length : 0,
  );
  return Array.from({ length: count }, (_, index) => ({
    chords: asStringArray(chords[index]),
    inversions: asStringArray(inversions[index]),
  }));
}

function encodeLetterEntries(letterChords = [], letterInversions = []) {
  const count = Math.max(
    Array.isArray(letterChords) ? letterChords.length : 0,
    Array.isArray(letterInversions) ? letterInversions.length : 0,
  );
  return Array.from({ length: count }, (_, wordIndex) => {
    const chordLetters = Array.isArray(letterChords[wordIndex])
      ? letterChords[wordIndex]
      : [];
    const inversionLetters = Array.isArray(letterInversions[wordIndex])
      ? letterInversions[wordIndex]
      : [];
    const letterCount = Math.max(chordLetters.length, inversionLetters.length);
    return {
      letters: Array.from({ length: letterCount }, (_, letterIndex) => ({
        chords: asStringArray(chordLetters[letterIndex]),
        inversions: asStringArray(inversionLetters[letterIndex]),
      })),
    };
  });
}

function decodeSlotEntries(entries = []) {
  const list = coerceIndexArray(entries);
  return {
    chords: list.map((entry) => asStringArray(entry?.chords)),
    inversions: list.map((entry) => asStringArray(entry?.inversions)),
  };
}

function decodeLetterEntries(entries = []) {
  const list = coerceIndexArray(entries);
  return {
    chords: list.map((entry) =>
      coerceIndexArray(entry?.letters).map((letter) =>
        asStringArray(letter?.chords),
      ),
    ),
    inversions: list.map((entry) =>
      coerceIndexArray(entry?.letters).map((letter) =>
        asStringArray(letter?.inversions),
      ),
    ),
  };
}

export function hasNestedArrays(value) {
  if (Array.isArray(value)) {
    return value.some(
      (item) =>
        Array.isArray(item) || (isPlainObject(item) && hasNestedArrays(item)),
    );
  }
  if (isPlainObject(value)) {
    return Object.values(value).some((item) => hasNestedArrays(item));
  }
  return false;
}

export function sanitizeForFirestoreValue(value) {
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    const mapped = value
      .map((item) => sanitizeForFirestoreValue(item))
      .filter((item) => item !== undefined);
    if (mapped.some((item) => Array.isArray(item))) {
      return Object.fromEntries(
        mapped.map((item, index) => [String(index), item]),
      );
    }
    return mapped;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, sanitizeForFirestoreValue(item)]),
    );
  }

  return value;
}

export function sanitizeHymnDataForFirestore(songData) {
  const cleaned = sanitizeForFirestoreValue(songData);
  return JSON.parse(JSON.stringify(cleaned ?? null));
}

export function encodeSectionsForFirestore(sections = []) {
  return (sections || []).map((section) => {
    const { lines = [], ...sectionRest } = section || {};
    return {
      ...sectionRest,
      lines: lines.map((line) => {
        const {
          gapChords = [],
          gapInversions = [],
          beforeWordChords = [],
          beforeWordInversions = [],
          afterWordChords = [],
          afterWordInversions = [],
          wordChords = [],
          wordChordGroups = [],
          wordInversions = [],
          wordLetterChords = [],
          wordLetterInversions = [],
          gapEntries: _gapEntries,
          beforeWordEntries: _beforeWordEntries,
          afterWordEntries: _afterWordEntries,
          wordChordEntries: _wordChordEntries,
          wordLetterEntries: _wordLetterEntries,
          ...lineRest
        } = line || {};

        return {
          ...lineRest,
          wordChords: asStringArray(wordChords),
          wordChordEntries: encodeSlotEntries(wordChordGroups, wordInversions),
          wordLetterEntries: encodeLetterEntries(
            wordLetterChords,
            wordLetterInversions,
          ),
          gapEntries: encodeSlotEntries(gapChords, gapInversions),
          beforeWordEntries: encodeSlotEntries(
            beforeWordChords,
            beforeWordInversions,
          ),
          afterWordEntries: encodeSlotEntries(
            afterWordChords,
            afterWordInversions,
          ),
        };
      }),
    };
  });
}

export function decodeSectionsFromFirestore(sections = []) {
  return (sections || []).map((section) => ({
    ...section,
    lines: (section.lines || []).map((line) => {
      const {
        gapEntries,
        beforeWordEntries,
        afterWordEntries,
        wordChordEntries,
        wordLetterEntries,
        wordChordGroups: storedWordChordGroups,
        wordInversions: storedWordInversions,
        wordLetterChords: storedWordLetterChords,
        wordLetterInversions: storedWordLetterInversions,
        wordChords: storedWordChords,
        gapChords: storedGapChords,
        gapInversions: storedGapInversions,
        beforeWordChords: storedBeforeWordChords,
        beforeWordInversions: storedBeforeWordInversions,
        afterWordChords: storedAfterWordChords,
        afterWordInversions: storedAfterWordInversions,
        ...lineRest
      } = line || {};

      const gapFromEntries = decodeSlotEntries(gapEntries);
      const beforeFromEntries = decodeSlotEntries(beforeWordEntries);
      const afterFromEntries = decodeSlotEntries(afterWordEntries);
      const wordGroups = decodeSlotEntries(wordChordEntries);
      const letterGroups = decodeLetterEntries(wordLetterEntries);
      const wordChords = asStringArray(storedWordChords);
      const wordCount = wordChords.length;

      const gapChords = groupsHaveValues(gapFromEntries.chords)
        ? gapFromEntries.chords
        : coerceChordGroups(storedGapChords) || gapFromEntries.chords;
      const gapInversions = groupsHaveValues(gapFromEntries.inversions)
        ? gapFromEntries.inversions
        : coerceChordGroups(storedGapInversions) || gapFromEntries.inversions;
      const beforeWordChords = groupsHaveValues(beforeFromEntries.chords)
        ? beforeFromEntries.chords
        : coerceChordGroups(storedBeforeWordChords) || beforeFromEntries.chords;
      const beforeWordInversions = groupsHaveValues(
        beforeFromEntries.inversions,
      )
        ? beforeFromEntries.inversions
        : coerceChordGroups(storedBeforeWordInversions) ||
          beforeFromEntries.inversions;
      const afterWordChords = groupsHaveValues(afterFromEntries.chords)
        ? afterFromEntries.chords
        : coerceChordGroups(storedAfterWordChords) || afterFromEntries.chords;
      const afterWordInversions = groupsHaveValues(afterFromEntries.inversions)
        ? afterFromEntries.inversions
        : coerceChordGroups(storedAfterWordInversions) ||
          afterFromEntries.inversions;

      const decoded = {
        ...lineRest,
        wordChords,
        gapChords,
        gapInversions,
        beforeWordChords,
        beforeWordInversions,
        afterWordChords,
        afterWordInversions,
      };

      const wordChordGroups = recoverWordGroups(
        wordGroups.chords,
        storedWordChordGroups,
        wordChords,
      );
      const wordInversions = recoverWordGroups(
        wordGroups.inversions,
        storedWordInversions,
        wordChordGroups?.map((group) => group?.[0] || "") || wordChords,
      );
      const wordLetterChords = recoverLetterMatrix(
        letterGroups.chords,
        storedWordLetterChords,
        wordCount || nonEmptySlotCount(wordChordGroups),
      );
      const wordLetterInversions = recoverLetterMatrix(
        letterGroups.inversions,
        storedWordLetterInversions,
        wordLetterChords?.length || wordCount,
      );

      if (wordChordGroups) decoded.wordChordGroups = wordChordGroups;
      if (wordInversions) decoded.wordInversions = wordInversions;
      if (wordLetterChords) decoded.wordLetterChords = wordLetterChords;
      if (wordLetterInversions)
        decoded.wordLetterInversions = wordLetterInversions;

      return decoded;
    }),
  }));
}
