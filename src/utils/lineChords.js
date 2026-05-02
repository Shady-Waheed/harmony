export function splitWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function normalizeGapChords(gapChords, count) {
  const next = Array.from({ length: Math.max(count, 0) }, (_, i) => {
    const group = Array.isArray(gapChords?.[i]) ? gapChords[i] : []
    return group.map((item) => String(item || ''))
  })
  return next
}

function normalizeGapInversions(gapInversions, gapChords) {
  return gapChords.map((group, i) => {
    const inversionGroup = Array.isArray(gapInversions?.[i]) ? gapInversions[i] : []
    return Array.from({ length: group.length }, (_, j) => String(inversionGroup[j] || ''))
  })
}

function normalizeWordSlotGroups(slotGroups, count) {
  return Array.from({ length: Math.max(count, 0) }, (_, i) => {
    const group = Array.isArray(slotGroups?.[i]) ? slotGroups[i] : []
    return group.map((item) => String(item || ''))
  })
}

function normalizeWordSlotInversions(slotInversions, slotChords) {
  return slotChords.map((group, i) => {
    const inversionGroup = Array.isArray(slotInversions?.[i]) ? slotInversions[i] : []
    return Array.from({ length: group.length }, (_, j) => String(inversionGroup[j] || ''))
  })
}

export function normalizeLineStructure(line) {
  const lyrics = String(line?.lyrics || '')
  const words = splitWords(lyrics)

  const wordChords = Array.from({ length: words.length }, (_, i) => {
    if (Array.isArray(line?.wordChords)) {
      return String(line.wordChords[i] || '')
    }

    // Backward compatibility with old linear chords array format.
    if (Array.isArray(line?.chords)) {
      return String(line.chords[i * 2 + 1] || '')
    }

    return ''
  })

  const gapChords = normalizeGapChords(line?.gapChords, words.length - 1)
  const wordInversions = Array.from({ length: words.length }, (_, i) =>
    String(Array.isArray(line?.wordInversions) ? line.wordInversions[i] || '' : ''),
  )
  const gapInversions = normalizeGapInversions(line?.gapInversions, gapChords)
  const beforeWordChords = normalizeWordSlotGroups(line?.beforeWordChords, words.length)
  const beforeWordInversions = normalizeWordSlotInversions(line?.beforeWordInversions, beforeWordChords)
  const afterWordChords = normalizeWordSlotGroups(
    line?.afterWordChords || words.map((_, i) => (i < gapChords.length ? gapChords[i] : [])),
    words.length,
  )
  const afterWordInversions = normalizeWordSlotInversions(
    line?.afterWordInversions || words.map((_, i) => (i < gapInversions.length ? gapInversions[i] : [])),
    afterWordChords,
  )

  return {
    ...line,
    lyrics,
    wordChords,
    gapChords,
    wordInversions,
    gapInversions,
    beforeWordChords,
    beforeWordInversions,
    afterWordChords,
    afterWordInversions,
  }
}

export function buildDisplayCells(line) {
  const normalized = normalizeLineStructure(line)
  const words = splitWords(normalized.lyrics)

  const cells = []
  words.forEach((word, index) => {
    const beforeSlots = normalized.beforeWordChords[index] || []
    beforeSlots.forEach((beforeChord, slotIndex) => {
      cells.push({
        id: `before-${index}-${slotIndex}`,
        type: 'before',
        word: '',
        chord: beforeChord || '',
        inversion: normalized.beforeWordInversions[index]?.[slotIndex] || '',
        wordIndex: index,
        slotIndex,
      })
    })

    cells.push({
      id: `word-${index}`,
      type: 'word',
      word,
      chord: normalized.wordChords[index] || '',
      inversion: normalized.wordInversions[index] || '',
      wordIndex: index,
    })

    const afterSlots = normalized.afterWordChords[index] || []
    afterSlots.forEach((afterChord, slotIndex) => {
      cells.push({
        id: `after-${index}-${slotIndex}`,
        type: 'after',
        word: '',
        chord: afterChord || '',
        inversion: normalized.afterWordInversions[index]?.[slotIndex] || '',
        wordIndex: index,
        slotIndex,
      })
    })
  })

  return cells
}
