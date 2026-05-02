import { createWorker } from 'tesseract.js'
import { normalizeLineStructure, splitWords } from './lineChords'

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function hasArabic(s) {
  return /[\u0600-\u06FF]/.test(String(s || ''))
}

function normalizeChordDisplay(raw) {
  return String(raw || '')
    .replace(/\s+/g, '')
    .replace(/[|ﬁﬂ]/g, '')
    .replace(/^1([A-G])/i, '$1')
    .trim()
}

function isChordToken(t) {
  const s = normalizeChordDisplay(t)
  if (!s) return false
  if (/^(N\.?C\.?|TACET)$/i.test(s)) return true
  const cleaned = s.replace(/[()]/g, '')
  return /^[A-G](?:#|b)?(?:maj7|maj9|m7|m9|m11|m6|add9|sus2|sus4|dim7?|aug|maj|m|°|\+|sus)?(?:6|7|9|11|13)?(?:\/[A-G](?:#|b)?)?$/i.test(
    cleaned,
  )
}

function classifyLineRow(words, fullText, y0, imgHeight) {
  const t = String(fullText || '').trim()
  const lower = t.toLowerCase()

  if (/^(home|library|sign|about|discover|donate|features)\b/i.test(lower)) return 'junk'
  if (/^zamar\b/i.test(lower)) return 'junk'
  if (/^\s*sign\s*in\s*$/i.test(lower)) return 'junk'

  if (y0 < imgHeight * 0.09 && !hasArabic(t) && !/^ال(عدد|قرار|لازمة)/.test(t)) {
    if (/[a-z]{3,}/i.test(t) && !hasArabic(t)) return 'junk'
  }

  const tokenList = words.length ? words.map((w) => w.text) : t.split(/\s+/).filter(Boolean)
  let chordLike = 0
  let arabicLike = 0
  for (const tok of tokenList) {
    if (hasArabic(tok)) arabicLike += 1
    if (isChordToken(tok)) chordLike += 1
  }
  const n = Math.max(tokenList.length, 1)

  if (arabicLike === 0 && chordLike / n >= 0.5) return 'chord'
  if (/^ال(عدد|قرار|لازمة|كورال|مدخل)/.test(t) && hasArabic(t) && t.length < 52) return 'section'
  if (arabicLike / n >= 0.35) return 'lyric'
  if (chordLike / n >= 0.45) return 'chord'
  return 'lyric'
}

function tesseractLineToRow(tLine, imgHeight) {
  const bbox = tLine.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 }
  const words = (tLine.words || [])
    .map((w) => ({
      text: String(w.text || '').trim(),
      x0: w.bbox.x0,
      y0: w.bbox.y0,
      x1: w.bbox.x1,
      y1: w.bbox.y1,
    }))
    .filter((w) => w.text)
  const text = String(tLine.text || '').trim()
  const type = classifyLineRow(words, text, bbox.y0, imgHeight)
  if (type === 'junk') return null
  return { type, text, words, bbox, y0: bbox.y0 }
}

function lyricCentersFromWords(sortedRtlWords, nTokens) {
  if (nTokens <= 0) return []
  if (!sortedRtlWords.length) {
    return Array.from({ length: nTokens }, (_, i) => i + 0.5)
  }
  if (sortedRtlWords.length === nTokens) {
    return sortedRtlWords.map((w) => (w.x0 + w.x1) / 2)
  }
  const minX = Math.min(...sortedRtlWords.map((w) => w.x0))
  const maxX = Math.max(...sortedRtlWords.map((w) => w.x1))
  const span = Math.max(1, maxX - minX)
  return Array.from({ length: nTokens }, (_, i) => maxX - (span * (i + 0.5)) / nTokens)
}

