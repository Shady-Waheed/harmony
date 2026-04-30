import { forwardRef } from 'react'
import { useHymnStore } from '../store/hymnStore.jsx'
import { buildDisplayCells } from '../utils/lineChords'
import { formatChordLabel, getChordNoteIndexes, getChordOrderedNoteNames } from '../utils/chords'

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
  const orderedNoteNames = getChordOrderedNoteNames(chord, inversion)
  const inversionLabel = inversion === 'first' ? '1st' : inversion === 'second' ? '2nd' : inversion === 'third' ? '3rd' : 'Root'
  if (activeNotes.size === 0) return null

  return (
    <span className="chordPreviewPopup" role="tooltip" aria-hidden="true">
      <span className="chordPreviewTitle">{formatChordLabel(chord, inversion)}</span>
      <span className="chordPreviewMeta">{inversionLabel}</span>
      <span className="miniPiano" aria-hidden="true">
        {WHITE_KEYS.map((key) => (
          <span key={key.note} className={`miniKey white ${activeNotes.has(key.index) ? 'active' : ''}`} />
        ))}
        {BLACK_KEYS.map((key) => (
          <span
            key={key.note}
            className={`miniKey black ${activeNotes.has(key.index) ? 'active' : ''}`}
            style={{ left: `${key.left}%` }}
          />
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
