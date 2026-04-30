const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const NOTE_INDEX = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
}

const CHORD_QUALITIES = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'dim', 'aug']
const CHORD_BASS_NOTES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']
export const ROOT_NOTES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']

export const CHORD_PRESETS = [...new Set(
  ROOT_NOTES.flatMap((root) =>
    CHORD_QUALITIES.flatMap((quality) => {
      const base = `${root}${quality}`
      return [base, `${base}/E`, `${base}/F#`, `${base}/G`, `${base}/A`]
    }),
  ),
)]

function splitChord(chord) {
  const match = chord.match(/^([A-G](?:#|b)?)(.*)$/)
  if (!match) {
    return null
  }

  return { root: match[1], suffix: match[2] }
}

function transposeRoot(root, steps, preferFlat) {
  const index = NOTE_INDEX[root]
  if (index === undefined) {
    return root
  }

  const nextIndex = (index + steps + 12) % 12
  return preferFlat ? FLAT_NOTES[nextIndex] : SHARP_NOTES[nextIndex]
}

export function transposeChord(chord, steps) {
  if (!steps) {
    return chord
  }

  const [head, bass] = chord.split('/')
  const parsedHead = splitChord(head)

  if (!parsedHead) {
    return chord
  }

  const preferFlat = head.includes('b')
  const nextHead = `${transposeRoot(parsedHead.root, steps, preferFlat)}${parsedHead.suffix}`

  if (!bass) {
    return nextHead
  }

  const parsedBass = splitChord(bass)
  if (!parsedBass) {
    return nextHead
  }

  const nextBass = `${transposeRoot(parsedBass.root, steps, bass.includes('b'))}${parsedBass.suffix}`
  return `${nextHead}/${nextBass}`
}

export function transposeInlineChords(text, steps) {
  if (!text || !steps) {
    return text
  }

  return text.replace(/\[([^\]]+)\]/g, (_, chord) => `[${transposeChord(chord.trim(), steps)}]`)
}

export function transposeSongVersion(version, steps) {
  return {
    ...version,
    key: transposeChord(version.key, steps),
    lyrics: transposeInlineChords(version.lyrics, steps),
    soprano: transposeInlineChords(version.soprano, steps),
    alto: transposeInlineChords(version.alto, steps),
    tenor: transposeInlineChords(version.tenor, steps),
    bass: transposeInlineChords(version.bass, steps),
  }
}

function getChordIntervals(type) {
  switch (type) {
    case 'm':
      return [0, 3, 7]
    case '7':
      return [0, 4, 7, 10]
    case 'm7':
      return [0, 3, 7, 10]
    case 'maj7':
      return [0, 4, 7, 11]
    case 'sus4':
      return [0, 5, 7]
    case 'dim':
      return [0, 3, 6]
    case 'aug':
      return [0, 4, 8]
    default:
      return [0, 4, 7]
  }
}

function normalizeInversionValue(inversion) {
  const value = String(inversion || '').trim().toLowerCase()
  if (!value || value === 'root') return ''
  if (value === 'first' || value === '1st') return 'first'
  if (value === 'second' || value === '2nd') return 'second'
  if (value === 'third' || value === '3rd') return 'third'
  return ''
}

function splitChordWithOptionalInversion(chord, inversion = '') {
  const value = String(chord || '').trim()
  if (!value) return null

  const match = value.match(/^([A-G](?:#|b)?)([^/]*)?(?:\/([A-G](?:#|b)?))?$/)
  if (!match) return null

  const [, root, rawSuffix = '', bass = ''] = match
  const suffixWithSpaces = String(rawSuffix || '')
  const suffixMatch = suffixWithSpaces.match(/^(.*?)(?:\s*[\(\[]?\s*(1st|2nd|3rd|first|second|third)\s*[\)\]]?\s*)$/i)
  const suffix = suffixMatch ? String(suffixMatch[1] || '').trim() : suffixWithSpaces.trim()
  const parsedInversion = suffixMatch ? normalizeInversionValue(suffixMatch[2]) : ''
  const effectiveInversion = normalizeInversionValue(inversion) || parsedInversion

  return { root, suffix, bass, inversion: effectiveInversion }
}

export function getChordEffectiveInversion(chord, inversion = '') {
  return splitChordWithOptionalInversion(chord, inversion)?.inversion || ''
}

export function formatChordLabel(chord, inversion = '') {
  const value = String(chord || '').trim()
  if (!value) return ''

  const parsed = splitChordWithOptionalInversion(value, inversion)
  if (!parsed) return value
  const { root, suffix = '', bass = '', inversion: effectiveInversion = '' } = parsed
  const rootIndex = NOTE_INDEX[root]
  if (rootIndex === undefined) return value

  const base = `${root}${suffix ? ` ${suffix}` : ''}`
  const inversionLabel =
    effectiveInversion === 'first' ? '1st' : effectiveInversion === 'second' ? '2nd' : effectiveInversion === 'third' ? '3rd' : ''

  if (bass && inversionLabel) {
    return `${base} /${bass} ${inversionLabel}`
  }
  if (bass) {
    return `${base} /${bass}`
  }
  if (inversionLabel) {
    return `${base} ${inversionLabel}`
  }

  return base
}

function inferIntervalsFromSuffix(rawSuffix) {
  const suffix = String(rawSuffix || '').replace(/\s+/g, '').toLowerCase()
  if (!suffix) return [0, 4, 7]

  let intervals
  if (suffix.includes('dim')) {
    intervals = [0, 3, 6]
  } else if (suffix.includes('aug') || suffix.includes('+')) {
    intervals = [0, 4, 8]
  } else if (suffix.includes('sus2')) {
    intervals = [0, 2, 7]
  } else if (suffix.includes('sus4') || suffix.includes('sus')) {
    intervals = [0, 5, 7]
  } else if (suffix.includes('m') && !suffix.includes('maj')) {
    intervals = [0, 3, 7]
  } else {
    intervals = [0, 4, 7]
  }

  if (suffix.includes('maj7')) {
    intervals.push(11)
  } else if (suffix.includes('7')) {
    intervals.push(10)
  }

  if (suffix.includes('6')) {
    intervals.push(9)
  }

  if (suffix.includes('add9') || suffix.includes('9')) {
    intervals.push(14)
  }
  if (suffix.includes('11')) {
    intervals.push(17)
  }
  if (suffix.includes('13')) {
    intervals.push(21)
  }

  if (suffix.includes('b5')) {
    intervals = intervals.filter((item) => item % 12 !== 7)
    intervals.push(6)
  }
  if (suffix.includes('#5') || suffix.includes('+5')) {
    intervals = intervals.filter((item) => item % 12 !== 7)
    intervals.push(8)
  }

  if (suffix.includes('b9')) {
    intervals = intervals.filter((item) => item % 12 !== 2)
    intervals.push(13)
  }
  if (suffix.includes('#9')) {
    intervals = intervals.filter((item) => item % 12 !== 2)
    intervals.push(15)
  }

  return [...new Set(intervals.map((item) => ((item % 12) + 12) % 12))]
}

export function getChordNoteIndexes(chord, inversion = '') {
  const value = String(chord || '').trim()
  if (!value) return []

  const parsed = splitChordWithOptionalInversion(value, inversion)
  if (!parsed) return []
  const { root, suffix = '', bass = '', inversion: effectiveInversion = '' } = parsed
  const rootIndex = NOTE_INDEX[root]
  if (rootIndex === undefined) return []

  const baseIntervals = inferIntervalsFromSuffix(suffix)
  const inversionSteps =
    effectiveInversion === 'first' ? 1 : effectiveInversion === 'second' ? 2 : effectiveInversion === 'third' ? 3 : 0

  const reorderedIntervals = baseIntervals.map((_, idx) => baseIntervals[(idx + inversionSteps) % baseIntervals.length])

  const notes = reorderedIntervals.map((interval) => (rootIndex + interval) % 12)

  if (bass) {
    const bassIndex = NOTE_INDEX[bass]
    if (bassIndex !== undefined) {
      notes.unshift(bassIndex)
    }
  }

  return [...new Set(notes)]
}

function toInversionIndex(inversion) {
  if (inversion === 'first') return 1
  if (inversion === 'second') return 2
  if (inversion === 'third') return 3
  return 0
}

function rotateArray(list, steps) {
  if (!Array.isArray(list) || list.length === 0 || !steps) return [...(list || [])]
  const amount = ((steps % list.length) + list.length) % list.length
  return list.slice(amount).concat(list.slice(0, amount))
}

export function getChordOrderedNoteNames(chord, inversion = '') {
  const value = String(chord || '').trim()
  if (!value) return []

  const parsed = splitChordWithOptionalInversion(value, inversion)
  if (!parsed) return []
  const { root, suffix = '', bass = '', inversion: effectiveInversion = '' } = parsed
  const rootIndex = NOTE_INDEX[root]
  if (rootIndex === undefined) return []

  const preferFlat = value.includes('b')
  const noteNames = preferFlat ? FLAT_NOTES : SHARP_NOTES
  const baseIntervals = inferIntervalsFromSuffix(suffix)
  const uniquePitchClasses = [...new Set(baseIntervals.map((interval) => (rootIndex + interval) % 12))]
  let orderedPitchClasses = rotateArray(uniquePitchClasses, toInversionIndex(effectiveInversion))

  if (bass) {
    const bassIndex = NOTE_INDEX[bass]
    if (bassIndex !== undefined) {
      orderedPitchClasses = [bassIndex, ...orderedPitchClasses.filter((item) => item !== bassIndex)]
    }
  }

  return orderedPitchClasses.map((pitchClass) => noteNames[pitchClass])
}

export function getChordBassNoteIndex(chord, inversion = '') {
  const parsed = splitChordWithOptionalInversion(chord, inversion)
  if (!parsed) return null
  const { root, suffix = '', bass = '', inversion: effectiveInversion = '' } = parsed
  const rootIndex = NOTE_INDEX[root]
  if (rootIndex === undefined) return null

  if (bass) {
    const bassIndex = NOTE_INDEX[bass]
    return bassIndex === undefined ? null : bassIndex
  }

  const baseIntervals = inferIntervalsFromSuffix(suffix)
  if (baseIntervals.length === 0) return null
  const inversionSteps =
    effectiveInversion === 'first' ? 1 : effectiveInversion === 'second' ? 2 : effectiveInversion === 'third' ? 3 : 0
  const orderedIntervals = rotateArray(baseIntervals, inversionSteps)
  return (rootIndex + orderedIntervals[0]) % 12
}

export function getChordVoicingKeyIndexes(chord, inversion = '') {
  const parsed = splitChordWithOptionalInversion(chord, inversion)
  if (!parsed) return []
  const { root, suffix = '', bass = '', inversion: effectiveInversion = '' } = parsed
  const rootIndex = NOTE_INDEX[root]
  if (rootIndex === undefined) return []

  const baseIntervals = [...new Set(inferIntervalsFromSuffix(suffix))]
  if (baseIntervals.length === 0) return []

  const inversionSteps =
    effectiveInversion === 'first' ? 1 : effectiveInversion === 'second' ? 2 : effectiveInversion === 'third' ? 3 : 0

  let orderedIntervals = rotateArray(baseIntervals, inversionSteps).map((item) => ((item % 12) + 12) % 12)

  if (bass) {
    const bassIndex = NOTE_INDEX[bass]
    if (bassIndex !== undefined) {
      const bassInterval = ((bassIndex - rootIndex) % 12 + 12) % 12
      orderedIntervals = [bassInterval, ...orderedIntervals.filter((item) => item !== bassInterval)]
    }
  }

  const ascendingIntervals = []
  orderedIntervals.forEach((interval) => {
    let next = interval
    if (ascendingIntervals.length > 0) {
      while (next <= ascendingIntervals[ascendingIntervals.length - 1]) {
        next += 12
      }
    }
    ascendingIntervals.push(next)
  })

  return ascendingIntervals.map((interval) => rootIndex + interval)
}
