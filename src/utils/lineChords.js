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

  return {
    ...line,
    lyrics,
    wordChords,
    gapChords,
  }
}

export function buildDisplayCells(line) {
  const normalized = normalizeLineStructure(line)
  const words = splitWords(normalized.lyrics)

  const cells = []
  words.forEach((word, index) => {
    cells.push({
      id: `word-${index}`,
      type: 'word',
      word,
      chord: normalized.wordChords[index] || '',
      wordIndex: index,
    })

    if (index < words.length - 1) {
      const gaps = normalized.gapChords[index] || []
      gaps.forEach((gapChord, slotIndex) => {
        cells.push({
          id: `gap-${index}-${slotIndex}`,
          type: 'gap',
          word: '',
          chord: gapChord || '',
          gapIndex: index,
          slotIndex,
        })
      })
    }
  })

  return cells
}
