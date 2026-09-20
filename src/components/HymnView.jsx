import { forwardRef } from 'react'
import { useHymnStore } from '../store/hymnStore.jsx'
import { buildDisplayCells } from '../utils/lineChords'
import {
  formatChordLabel,
  getChordEffectiveInversion,
  getChordOrderedNoteNames,
  getChordVoicingKeyIndexes,
} from '../utils/chords'

const WHITE_KEY_STEPS = [
  { rel: 0, note: 'C' },
  { rel: 2, note: 'D' },
  { rel: 4, note: 'E' },
  { rel: 5, note: 'F' },
  { rel: 7, note: 'G' },
  { rel: 9, note: 'A' },
  { rel: 11, note: 'B' },
]

const BLACK_KEY_STEPS = [
  { rel: 1, note: 'C#', left: 11.5 },
  { rel: 3, note: 'D#', left: 25.7 },
  { rel: 6, note: 'F#', left: 54.2 },
  { rel: 8, note: 'G#', left: 68.4 },
  { rel: 10, note: 'A#', left: 82.6 },
]

function buildMiniKeyboardKeys(baseC, nOctaves) {
  const whites = []
  const blacks = []
  for (let o = 0; o < nOctaves; o += 1) {
    const octaveBase = baseC + o * 12
    for (const { rel, note } of WHITE_KEY_STEPS) {
      const abs = octaveBase + rel
      whites.push({ abs, note, key: `w-${abs}` })
    }
    for (const { rel, note, left } of BLACK_KEY_STEPS) {
      const abs = octaveBase + rel
      blacks.push({ abs, note, left, o, key: `b-${abs}` })
    }
  }
  return { whites, blacks }
}

function ChordPianoPreview({ chord, inversion }) {
  const voicingIndexes = getChordVoicingKeyIndexes(chord, inversion)
  const orderedNoteNames = getChordOrderedNoteNames(chord, inversion)
  const effectiveInversion = getChordEffectiveInversion(chord, inversion)
  if (voicingIndexes.length === 0) return null

  const minV = Math.min(...voicingIndexes)
  const maxV = Math.max(...voicingIndexes)
  const baseC = Math.floor(minV / 12) * 12
  const nOctaves = Math.max(2, Math.ceil((maxV + 1 - baseC) / 12))
  const { whites, blacks } = buildMiniKeyboardKeys(baseC, nOctaves)

  const activeAbs = new Set(voicingIndexes)
  const bassAbs = voicingIndexes[0]
  const orderByAbs = new Map(voicingIndexes.map((abs, idx) => [abs, idx + 1]))

  const inversionLabel =
    effectiveInversion === 'first' ? '1st' : effectiveInversion === 'second' ? '2nd' : effectiveInversion === 'third' ? '3rd' : 'Root'

  const octaveWidthPct = 100 / nOctaves

  return (
    <span className="chordPreviewPopup" role="tooltip" aria-hidden="true">
      <span className="chordPreviewTitle">{formatChordLabel(chord, inversion)}</span>
      <span className="chordPreviewMeta">{inversionLabel}</span>
      <span
        className="miniPiano"
        aria-hidden="true"
        style={{
          gridTemplateColumns: `repeat(${whites.length}, minmax(0, 1fr))`,
          '--mini-white-count': whites.length,
        }}
      >
        {whites.map((key) => (
          <span
            key={key.key}
            className={`miniKey white ${activeAbs.has(key.abs) ? 'active' : ''} ${bassAbs === key.abs ? 'bass' : ''}`}
          >
            {orderByAbs.has(key.abs) ? <span className="miniKeyOrder">{orderByAbs.get(key.abs)}</span> : null}
          </span>
        ))}
        {blacks.map((key) => (
          <span
            key={key.key}
            className={`miniKey black ${activeAbs.has(key.abs) ? 'active' : ''} ${bassAbs === key.abs ? 'bass' : ''}`}
            style={{ left: `${octaveWidthPct * (key.o + key.left / 100)}%` }}
          >
            {orderByAbs.has(key.abs) ? <span className="miniKeyOrder">{orderByAbs.get(key.abs)}</span> : null}
          </span>
        ))}
      </span>
      {orderedNoteNames.length > 0 ? <span className="chordPreviewNotes">{orderedNoteNames.join(' - ')}</span> : null}
    </span>
  )
}

const HymnView = forwardRef(function HymnView(_, ref) {
  const { state } = useHymnStore()
  const { hymn } = state

  return (
    <section ref={ref} className="card hymnSheet" dir="rtl">
      <header className="sheetHeader">
        <h1>{hymn.title || 'ترنيمة بدون عنوان'}</h1>
        <p>السلم: {hymn.key || '-'}</p>
      </header>

      {hymn.sections.map((section) => (
        <article key={section.id} className="sheetSection">
          <h2>{section.title || 'قسم'}</h2>
          {section.lines.map((line) => {
            const cells = buildDisplayCells(line)
            return (
              <div key={line.id} className="sheetLine">
                {cells.map((cell, i) => (
                  <div
                    key={`${line.id}-${i}`}
                    className={`cell ${cell.type === 'before' || cell.type === 'after' ? 'gap' : cell.type}`}
                  >
                    <span className={`chord ${cell.chord ? 'hasPreview' : ''}`}>
                      {formatChordLabel(cell.chord, cell.inversion) || '\u00A0'}
                      {cell.chord ? <ChordPianoPreview chord={cell.chord} inversion={cell.inversion} /> : null}
                    </span>
                    <span className="lyric">{cell.word || '\u00A0'}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </article>
      ))}
    </section>
  )
})

export default HymnView
