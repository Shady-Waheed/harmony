import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeLineStructure } from '../utils/lineChords'
import { transposeChord } from '../utils/chords'
import { clearDraft, getDraft, writeDraft } from '../utils/hymnDrafts'

const STORAGE_KEY = 'harmony-notes-hymn-v2'
const HISTORY_LIMIT = 50
const HISTORY_GROUP_MS = 800

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

function cloneHymn(hymn) {
  return JSON.parse(JSON.stringify(hymn))
}

function hymnsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
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

function withHistoryFields(project) {
  return {
    ...project,
    undoStack: [],
    redoStack: [],
    lastSavedHymn: project.lastSavedHymn || null,
  }
}

function normalizeProject(project) {
  const hymn = normalizeHymn(project?.hymn || defaultHymn)
  return withHistoryFields({
    hymn,
    committedHymn: hymn,
    mode: project?.mode === 'view' ? 'view' : 'edit',
    theme: project?.theme === 'light' ? 'light' : 'dark',
    lastSavedHymn: null,
  })
}

function createFreshState(theme = 'dark') {
  const hymn = normalizeHymn(defaultHymn)
  return withHistoryFields({
    hymn,
    committedHymn: hymn,
    mode: 'edit',
    theme: theme === 'light' ? 'light' : 'dark',
    lastSavedHymn: cloneHymn(hymn),
  })
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
          beforeWordChords: normalized.beforeWordChords.map((group) => group.map((chord) => transposeChord(chord || '', steps))),
          afterWordChords: normalized.afterWordChords.map((group) => group.map((chord) => transposeChord(chord || '', steps))),
        }
      }),
    })),
  }
}

