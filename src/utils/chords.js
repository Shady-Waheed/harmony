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
