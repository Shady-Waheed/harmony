export function splitWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function splitWordLetters(word) {
  const value = String(word || "").normalize("NFC");
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return [
      ...new Intl.Segmenter("ar", { granularity: "grapheme" }).segment(value),
    ].map((part) => part.segment);
  }
  return value.match(/\P{Mark}\p{Mark}*/gu) || [];
}

export function stretchArabicWord(word, chordCount) {
  const value = String(word || "");
  const letters = splitWordLetters(value);
  if (chordCount <= 1 || letters.length < 2) return value;

  const terminalLetters = new Set([
    "ا",
    "أ",
    "إ",
    "آ",
    "ة",
    "ء",
    "ؤ",
    "ئ",
    "ى",
    "و",
    "ي",
  ]);
  const validLetters = new Set([
    "ا",
    "أ",
    "إ",
    "آ",
    "ب",
    "ت",
    "ث",
    "ج",
    "ح",
    "خ",
    "س",
    "ش",
    "ص",
    "ض",
    "ط",
    "ظ",
    "ع",
    "غ",
    "ف",
    "ق",
    "ك",
    "ل",
    "م",
    "ن",
    "ه",
    "ي",
    "ئ",
    "ؤ",
    "ة",
    "و",
    "ى",
    "ـ",
  ]);

  const insertIndexes = [];
  for (let index = 0; index < letters.length - 1; index += 1) {
    const prev = letters[index];
    const next = letters[index + 1];
    const isPrevValid = validLetters.has(prev) && prev !== "ـ";
    const isNextValid = validLetters.has(next) && next !== "ـ";
    const prevCanJoin = isPrevValid && !terminalLetters.has(prev);
    const nextCanJoin =
      isNextValid &&
      !(index + 1 === letters.length - 1 && terminalLetters.has(next));

    if (prevCanJoin && nextCanJoin) {
      insertIndexes.push(index + 1);
    }
  }

  if (insertIndexes.length === 0) return value;

  const targetKashidaCount =
    chordCount === 2
      ? 2 + Math.min(1, Math.max(0, letters.length - 5))
      : 5 + Math.min(3, Math.max(0, chordCount - 3));

  const anchorIndex =
    insertIndexes[
      Math.min(insertIndexes.length - 1, Math.floor(insertIndexes.length / 2))
    ];
  const stretched = letters.map((letter, index) => {
    if (index !== anchorIndex) return letter;
    return `${letter}${"ـ".repeat(Math.min(24, Math.max(2, targetKashidaCount)))}`;
  });

  return stretched.join("");
}

function normalizeGapChords(gapChords, count) {
  const list = coerceIndexArray(gapChords);
  const next = Array.from({ length: Math.max(count, 0) }, (_, i) => {
    const group = coerceIndexArray(list[i]);
    return group.map((item) => String(item || ""));
  });
  return next;
}

function normalizeGapInversions(gapInversions, gapChords) {
  return gapChords.map((group, i) => {
    const inversionGroup = Array.isArray(gapInversions?.[i])
      ? gapInversions[i]
      : [];
    return Array.from({ length: group.length }, (_, j) =>
      String(inversionGroup[j] || ""),
    );
  });
}

function normalizeWordSlotGroups(slotGroups, count) {
  const list = coerceIndexArray(slotGroups);
  return Array.from({ length: Math.max(count, 0) }, (_, i) => {
    const group = coerceIndexArray(list[i]);
    return group.map((item) => String(item || ""));
  });
}

function normalizeWordSlotInversions(slotInversions, slotChords) {
  return slotChords.map((group, i) => {
    const inversionGroup = Array.isArray(slotInversions?.[i])
      ? slotInversions[i]
      : [];
    return Array.from({ length: group.length }, (_, j) =>
      String(inversionGroup[j] || ""),
    );
  });
}

function normalizeChordGroup(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.map((item) => String(item || "")).filter(Boolean);
}

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

function coerceChordGroups(values) {
  const list = coerceIndexArray(values);
  return list.map((item) => {
    if (Array.isArray(item) || isPlainObject(item)) {
      return coerceIndexArray(item).map((entry) =>
        Array.isArray(entry) ? String(entry[0] || "") : String(entry || ""),
      );
    }
    return item ? [String(item)] : [];
  });
}

