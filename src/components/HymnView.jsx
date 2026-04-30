import { forwardRef } from 'react'
import { useHymnStore } from '../store/hymnStore.jsx'
import { buildDisplayCells } from '../utils/lineChords'
import {
  formatChordLabel,
  getChordBassNoteIndex,
  getChordEffectiveInversion,
  getChordNoteIndexes,
  getChordOrderedNoteNames,
  getChordVoicingKeyIndexes,
} from '../utils/chords'

const WHITE_KEYS = [
  { note: 'C', index: 0 },
  { note: 'D', index: 2 },
  { note: 'E', index: 4 },
  { note: 'F', index: 5 },
  { note: 'G', index: 7 },
  { note: 'A', index: 9 },
  { note: 'B', index: 11 },
]

const BLACK_KEYS = [
  { note: 'C#', index: 1, left: 11.5 },
  { note: 'D#', index: 3, left: 25.7 },
  { note: 'F#', index: 6, left: 54.2 },
  { note: 'G#', index: 8, left: 68.4 },
  { note: 'A#', index: 10, left: 82.6 },
]

function ChordPianoPreview({ chord, inversion }) {
  const activeNotes = new Set(getChordNoteIndexes(chord, inversion))
  const bassNoteIndex = getChordBassNoteIndex(chord, inversion)
  const voicingIndexes = getChordVoicingKeyIndexes(chord, inversion)
  const orderedNoteNames = getChordOrderedNoteNames(chord, inversion)
  const effectiveInversion = getChordEffectiveInversion(chord, inversion)
  if (activeNotes.size === 0) return null
  const orderByPitchClass = new Map()
  voicingIndexes.forEach((absoluteIndex, idx) => {
    const pitchClass = ((absoluteIndex % 12) + 12) % 12
    if (!orderByPitchClass.has(pitchClass)) {
      orderByPitchClass.set(pitchClass, idx + 1)
    }
  })
  const inversionLabel =
    effectiveInversion === 'first' ? '1st' : effectiveInversion === 'second' ? '2nd' : effectiveInversion === 'third' ? '3rd' : 'Root'

  return (
    <span className="chordPreviewPopup" role="tooltip" aria-hidden="true">
      <span className="chordPreviewTitle">{formatChordLabel(chord, inversion)}</span>
      <span className="chordPreviewMeta">{inversionLabel}</span>
      <span className="miniPiano" aria-hidden="true">
        {WHITE_KEYS.map((key) => (
          <span
            key={key.note}
            className={`miniKey white ${activeNotes.has(key.index) ? 'active' : ''} ${bassNoteIndex === key.index ? 'bass' : ''}`}
          >
            {orderByPitchClass.has(key.index) ? <span className="miniKeyOrder">{orderByPitchClass.get(key.index)}</span> : null}
          </span>
        ))}
        {BLACK_KEYS.map((key) => (
          <span
            key={key.note}
            className={`miniKey black ${activeNotes.has(key.index) ? 'active' : ''} ${bassNoteIndex === key.index ? 'bass' : ''}`}
            style={{ left: `${key.left}%` }}
          >
            {orderByPitchClass.has(key.index) ? <span className="miniKeyOrder">{orderByPitchClass.get(key.index)}</span> : null}
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
                  <div key={`${line.id}-${i}`} className={`cell ${cell.type}`}>
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
