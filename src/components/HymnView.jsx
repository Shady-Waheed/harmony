import { forwardRef } from 'react'
import { useHymnStore } from '../store/hymnStore.jsx'
import { buildDisplayCells } from '../utils/lineChords'
import { formatChordLabel } from '../utils/chords'

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
                    <span className="chord">{formatChordLabel(cell.chord, cell.inversion) || '\u00A0'}</span>
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