function slotGroupsHaveValues(groups) {
  return (groups || []).some((group) =>
    Array.isArray(group) ? group.some(Boolean) : Boolean(group),
  );
}

function coerceLetterMatrix(values) {
  const words = coerceIndexArray(values);
  const looksNested = words.some(
    (word) => Array.isArray(word) || isPlainObject(word),
  );
  if (!looksNested) return [];
  return words.map((word) => {
    const letters = coerceIndexArray(word);
    return letters.map((letter) => {
      if (Array.isArray(letter) || isPlainObject(letter)) {
        return coerceIndexArray(letter).map((item) => String(item || ""));
      }
      return letter ? [String(letter)] : [];
    });
  });
}

export function normalizeLineStructure(line) {
  const lyrics = String(line?.lyrics || "");
  const words = splitWords(lyrics);
  const clampWordArray = (values) =>
    Array.isArray(values) ? values.slice(0, Math.max(words.length, 0)) : [];

  const rawWordChords = clampWordArray(coerceIndexArray(line?.wordChords));
  const coercedWordChordGroups = coerceChordGroups(line?.wordChordGroups);
  const rawWordChordGroups = clampWordArray(
    coercedWordChordGroups.length === words.length || !rawWordChords.length
      ? coercedWordChordGroups
      : rawWordChords.map((item) => {
          const value = Array.isArray(item) ? item[0] : item;
          return value ? [String(value)] : [];
        }),
  );
  const rawWordInversions = clampWordArray(
    coerceChordGroups(line?.wordInversions),
  );
  const coercedLetterChords = coerceLetterMatrix(line?.wordLetterChords);
  const rawWordLetterChords = clampWordArray(
    !words.length ||
      coercedLetterChords.length === 0 ||
      coercedLetterChords.length === words.length
      ? coercedLetterChords
      : [],
  );
  const coercedLetterInversions = coerceLetterMatrix(
    line?.wordLetterInversions,
  );
  const rawWordLetterInversions = clampWordArray(
    !words.length ||
      coercedLetterInversions.length === 0 ||
      coercedLetterInversions.length === words.length
      ? coercedLetterInversions
      : [],
  );

  const letterChordGroups = Array.from({ length: words.length }, (_, i) => {
    const source = Array.isArray(rawWordLetterChords[i])
      ? rawWordLetterChords[i]
      : [];
    return source.flatMap((group) => normalizeChordGroup(group));
  });

  const wordChords = Array.from({ length: words.length }, (_, i) => {
    const letterGroup = letterChordGroups[i];
    if (letterGroup.length > 0) {
      return String(letterGroup[0] || "");
    }

    if (Array.isArray(rawWordChords)) {
      const value = rawWordChords[i];
      return Array.isArray(value)
        ? String(value[0] || "")
        : String(value || "");
    }

    // Backward compatibility with old linear chords array format.
    if (Array.isArray(line?.chords)) {
      return String(line.chords[i * 2 + 1] || "");
    }

    return "";
  });

  const wordChordGroups = Array.from({ length: words.length }, (_, i) => {
    const directLetterGroup = letterChordGroups[i];
    if (directLetterGroup.length > 0) return directLetterGroup;

    const source = rawWordChordGroups[i] ?? wordChords[i];
    const directGroup = normalizeChordGroup(source);
    if (directGroup.length > 0) return directGroup;

    const letterGroup = rawWordLetterChords[i];
    return Array.isArray(letterGroup)
      ? letterGroup.flatMap((group) => normalizeChordGroup(group))
      : [];
  });

  const wordLetterChords = words.map((word, wordIndex) => {
    const letters = splitWordLetters(word);
    const source = Array.isArray(rawWordLetterChords[wordIndex])
      ? rawWordLetterChords[wordIndex]
      : [];
    if (source.length > 0) {
      return Array.from({ length: letters.length }, (_, letterIndex) => {
        const group = source[letterIndex];
        if (group === undefined) return [];
        return (Array.isArray(group) ? group : [group]).map((item) =>
          String(item || ""),
        );
      });
    }
    const fallback = Array.from({ length: letters.length }, () => []);
    wordChordGroups[wordIndex].forEach((chord, chordIndex) => {
      if (letters.length > 0)
        fallback[Math.min(chordIndex, letters.length - 1)].push(chord);
    });
    return fallback;
  });

  const loadedGapChords = normalizeGapChords(
    line?.gapChords,
    words.length - 1,
  );
  const loadedGapInversions = normalizeGapInversions(
    line?.gapInversions,
    loadedGapChords,
  );
  const wordInversions = wordChordGroups.map((group, i) => {
    const source = Array.isArray(rawWordInversions[i])
      ? rawWordInversions[i]
      : [rawWordInversions[i] || ""];
    return Array.from({ length: group.length }, (_, chordIndex) =>
      String(source[chordIndex] || ""),
    );
  });
  const wordLetterInversions = wordLetterChords.map((groups, wordIndex) =>
    groups.map((group, letterIndex) => {
      const source = Array.isArray(rawWordLetterInversions[wordIndex])
        ? rawWordLetterInversions[wordIndex][letterIndex]
        : [];
      return group.map((_, chordIndex) => String(source?.[chordIndex] || ""));
    }),
  );
  const beforeWordChords = normalizeWordSlotGroups(
    line?.beforeWordChords,
    words.length,
  );
  const beforeWordInversions = normalizeWordSlotInversions(
    line?.beforeWordInversions,
    beforeWordChords,
  );
  const coercedAfterWordChords = coerceChordGroups(line?.afterWordChords);
  const coercedAfterWordInversions = coerceChordGroups(
    line?.afterWordInversions,
  );
  const afterWordChords = normalizeWordSlotGroups(
    slotGroupsHaveValues(coercedAfterWordChords)
      ? coercedAfterWordChords
      : words.map((_, i) =>
          i < loadedGapChords.length ? loadedGapChords[i] : [],
        ),
    words.length,
  );
  const afterWordInversions = normalizeWordSlotInversions(
    slotGroupsHaveValues(coercedAfterWordInversions)
      ? coercedAfterWordInversions
      : words.map((_, i) =>
          i < loadedGapInversions.length ? loadedGapInversions[i] : [],
        ),
    afterWordChords,
  );
  const gapChords = afterWordChords.slice(0, Math.max(words.length - 1, 0));
  const gapInversions = afterWordInversions.slice(
    0,
    Math.max(words.length - 1, 0),
  );

  return {
    ...line,
    lyrics,
    wordChords,
    wordChordGroups,
    wordLetterChords,
    gapChords,
    wordInversions,
    wordLetterInversions,
    gapInversions,
    beforeWordChords,
    beforeWordInversions,
    afterWordChords,
    afterWordInversions,
  };
}

