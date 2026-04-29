import { useMemo } from 'react'
import { useHymnStore } from '../store/hymnStore.jsx'
import { normalizeLineStructure, splitWords } from '../utils/lineChords'

function HymnEditor() {
  const { state, updateHymn, addSection, removeSection, updateSectionTitle, addLine, removeLine, updateLine, transposeHymn } =
    useHymnStore()
  const { hymn } = state

  const sectionCount = useMemo(() => hymn.sections.length, [hymn.sections.length])

  return (
    <section className="card">
      <h2>وضع التعديل</h2>
      <div className="metaGrid">
        <input
          className="input modernInput"
          value={hymn.title}
          onChange={(e) => updateHymn({ title: e.target.value })}
          placeholder="عنوان الترانيمة"
        />
        <input
          className="input modernInput"
          value={hymn.key}
          onChange={(e) => updateHymn({ key: e.target.value })}
          placeholder="المقام (Key)"
        />
      </div>
      <div className="row wrap transposeRow">
        <button className="btn" onClick={() => transposeHymn(-1)}>
          خفض نصف درجة
        </button>
        <button className="btn" onClick={() => transposeHymn(1)}>
          رفع نصف درجة
        </button>
      </div>

      {hymn.sections.map((section, secIndex) => (
        <article key={section.id} className="sectionCard modernCard">
          <div className="row between sectionHeaderRow">
            <input
              className="input modernInput"
              value={section.title}
              onChange={(e) => updateSectionTitle(section.id, e.target.value)}
              placeholder={`اسم القسم ${secIndex + 1}`}
            />
            <button
              className="btn danger deleteSectionBtn"
              onClick={() => removeSection(section.id)}
              disabled={sectionCount <= 1}
            >
              حذف القسم
            </button>
          </div>

          {section.lines.map((line, lineIndex) => {
            const normalizedLine = normalizeLineStructure(line)
            const words = splitWords(normalizedLine.lyrics)

            return (
              <div key={line.id} className="lineEditor modernLineEditor">
                <label>السطر {lineIndex + 1} - اكتب الكلمات كاملة</label>
                <textarea
                  className="input textarea modernInput"
                  value={normalizedLine.lyrics}
                  onChange={(e) => updateLine(section.id, line.id, { lyrics: e.target.value })}
                  placeholder="اكتب كلمات السطر هنا"
                />

                {words.length === 0 ? (
                  <div className="emptyHint">اكتب كلمات السطر الأول، وبعدها ستظهر خانات الكورد فوق كل كلمة.</div>
                ) : (
                  <>
                    <label>الكوردات فوق الكلمات + إضافة مسافة يدويًا بين كلمتين</label>
                    <div className="wordComposer">
                      {words.map((word, wordIndex) => (
                        <div key={`${line.id}-${wordIndex}`} className="wordBlockWrap">
                          <div className="wordChordCell word">
                            <input
                              className="input chordInput"
                              value={normalizedLine.wordChords[wordIndex] || ''}
                              onChange={(e) => {
                                const nextWordChords = [...normalizedLine.wordChords]
                                nextWordChords[wordIndex] = e.target.value
                                updateLine(section.id, line.id, { wordChords: nextWordChords })
                              }}
                              placeholder="Chord"
                            />
                            <span className="wordLabel">{word}</span>
                          </div>

                          {wordIndex < words.length - 1 && (
                            <div className="gapEditor">
                              <button
                                className="miniAddBtn"
                                onClick={() => {
                                  const nextGapChords = normalizedLine.gapChords.map((group) => [...group])
                                  nextGapChords[wordIndex] = [...(nextGapChords[wordIndex] || []), '']
                                  updateLine(section.id, line.id, { gapChords: nextGapChords })
                                }}
                              >
                                + مسافة
                              </button>

                              {(normalizedLine.gapChords[wordIndex] || []).map((gapChord, slotIndex) => (
                                <div key={`${line.id}-gap-${wordIndex}-${slotIndex}`} className="gapSlotItem">
                                  <input
                                    className="input chordInput gapInput"
                                    value={gapChord}
                                    onChange={(e) => {
                                      const nextGapChords = normalizedLine.gapChords.map((group) => [...group])
                                      nextGapChords[wordIndex][slotIndex] = e.target.value
                                      updateLine(section.id, line.id, { gapChords: nextGapChords })
                                    }}
                                    placeholder="Chord"
                                  />
                                  <button
                                    className="miniRemoveBtn"
                                    onClick={() => {
                                      const nextGapChords = normalizedLine.gapChords.map((group) => [...group])
                                      nextGapChords[wordIndex].splice(slotIndex, 1)
                                      updateLine(section.id, line.id, { gapChords: nextGapChords })
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="row end">
                  <button className="btn ghost" onClick={() => removeLine(section.id, line.id)}>
                    حذف السطر
                  </button>
                </div>
              </div>
            )
          })}

          <button className="btn" onClick={() => addLine(section.id)}>
            + إضافة سطر
          </button>
        </article>
      ))}

      <button className="btn primary" onClick={addSection}>
        + إضافة قسم
      </button>
    </section>
  )
}

export default HymnEditor