function buildLineFromPair(chordRow, lyricRow) {
  const lw = [...(lyricRow.words || [])].filter((w) => w.text).sort((a, b) => b.x0 - a.x0)
  const lyricsText = lw.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim()
  const tokens = splitWords(lyricsText)
  const n = tokens.length

  if (!lyricsText || n === 0) {
    return {
      id: uid('line'),
      lyrics: '',
      wordChords: [],
      wordInversions: [],
      beforeWordChords: [],
      beforeWordInversions: [],
      afterWordChords: [],
      afterWordInversions: [],
    }
  }

  const wordChords = Array.from({ length: n }, () => '')
  const beforeWordChords = Array.from({ length: n }, () => [])
  const afterWordChords = Array.from({ length: n }, () => [])
  const wordInversions = Array.from({ length: n }, () => '')
  const beforeWordInversions = Array.from({ length: n }, () => [])
  const afterWordInversions = Array.from({ length: n }, () => [])

  const centers = lyricCentersFromWords(lw, n)

  if (chordRow && chordRow.words && chordRow.words.length) {
    const cw = [...chordRow.words].sort((a, b) => a.x0 - b.x0)
    for (const ch of cw) {
      const token = normalizeChordDisplay(ch.text)
      if (!isChordToken(token)) continue
      const cxc = (ch.x0 + ch.x1) / 2
      let best = 0
      let bestD = Infinity
      for (let j = 0; j < n; j += 1) {
        const d = Math.abs(cxc - centers[j])
        if (d < bestD) {
          bestD = d
          best = j
        }
      }
      if (!wordChords[best]) {
        wordChords[best] = token
      } else {
        afterWordChords[best].push(token)
      }
    }
  }

  return {
    id: uid('line'),
    lyrics: tokens.join(' '),
    wordChords,
    wordInversions,
    beforeWordChords,
    beforeWordInversions,
    afterWordChords,
    afterWordInversions,
  }
}

function findSuggestedTitle(processed, sections) {
  const firstLyric = processed.find((r) => r.type === 'lyric')
  if (firstLyric?.text) {
    const s = firstLyric.text.replace(/\s+/g, ' ').trim()
    return s.length > 40 ? `${s.slice(0, 40)}…` : s
  }
  return sections[0]?.title || ''
}

function parseTesseractPage(data, imgHeight) {
  const rawLines = (data.lines || []).filter(Boolean)
  const processed = rawLines
    .map((tl) => tesseractLineToRow(tl, imgHeight))
    .filter(Boolean)
    .sort((a, b) => a.y0 - b.y0)

  const sections = []
  let current = { title: 'مستورد من صورة', lines: [] }

  let i = 0
  while (i < processed.length) {
    const row = processed[i]

    if (row.type === 'section') {
      if (current.lines.length > 0) {
        sections.push(current)
      }
      current = { title: row.text || row.words.map((w) => w.text).join(' '), lines: [] }
      i += 1
      continue
    }

    if (row.type === 'chord') {
      const chordRows = [row]
      let j = i + 1
      while (j < processed.length && processed[j].type === 'chord') {
        chordRows.push(processed[j])
        j += 1
      }
      const next = processed[j]
      if (next && next.type === 'lyric') {
        const mergedChord = {
          type: 'chord',
          words: chordRows.flatMap((r) => r.words),
          text: chordRows.map((r) => r.text).join(' '),
        }
        current.lines.push(buildLineFromPair(mergedChord, next))
        i = j + 1
        continue
      }
      i = j
      continue
    }

    if (row.type === 'lyric') {
      current.lines.push(buildLineFromPair(null, row))
      i += 1
      continue
    }

    i += 1
  }

  if (current.lines.length > 0 || sections.length === 0) {
    sections.push(current)
  }

  const normalizedSections = sections
    .filter((sec) => sec.lines.length > 0)
    .map((sec) => ({
      id: uid('sec'),
      title: sec.title || 'قسم',
      lines: sec.lines.map((line) => normalizeLineStructure({ ...line, id: line.id || uid('line') })),
    }))

  if (normalizedSections.length === 0) {
    normalizedSections.push({
      id: uid('sec'),
      title: 'مستورد من صورة',
      lines: [normalizeLineStructure({ id: uid('line'), lyrics: '', wordChords: [], gapChords: [] })],
    })
  }

  return {
    sections: normalizedSections,
    suggestedTitle: findSuggestedTitle(processed, normalizedSections),
  }
}

async function prepareCanvas(file, maxDim = 2200) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bmp, 0, 0, w, h)
  return { canvas, height: h }
}

/**
 * يقرأ صورة (سكرين شوت) فيها كلمات عربية وكوردات لاتينية، ويحوّلها لهيكل أقسام/أسطر يتوافق مع التطبيق.
 * الدقة تعتمد على وضوح الصورة وجودة OCR؛ يُفضّل مراجعة النتيجة بعد الاستيراد.
 */
export async function importHymnFromImage(file, onProgress) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('اختر ملف صورة صالح (PNG أو JPEG).')
  }

  const { canvas, height } = await prepareCanvas(file)

  const worker = await createWorker(['ara', 'eng'], 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(Math.min(100, Math.round(m.progress * 100)))
      }
    },
  })

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '3',
      preserve_interword_spaces: '1',
    })
    onProgress?.(5)
    const { data } = await worker.recognize(canvas)
    onProgress?.(95)
    const parsed = parseTesseractPage(data, height)
    onProgress?.(100)
    return parsed
  } finally {
    await worker.terminate()
  }
}
