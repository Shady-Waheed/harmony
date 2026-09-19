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
  const letters = splitWordLetters(word);
  if (chordCount <= 1 || letters.length < 3) return String(word || "");

  const eligibleIndexes = letters
    .map((letter, index) => ({ letter, index }))
    .filter(
      ({ letter, index }) =>
        index > 1 &&
        index < letters.length - 1 &&
        /[\u0621-\u063A\u0641-\u064A]/u.test(letter) &&
        letter !== "ـ",
    )
    .map(({ index }) => index);
  if (eligibleIndexes.length === 0) return String(word || "");

  const kashidaCount = Math.min(8, Math.max(3, (chordCount - 1) * 3));
  const anchorIndex = eligibleIndexes[Math.floor(eligibleIndexes.length / 2)];
  return letters
    .map((letter, index) =>
      index === anchorIndex ? `${letter}${"ـ".repeat(kashidaCount)}` : letter,
    )
    .join("");
}

function normalizeGapChords(gapChords, count) {
  const next = Array.from({ length: Math.max(count, 0) }, (_, i) => {
    const group = Array.isArray(gapChords?.[i]) ? gapChords[i] : [];
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
  return Array.from({ length: Math.max(count, 0) }, (_, i) => {
    const group = Array.isArray(slotGroups?.[i]) ? slotGroups[i] : [];
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

export function normalizeLineStructure(line) {
  const lyrics = String(line?.lyrics || "");
  const words = splitWords(lyrics);

  const wordChords = Array.from({ length: words.length }, (_, i) => {
    if (Array.isArray(line?.wordChords)) {
      const value = line.wordChords[i];
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
    const source = line?.wordChordGroups?.[i] ?? wordChords[i];
    const directGroup = normalizeChordGroup(source);
    if (directGroup.length > 0) return directGroup;

    const letterGroup = line?.wordLetterChords?.[i];
    return Array.isArray(letterGroup)
      ? letterGroup.flatMap((group) => normalizeChordGroup(group))
      : [];
  });

  const wordLetterChords = words.map((word, wordIndex) => {
    const letters = splitWordLetters(word);
    const source = Array.isArray(line?.wordLetterChords?.[wordIndex])
      ? line.wordLetterChords[wordIndex]
      : [];
    if (source.length === letters.length) {
      return source.map((group) =>
        (Array.isArray(group) ? group : [group]).map((item) =>
          String(item || ""),
        ),
      );
    }
    const fallback = Array.from({ length: letters.length }, () => []);
    wordChordGroups[wordIndex].forEach((chord, chordIndex) => {
      if (letters.length > 0)
        fallback[Math.min(chordIndex, letters.length - 1)].push(chord);
    });
    return fallback;
  });

  const gapChords = normalizeGapChords(line?.gapChords, words.length - 1);
  const wordInversions = wordChordGroups.map((group, i) => {
    const source = Array.isArray(line?.wordInversions?.[i])
      ? line.wordInversions[i]
      : [line?.wordInversions?.[i] || ""];
    return Array.from({ length: group.length }, (_, chordIndex) =>
      String(source[chordIndex] || ""),
    );
  });
  const wordLetterInversions = wordLetterChords.map((groups, wordIndex) =>
    groups.map((group, letterIndex) => {
      const source = line?.wordLetterInversions?.[wordIndex]?.[letterIndex];
      return group.map((_, chordIndex) => String(source?.[chordIndex] || ""));
    }),
  );
  const gapInversions = normalizeGapInversions(line?.gapInversions, gapChords);
  const beforeWordChords = normalizeWordSlotGroups(
    line?.beforeWordChords,
    words.length,
  );
  const beforeWordInversions = normalizeWordSlotInversions(
    line?.beforeWordInversions,
    beforeWordChords,
  );
  const afterWordChords = normalizeWordSlotGroups(
    line?.afterWordChords ||
      words.map((_, i) => (i < gapChords.length ? gapChords[i] : [])),
    words.length,
  );
  const afterWordInversions = normalizeWordSlotInversions(
    line?.afterWordInversions ||
      words.map((_, i) => (i < gapInversions.length ? gapInversions[i] : [])),
    afterWordChords,
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
