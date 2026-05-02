import { useRef, useState } from 'react'
import { importHymnFromImage } from '../utils/ocrImport'

export default function ImageImportDialog({ open, onClose, onApplyReplace, onApplyAppend }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  const reset = () => {
    setBusy(false)
    setProgress(0)
    setError('')
    setPreview(null)
  }

  const handleClose = () => {
    if (busy) return
    reset()
    onClose()
  }

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    setPreview(null)
    setBusy(true)
    setProgress(0)

    try {
      const result = await importHymnFromImage(file, (p) => setProgress(p))
      setPreview(result)
    } catch (err) {
      setError(err?.message || 'فشل قراءة الصورة.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="imageImportOverlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="imageImportDialog card" role="dialog" aria-modal="true" aria-labelledby="imageImportTitle" dir="rtl">
        <div className="row between imageImportDialogHead">
          <h3 id="imageImportTitle">استيراد من صورة (OCR)</h3>
          <button type="button" className="btn ghost" onClick={handleClose} disabled={busy}>
            إغلاق
          </button>
        </div>
        <p className="imageImportHint">
          ارفع سكرين شوت واضح فيه الكلمات والكوردات. سيتم تقدير موضع كل كورد فوق الكلمة؛ راجع النتيجة وعدّل يدويًا عند
          الحاجة. أول مرة قد يستغرق التحميل بضع ثوانٍ (تحميل لغات OCR).
        </p>

        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="imageImportFileInput" onChange={handleFile} />

        <div className="row wrap imageImportActions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? `جاري القراءة… ${progress}%` : 'اختيار صورة'}
          </button>
        </div>

        {busy ? (
          <div className="imageImportProgress">
            <div className="imageImportProgressBar" style={{ width: `${progress}%` }} />
          </div>
        ) : null}

        {error ? <p className="imageImportError">{error}</p> : null}

        {preview ? (
          <div className="imageImportPreview">
            <p className="imageImportPreviewMeta">
              <strong>{preview.sections.length}</strong> قسم — <strong>{preview.sections.reduce((n, s) => n + s.lines.length, 0)}</strong>{' '}
              سطر
              {preview.suggestedTitle ? (
                <>
                  {' '}
                  — اقتراح عنوان: <em>{preview.suggestedTitle}</em>
                </>
              ) : null}
            </p>
            <ul className="imageImportPreviewList">
              {preview.sections.map((sec) => (
                <li key={sec.id}>
                  <span className="imageImportPreviewSecTitle">{sec.title || 'قسم'}</span>
                  <ol>
                    {sec.lines.map((line) => (
                      <li key={line.id}>{(line.lyrics || '').slice(0, 72)}{(line.lyrics || '').length > 72 ? '…' : ''}</li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
            <div className="row wrap imageImportApplyRow">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  onApplyAppend(preview)
                  reset()
                  onClose()
                }}
              >
                إضافة للترانيمة الحالية
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  if (window.confirm('سيتم استبدال كل الأقسام والأسطر الحالية بالمستورد. متابعة؟')) {
                    onApplyReplace(preview)
                    reset()
                    onClose()
                  }
                }}
              >
                استبدال كل المحتوى
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