export function buildDisplayCells(line) {
  const normalized = normalizeLineStructure(line);
  const words = splitWords(normalized.lyrics);

  const cells = [];
  words.forEach((word, index) => {
    const beforeSlots = normalized.beforeWordChords[index] || [];
    beforeSlots.forEach((beforeChord, slotIndex) => {
      cells.push({
        id: `before-${index}-${slotIndex}`,
        type: "before",
        word: "",
        chord: beforeChord || "",
        inversion: normalized.beforeWordInversions[index]?.[slotIndex] || "",
        wordIndex: index,
        slotIndex,
      });
    });

    cells.push({
      id: `word-${index}`,
      type: "word",
      word,
      // Index 0 stays attached to the first word in the lyric source.
      chords: normalized.wordChordGroups[index] || [],
      letters: splitWordLetters(word).map((letter, letterIndex) => ({
        letter,
        chords: normalized.wordLetterChords[index]?.[letterIndex] || [],
        inversions: normalized.wordLetterInversions[index]?.[letterIndex] || [],
      })),
      wordIndex: index,
    });

    const afterSlots = normalized.afterWordChords[index] || [];
    afterSlots.forEach((afterChord, slotIndex) => {
      cells.push({
        id: `after-${index}-${slotIndex}`,
        type: "after",
        word: "",
        chord: afterChord || "",
        inversion: normalized.afterWordInversions[index]?.[slotIndex] || "",
        wordIndex: index,
        slotIndex,
      });
    });
  });

  return cells;
}