export function HymnProvider({ children }) {
  const persistFullHymnRef = useRef(true)
  const historyGroupRef = useRef(0)
  const [state, setState] = useState(loadInitial)
  const [persistRevision, setPersistRevision] = useState(0)
  const stateRef = useRef(state)
  stateRef.current = state

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
  }, [state.hymn, state.committedHymn, state.mode, state.theme, persistRevision])

  useEffect(() => {
    if (!persistFullHymnRef.current) return undefined
    const id = state.hymn?.id
    if (!id) return undefined
    const timer = window.setTimeout(() => {
      if (state.lastSavedHymn && hymnsEqual(state.hymn, state.lastSavedHymn)) {
        clearDraft(id)
        return
      }
      writeDraft(id, state.hymn)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [state.hymn, state.lastSavedHymn])

  const actions = useMemo(() => {
    const withCommitted = (prev, nextHymn) => ({
      ...prev,
      hymn: nextHymn,
      committedHymn: persistFullHymnRef.current ? nextHymn : prev.committedHymn,
    })

    const applyHymn = (prev, nextHymn, grouped = false) => {
      if (hymnsEqual(prev.hymn, nextHymn)) return prev
      const now = Date.now()
      const skipPush = grouped && now - historyGroupRef.current < HISTORY_GROUP_MS
      if (grouped) historyGroupRef.current = now
      else historyGroupRef.current = 0

      const withStacks = skipPush
        ? prev
        : {
            ...prev,
            undoStack: [...(prev.undoStack || []), cloneHymn(prev.hymn)].slice(-HISTORY_LIMIT),
            redoStack: [],
          }
      return withCommitted(withStacks, nextHymn)
    }

    const updateHymn = (patch) => {
      setState((prev) => applyHymn(prev, { ...prev.hymn, ...patch }, true))
    }

    const loadHymn = (hymn, options = {}) => {
      const normalized = normalizeHymn(hymn)
      const draft = persistFullHymnRef.current && options.useDraft !== false ? getDraft(normalized.id) : null
      const working =
        draft?.hymn && !options.ignoreDraft
          ? normalizeHymn({ ...draft.hymn, id: normalized.id })
          : normalized
      historyGroupRef.current = 0
      setState((prev) => ({
        ...prev,
        hymn: working,
        committedHymn: persistFullHymnRef.current ? working : normalized,
        lastSavedHymn: cloneHymn(normalized),
        undoStack: [],
        redoStack: [],
        mode: options.mode || prev.mode,
      }))
    }

    const createNewHymn = () => {
      const empty = createEmptyHymn()
      historyGroupRef.current = 0
      setState((prev) => ({
        ...prev,
        hymn: empty,
        committedHymn: empty,
        lastSavedHymn: cloneHymn(empty),
        undoStack: [],
        redoStack: [],
        mode: 'edit',
      }))
    }

    const addSection = () => {
      setState((prev) =>
        applyHymn(prev, {
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
        applyHymn(prev, {
          ...prev.hymn,
          sections: prev.hymn.sections.filter((sec) => sec.id !== sectionId),
        }),
      )
    }

    const updateSectionTitle = (sectionId, title) => {
      setState((prev) =>
        applyHymn(
          prev,
          {
            ...prev.hymn,
            sections: prev.hymn.sections.map((sec) => (sec.id === sectionId ? { ...sec, title } : sec)),
          },
          true,
        ),
      )
    }

    const addLine = (sectionId) => {
      setState((prev) =>
        applyHymn(prev, {
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
        applyHymn(prev, {
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
        applyHymn(
          prev,
          {
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
          true,
        ),
      )
    }

    const transposeHymn = (steps) => {
      if (!steps) return
      setState((prev) => applyHymn(prev, transposeHymnShape(prev.hymn, steps)))
    }

    const undo = () => {
      historyGroupRef.current = 0
      setState((prev) => {
        const undoStack = [...(prev.undoStack || [])]
        if (!undoStack.length) return prev
        const previous = undoStack.pop()
        return {
          ...prev,
          hymn: previous,
          committedHymn: persistFullHymnRef.current ? previous : prev.committedHymn,
          undoStack,
          redoStack: [...(prev.redoStack || []), cloneHymn(prev.hymn)].slice(-HISTORY_LIMIT),
        }
      })
    }

    const redo = () => {
      historyGroupRef.current = 0
      setState((prev) => {
        const redoStack = [...(prev.redoStack || [])]
        if (!redoStack.length) return prev
        const next = redoStack.pop()
        return {
          ...prev,
          hymn: next,
          committedHymn: persistFullHymnRef.current ? next : prev.committedHymn,
          redoStack,
          undoStack: [...(prev.undoStack || []), cloneHymn(prev.hymn)].slice(-HISTORY_LIMIT),
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
      historyGroupRef.current = 0
      setState((prev) => ({ ...prev, ...normalizeProject(project), theme: prev.theme }))
    }

    const resetProject = () => {
      historyGroupRef.current = 0
      setState((prev) => ({ ...prev, ...createFreshState(prev.theme) }))
    }

    const markHymnSaved = (hymn) => {
      const normalized = normalizeHymn(hymn)
      clearDraft(normalized.id)
      setState((prev) => ({
        ...prev,
        lastSavedHymn: cloneHymn(normalized),
      }))
    }

    const syncLastSavedIfEmpty = (hymn) => {
      const normalized = normalizeHymn(hymn)
      setState((prev) => {
        if (prev.lastSavedHymn) return prev
        return { ...prev, lastSavedHymn: cloneHymn(normalized) }
      })
    }

    const saveDraftNow = () => {
      const id = stateRef.current.hymn?.id
      if (id) writeDraft(id, stateRef.current.hymn)
    }

    const discardDraft = () => {
      setState((prev) => {
        if (!prev.lastSavedHymn) return prev
        clearDraft(prev.hymn.id)
        historyGroupRef.current = 0
        const restored = cloneHymn(prev.lastSavedHymn)
        return {
          ...prev,
          hymn: restored,
          committedHymn: persistFullHymnRef.current ? restored : prev.committedHymn,
          undoStack: [],
          redoStack: [],
        }
      })
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
      undo,
      redo,
      setMode,
      toggleTheme,
      importProject,
      resetProject,
      setPersistFullHymn,
      markHymnSaved,
      syncLastSavedIfEmpty,
      saveDraftNow,
      discardDraft,
    }
  }, [setPersistFullHymn])

  const isDirty = useMemo(() => {
    if (!state.lastSavedHymn) return Boolean(state.hymn?.title || state.hymn?.sections?.length)
    return !hymnsEqual(state.hymn, state.lastSavedHymn)
  }, [state.hymn, state.lastSavedHymn])

  const canUndo = (state.undoStack || []).length > 0
  const canRedo = (state.redoStack || []).length > 0

  const value = useMemo(
    () => ({ state, isDirty, canUndo, canRedo, ...actions }),
    [state, isDirty, canUndo, canRedo, actions],
  )
  return <HymnContext.Provider value={value}>{children}</HymnContext.Provider>
}

export function useHymnStore() {
  const ctx = useContext(HymnContext)
  if (!ctx) throw new Error('useHymnStore must be used inside HymnProvider')
  return ctx
}
