import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeLineStructure } from '../utils/lineChords'
import { transposeChord } from '../utils/chords'

const STORAGE_KEY = 'harmony-notes-hymn-v2'

const defaultHymn = {
  id: 'hymn-1',
  title: 'ترنيمة النعمة',
  key: 'G',
  sections: [
    {
      id: 'sec-1',
      title: 'العدد الأول',
      lines: [
        {
          id: 'line-1',
          lyrics: 'ما أعجب النعمة أن خلصت مثلي',
          wordChords: ['G', 'C', 'G', 'D', 'G', ''],
          gapChords: [[], [], [], [], []],
        },
      ],
    },
  ],
}

const HymnContext = createContext(null)

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function normalizeHymn(hymn) {
  return {
    ...hymn,
    isExclusive: Boolean(hymn?.isExclusive),
    exclusiveOwnerUid: String(hymn?.exclusiveOwnerUid || ''),
    sections: (hymn.sections || []).map((section) => ({
      ...section,
      lines: (section.lines || []).map((line) => normalizeLineStructure(line)),
    })),
  }
}

function normalizeProject(project) {
  const hymn = normalizeHymn(project?.hymn || defaultHymn)
  return {
    hymn,
    committedHymn: hymn,
    mode: project?.mode === 'view' ? 'view' : 'edit',
    theme: project?.theme === 'light' ? 'light' : 'dark',
  }
}

function createFreshState(theme = 'dark') {
  const hymn = normalizeHymn(defaultHymn)
  return {
    hymn,
    committedHymn: hymn,
    mode: 'edit',
    theme: theme === 'light' ? 'light' : 'dark',
  }
}

function createEmptyHymn() {
  return normalizeHymn({
    id: uid('hymn'),
    title: '',
    key: '',
    isExclusive: false,
    exclusiveOwnerUid: '',
    sections: [
      {
        id: uid('sec'),
        title: 'قسم 1',
        lines: [normalizeLineStructure({ id: uid('line'), lyrics: '', wordChords: [], gapChords: [] })],
      },
    ],
  })
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return createFreshState('dark')
    }
    const parsed = JSON.parse(raw)
    return normalizeProject(parsed)
  } catch {
    return createFreshState('dark')
  }
}

function transposeHymnShape(hymn, steps) {
  if (!steps) return hymn
  return {
    ...hymn,
    key: transposeChord(hymn.key || '', steps),
    sections: hymn.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => {
        const normalized = normalizeLineStructure(line)
        return {
          ...normalized,
          wordChords: normalized.wordChords.map((chord) => transposeChord(chord || '', steps)),
          gapChords: normalized.gapChords.map((group) => group.map((chord) => transposeChord(chord || '', steps))),
        }
      }),
    })),
  }
}

