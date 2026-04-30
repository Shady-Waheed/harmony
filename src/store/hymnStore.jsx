import { createContext, useContext, useEffect, useMemo, useState } from 'react'
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
    sections: (hymn.sections || []).map((section) => ({
      ...section,
      lines: (section.lines || []).map((line) => normalizeLineStructure(line)),
    })),
  }
}

function normalizeProject(project) {
  return {
    hymn: normalizeHymn(project?.hymn || defaultHymn),
    mode: project?.mode === 'view' ? 'view' : 'edit',
    theme: project?.theme === 'light' ? 'light' : 'dark',
  }
}

function createFreshState(theme = 'dark') {
  return {
    hymn: normalizeHymn(defaultHymn),
    mode: 'edit',
    theme: theme === 'light' ? 'light' : 'dark',
  }
}

function createEmptyHymn() {
  return normalizeHymn({
    id: uid('hymn'),
    title: '',
    key: '',
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
      return {
        hymn: normalizeHymn(defaultHymn),
        mode: 'edit',
        theme: 'dark',
      }
    }
    const parsed = JSON.parse(raw)
    return normalizeProject(parsed)
  } catch {
    return {
      hymn: normalizeHymn(defaultHymn),
      mode: 'edit',
      theme: 'dark',
    }
  }
}

export function HymnProvider({ children }) {
  const [state, setState] = useState(loadInitial)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const actions = useMemo(() => {
    const updateHymn = (patch) => {
      setState((prev) => ({ ...prev, hymn: { ...prev.hymn, ...patch } }))
    }

    const loadHymn = (hymn) => {
      setState((prev) => ({ ...prev, hymn: normalizeHymn(hymn), mode: 'edit' }))
    }

    const createNewHymn = () => {
      setState((prev) => ({ ...prev, hymn: createEmptyHymn(), mode: 'edit' }))
    }

    const addSection = () => {
      setState((prev) => ({
        ...prev,
        hymn: {
          ...prev.hymn,
          sections: [
            ...prev.hymn.sections,
            {
              id: uid('sec'),
              title: `قسم ${prev.hymn.sections.length + 1}`,
              lines: [normalizeLineStructure({ id: uid('line'), lyrics: '', wordChords: [], gapChords: [] })],
            },
          ],
        },
      }))
    }

    const removeSection = (sectionId) => {
      setState((prev) => ({
        ...prev,
        hymn: {
          ...prev.hymn,
          sections: prev.hymn.sections.filter((sec) => sec.id !== sectionId),
        },
      }))
    }

    const updateSectionTitle = (sectionId, title) => {
      setState((prev) => ({
        ...prev,
        hymn: {
          ...prev.hymn,
          sections: prev.hymn.sections.map((sec) => (sec.id === sectionId ? { ...sec, title } : sec)),
        },
      }))
    }

    const addLine = (sectionId) => {
      setState((prev) => ({
        ...prev,
        hymn: {
          ...prev.hymn,
          sections: prev.hymn.sections.map((sec) => {
            if (sec.id !== sectionId) return sec
            return {
              ...sec,
              lines: [...sec.lines, normalizeLineStructure({ id: uid('line'), lyrics: '', wordChords: [], gapChords: [] })],
            }
          }),
        },
      }))
    }

    const removeLine = (sectionId, lineId) => {
      setState((prev) => ({
        ...prev,
        hymn: {
          ...prev.hymn,
          sections: prev.hymn.sections.map((sec) => {
            if (sec.id !== sectionId) return sec
            return {
              ...sec,
              lines: sec.lines.filter((line) => line.id !== lineId),
            }
          }),
        },
      }))
    }

    const updateLine = (sectionId, lineId, patch) => {
      setState((prev) => ({
        ...prev,
        hymn: {
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
        },
      }))
    }

    const transposeHymn = (steps) => {
      if (!steps) return

      setState((prev) => ({
        ...prev,
        hymn: {
          ...prev.hymn,
          key: transposeChord(prev.hymn.key || '', steps),
          sections: prev.hymn.sections.map((section) => ({
            ...section,
            lines: section.lines.map((line) => {
              const normalized = normalizeLineStructure(line)
              return {
                ...normalized,
                wordChords: normalized.wordChords.map((chord) => transposeChord(chord || '', steps)),
                gapChords: normalized.gapChords.map((group) =>
                  group.map((chord) => transposeChord(chord || '', steps)),
                ),
              }
            }),
          })),
        },
      }))
    }

    const setMode = (mode) => setState((prev) => ({ ...prev, mode }))
    const toggleTheme = () =>
      setState((prev) => ({
        ...prev,
        theme: prev.theme === 'dark' ? 'light' : 'dark',
      }))

    const importProject = (project) => {
      setState(normalizeProject(project))
    }

    const resetProject = () => {
      setState((prev) => createFreshState(prev.theme))
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
