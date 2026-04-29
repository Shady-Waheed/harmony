const FILE_SIGNATURE = 'HARMONY_NOTES_PROJECT'
const FILE_VERSION = 1

export const PROJECT_EXTENSION = '.hnote'

function nowIso() {
  return new Date().toISOString()
}

function safeName(name) {
  return (name || 'harmony-notes').trim().replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-')
}

export function buildProjectPayload(state) {
  return {
    signature: FILE_SIGNATURE,
    version: FILE_VERSION,
    exportedAt: nowIso(),
    project: {
      hymn: state.hymn,
      mode: state.mode,
      theme: state.theme,
    },
  }
}

export function downloadProjectFile(state) {
  const payload = buildProjectPayload(state)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName(state.hymn?.title)}${PROJECT_EXTENSION}`
  a.click()
  URL.revokeObjectURL(url)
}

export function parseProjectFileContent(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('الملف غير صالح: لا يمكن قراءة JSON')
  }

  if (parsed?.signature !== FILE_SIGNATURE) {
    throw new Error('هذا ليس ملف Harmony Notes الصحيح')
  }

  if (typeof parsed?.version !== 'number' || parsed.version > FILE_VERSION) {
    throw new Error('إصدار الملف غير مدعوم')
  }

  if (!parsed?.project || !parsed.project?.hymn) {
    throw new Error('بيانات المشروع ناقصة')
  }

  return parsed.project
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'))
    reader.readAsText(file)
  })
}