export function HymnProvider({ children }) {
  const persistFullHymnRef = useRef(true)
  const [state, setState] = useState(loadInitial)
  const [persistRevision, setPersistRevision] = useState(0)

  const setPersistFullHymn = useCallback((value) => {
    persistFullHymnRef.current = Boolean(value)
    setPersistRevision((r) => r + 1)
  }, [])

  useEffect(() => {
    const persistFull = persistFullHymnRef.current
    const hymnToStore = persistFull ? state.hymn : state.committedHymn
    const payload = {
      hymn: hymnToStore,
      mode: persistFull ? state.mode : 'view',
      theme: state.theme,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [state, persistRevision])

  const actions = useMemo(() => {
    const withCommitted = (prev, nextHymn) => ({
      ...prev,
      hymn: nextHymn,
      committedHymn: persistFullHymnRef.current ? nextHymn : prev.committedHymn,
    })

    const updateHymn = (patch) => {
      setState((prev) => withCommitted(prev, { ...prev.hymn, ...patch }))
    }

    const loadHymn = (hymn) => {
      const normalized = normalizeHymn(hymn)
      setState((prev) => ({ ...prev, hymn: normalized, committedHymn: normalized, mode: 'edit' }))
    }

    const createNewHymn = () => {
      const empty = createEmptyHymn()
      setState((prev) => ({ ...prev, hymn: empty, committedHymn: empty, mode: 'edit' }))
    }

    const addSection = () => {
      setState((prev) =>
        withCommitted(prev, {
          ...prev.hymn,
          sections: [
            ...prev.hymn.sections,
            {
              id: uid('sec'),
              title: `قسم ${prev.hymn.sections.length + 1}`,
              lines: [normalizeLineStructure({ id: uid('line'), lyrics: '', wordChords: [], gapChords: [] })],
            },
          ],
        }),
      )
    }

    const removeSection = (sectionId) => {
      setState((prev) =>
        withCommitted(prev, {
          ...prev.hymn,
          sections: prev.hymn.sections.filter((sec) => sec.id !== sectionId),
        }),
      )
    }

    const updateSectionTitle = (sectionId, title) => {
      setState((prev) =>
        withCommitted(prev, {
          ...prev.hymn,
          sections: prev.hymn.sections.map((sec) => (sec.id === sectionId ? { ...sec, title } : sec)),
        }),
      )
    }

    const addLine = (sectionId) => {
      setState((prev) =>
        withCommitted(prev, {
          ...prev.hymn,
          sections: prev.hymn.sections.map((sec) => {
            if (sec.id !== sectionId) return sec
            return {
              ...sec,
              lines: [...sec.lines, normalizeLineStructure({ id: uid('line'), lyrics: '', wordChords: [], gapChords: [] })],
            }
          }),
        }),
      )
    }

    const removeLine = (sectionId, lineId) => {
      setState((prev) =>
        withCommitted(prev, {
          ...prev.hymn,
          sections: prev.hymn.sections.map((sec) => {
            if (sec.id !== sectionId) return sec
            return {
              ...sec,
              lines: sec.lines.filter((line) => line.id !== lineId),
            }
          }),
        }),
      )
    }

    const updateLine = (sectionId, lineId, patch) => {
      setState((prev) =>
        withCommitted(prev, {
          ...prev.hymn,
          sections: prev.hymn.sections.map((sec) => {
            if (sec.id !== sectionId) return sec
            return {
              ...sec,
              lines: sec.lines.map((line) => {
                if (line.id !== lineId) return line
                return normalizeLineStructure({ ...line, ...patch })
              }),
            }
          }),
        }),
      )
    }

    const transposeHymn = (steps) => {
      if (!steps) return

      setState((prev) => {
        const nextHymn = transposeHymnShape(prev.hymn, steps)
        return {
          ...prev,
          hymn: nextHymn,
          committedHymn: persistFullHymnRef.current ? nextHymn : prev.committedHymn,
        }
      })
    }

    const setMode = (mode) => setState((prev) => ({ ...prev, mode }))
    const toggleTheme = () =>
      setState((prev) => ({
        ...prev,
        theme: prev.theme === 'dark' ? 'light' : 'dark',
      }))

    const importProject = (project) => {
      setState((prev) => ({ ...prev, ...normalizeProject(project) }))
    }

    const resetProject = () => {
      setState((prev) => ({ ...prev, ...createFreshState(prev.theme) }))
    }

    return {
      updateHymn,
      loadHymn,
      createNewHymn,
      addSection,
      removeSection,
      updateSectionTitle,
      addLine,
      removeLine,
      updateLine,
      transposeHymn,
      setMode,
      toggleTheme,
      importProject,
      resetProject,
      setPersistFullHymn,
    }
  }, [])

  const value = useMemo(() => ({ state, ...actions }), [state, actions])
  return <HymnContext.Provider value={value}>{children}</HymnContext.Provider>
}

export function useHymnStore() {
  const ctx = useContext(HymnContext)
  if (!ctx) throw new Error('useHymnStore must be used inside HymnProvider')
  return ctx
}
