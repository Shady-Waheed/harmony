import { useEffect, useMemo, useRef, useState } from 'react'
import HymnEditor from './components/HymnEditor'
import HymnView from './components/HymnView'
import { HymnProvider, useHymnStore } from './store/hymnStore.jsx'
import { exportNodeToPng } from './utils/exportImage'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider, hasFirebaseConfig } from './firebase'
import {
  downloadProjectFile,
  parseProjectFileContent,
  PROJECT_EXTENSION,
  readTextFile,
} from './utils/projectFile'

const EXPORT_LOGO_URL = '/harmony-notes-logo.png'

function encodeSectionsForFirestore(sections = []) {
  return (sections || []).map((section) => ({
    ...section,
    lines: (section.lines || []).map((line) => {
      const { gapChords = [], gapInversions = [], ...lineRest } = line
      const gapEntries = gapChords.map((group, index) => ({
        chords: Array.isArray(group) ? group : [],
        inversions: Array.isArray(gapInversions[index]) ? gapInversions[index] : [],
      }))

      return {
        ...lineRest,
        wordInversions: Array.isArray(line.wordInversions) ? line.wordInversions : [],
        gapEntries,
      }
    }),
  }))
}

function decodeSectionsFromFirestore(sections = []) {
  return (sections || []).map((section) => ({
    ...section,
    lines: (section.lines || []).map((line) => {
      const { gapEntries = [], ...lineRest } = line
      return {
        ...lineRest,
        gapChords: gapEntries.map((entry) => (Array.isArray(entry?.chords) ? entry.chords : [])),
        gapInversions: gapEntries.map((entry) => (Array.isArray(entry?.inversions) ? entry.inversions : [])),
      }
    }),
  }))
}

function isAdminUser(user) {
  if (!user) return false
  const allowedEmails = String(import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  const allowedUids = String(import.meta.env.VITE_ADMIN_UIDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const email = String(user.email || '').toLowerCase()
  const uid = String(user.uid || '')
  return allowedEmails.includes(email) || allowedUids.includes(uid)
}

function normalizeHymnSearchText(value) {
  return String(value || '')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function hymnTitleMatches(title, query) {
  const q = normalizeHymnSearchText(query)
  if (!q) return true
  return normalizeHymnSearchText(title).includes(q)
}

function canDeleteHymns(user) {
  if (!user) return false
  const allowedEmails = String(import.meta.env.VITE_DELETE_EMAILS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  const allowedUids = String(import.meta.env.VITE_DELETE_UIDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (allowedEmails.length === 0 && allowedUids.length === 0) {
    return isAdminUser(user)
  }

  const email = String(user.email || '').toLowerCase()
  const uid = String(user.uid || '')
  return allowedEmails.includes(email) || allowedUids.includes(uid)
}

function AppShell() {
  const { state, setMode, toggleTheme, importProject, resetProject, loadHymn, createNewHymn, transposeHymn, setPersistFullHymn } =
    useHymnStore()
  const [loadingExport, setLoadingExport] = useState(false)
  const [hymns, setHymns] = useState([])
  const [loadingHymns, setLoadingHymns] = useState(true)
  const [selectedHymnId, setSelectedHymnId] = useState('')
  const [savingHymn, setSavingHymn] = useState(false)
  const [deletingHymn, setDeletingHymn] = useState(false)
  const [notice, setNotice] = useState(null)
  const [hymnSearchQuery, setHymnSearchQuery] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const viewRef = useRef(null)
  const projectFileInputRef = useRef(null)
  const noticeTimeoutRef = useRef(null)

  const isDark = state.theme === 'dark'
  const isAdmin = isAdminUser(currentUser)
  const canDelete = canDeleteHymns(currentUser)

  const filteredHymns = useMemo(
    () => hymns.filter((item) => hymnTitleMatches(item.title, hymnSearchQuery)),
    [hymns, hymnSearchQuery],
  )

  const showNotice = (message, type = 'info') => {
    setNotice({ message, type })
    window.clearTimeout(noticeTimeoutRef.current)
    noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), 2800)
  }

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!db || !hasFirebaseConfig || authLoading) {
      if (!authLoading) {
        setLoadingHymns(false)
      }
      return
    }

    setLoadingHymns(true)
    const hymnsQuery = query(collection(db, 'hymns'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(
      hymnsQuery,
      (snapshot) => {
        const nextHymns = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setHymns(nextHymns)
        setLoadingHymns(false)
      },
      () => {
        setHymns([])
        setLoadingHymns(false)
      },
    )

    return () => unsubscribe()
  }, [authLoading, currentUser?.uid])

  useEffect(() => {
    if (!isAdmin && state.mode !== 'view') {
      setMode('view')
    }
  }, [isAdmin, setMode, state.mode])

  useEffect(() => {
    setPersistFullHymn(isAdmin)
  }, [isAdmin, setPersistFullHymn])

  useEffect(() => {
    return () => window.clearTimeout(noticeTimeoutRef.current)
  }, [])

  const onSelectHymn = (hymnDoc) => {
    setSelectedHymnId(hymnDoc.id)
    loadHymn({
      id: hymnDoc.id,
      title: hymnDoc.title || '',
      key: hymnDoc.key || '',
      sections: decodeSectionsFromFirestore(hymnDoc.sections || []),
    })
  }

  const onNewNote = () => {
    if (!isAdmin) return
    setSelectedHymnId('')
    createNewHymn()
  }

  const onSaveHymnToFirebase = async () => {
    if (!isAdmin) {
      showNotice('الوضع الحالي للقراءة فقط. سجّل دخول أدمن للتعديل.', 'error')
      return
    }
    if (!db || !hasFirebaseConfig) return
    const title = String(state.hymn.title || '').trim()
    if (!title) {
      showNotice('اكتب عنوان الترانيمة قبل الحفظ.', 'error')
      return
    }

    const payload = {
      title,
      key: state.hymn.key || '',
      sections: encodeSectionsForFirestore(state.hymn.sections || []),
      updatedAt: serverTimestamp(),
    }

    try {
      setSavingHymn(true)
      if (selectedHymnId) {
        await setDoc(doc(db, 'hymns', selectedHymnId), payload, { merge: true })
        showNotice('تم تحديث الترانيمة.', 'success')
        return
      }

      const created = await addDoc(collection(db, 'hymns'), {
        ...payload,
        createdAt: serverTimestamp(),
      })
      setSelectedHymnId(created.id)
      loadHymn({ ...state.hymn, id: created.id })
      showNotice('تم حفظ ترنيمة جديدة.', 'success')
    } catch (error) {
      showNotice(`فشل الحفظ: ${error.message}`, 'error')
    } finally {
      setSavingHymn(false)
    }
  }

  const onDeleteHymnFromFirebase = async () => {
    if (!canDelete) {
      showNotice('ليس لديك صلاحية حذف الترانيم.', 'error')
      return
    }
    if (!db || !hasFirebaseConfig || !selectedHymnId) return
    const confirmed = window.confirm('هل تريد حذف هذه الترانيمة نهائيًا؟')
    if (!confirmed) return

    try {
      setDeletingHymn(true)
      await deleteDoc(doc(db, 'hymns', selectedHymnId))
      onNewNote()
      showNotice('تم حذف الترانيمة.', 'success')
    } catch (error) {
      showNotice(`فشل الحذف: ${error.message}`, 'error')
    } finally {
      setDeletingHymn(false)
    }
  }

  const onExport = async () => {
    if (!viewRef.current) return
    try {
      setLoadingExport(true)
      await exportNodeToPng(viewRef.current, `${state.hymn.title || 'harmony-notes'}.png`, isDark, {
        logoUrl: EXPORT_LOGO_URL,
        desktopWidth: 1140,
      })
    } catch (error) {
      showNotice(`فشل التصدير: ${error.message}`, 'error')
    } finally {
      setLoadingExport(false)
    }
  }

  const onSaveProjectFile = () => {
    try {
      downloadProjectFile(state)
    } catch (error) {
      showNotice(`فشل حفظ الملف: ${error.message}`, 'error')
    }
  }

  const onOpenProjectClick = () => {
    projectFileInputRef.current?.click()
  }

  const onImportProjectFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const content = await readTextFile(file)
      const project = parseProjectFileContent(content)
      importProject(project)
      showNotice('تم استيراد المشروع بنجاح.', 'success')
    } catch (error) {
      showNotice(`فشل استيراد الملف: ${error.message}`, 'error')
    } finally {
      event.target.value = ''
    }
  }

  const onResetProject = () => {
    if (!isAdmin) {
      showNotice('الوضع الحالي للقراءة فقط. سجّل دخول أدمن للتعديل.', 'error')
      return
    }
    const confirmed = window.confirm('هل تريد البدء من الأول؟ سيتم مسح كل التعديلات الحالية.')
    if (!confirmed) return
    resetProject()
  }

  const onAdminSignIn = async () => {
    if (!auth) return
    try {
      await signInWithPopup(auth, googleProvider)
      showNotice('تم تسجيل الدخول.', 'success')
    } catch (error) {
      const message =
        error?.code === 'auth/operation-not-allowed'
          ? 'طريقة تسجيل الدخول غير مفعلة. فعّل Google من Firebase Authentication > Sign-in method.'
          : `فشل تسجيل الدخول: ${error.message}`
      showNotice(message, 'error')
    }
  }

  const onAdminSignOut = async () => {
    if (!auth) return
    try {
      await signOut(auth)
      showNotice('تم تسجيل الخروج.', 'success')
    } catch (error) {
      showNotice(`فشل تسجيل الخروج: ${error.message}`, 'error')
    }
  }

  return (
    <div className={`app ${state.theme}`} dir="rtl" lang="ar">
      <header className="topBar">
        <div>
          <h1>Harmony Notes</h1>
          <p>محرر ترانيم احترافي لكتابة الكوردات وعرضها</p>
        </div>

        <div className="row wrap">
          {isAdmin ? (
            <button className={`btn ${state.mode === 'edit' ? 'primary' : ''}`} onClick={() => setMode('edit')}>
              وضع التعديل
            </button>
          ) : null}
          <button className={`btn ${state.mode === 'view' ? 'primary' : ''}`} onClick={() => setMode('view')}>
            وضع العرض
          </button>
          <button className="btn" onClick={onSaveProjectFile}>
            حفظ ملف المشروع
          </button>
          <button className="btn" onClick={onOpenProjectClick}>
            استيراد ملف المشروع
          </button>
          <button className="btn" onClick={onExport} disabled={loadingExport}>
            {loadingExport ? 'جاري التصدير...' : 'تصدير PNG (HD)'}
          </button>
          {!authLoading && !currentUser ? (
            <button className="btn primary" onClick={onAdminSignIn}>
              دخول أدمن
            </button>
          ) : null}
          {!authLoading && currentUser ? (
            <button className="btn" onClick={onAdminSignOut}>
              خروج
            </button>
          ) : null}
          <input
            ref={projectFileInputRef}
            type="file"
            accept={`${PROJECT_EXTENSION},application/json`}
            onChange={onImportProjectFile}
            hidden
          />
        </div>
      </header>

      <main className="content withSidebar">
        <aside className="card hymnsSidebar">
          <p className={`roleBadge ${isAdmin ? 'admin' : 'viewer'}`}>
            {isAdmin
              ? `أدمن: ${currentUser?.email || currentUser?.uid || 'مُسجل'}`
              : currentUser
                ? 'مستخدم مسجل (قراءة فقط)'
                : 'وضع القراءة فقط'}
          </p>
          <div className="row between sidebarHeader">
            <h3>الترانيم المحفوظة</h3>
            {isAdmin ? (
              <button className="btn primary" onClick={onNewNote}>
                New Note
              </button>
            ) : null}
          </div>

          {hasFirebaseConfig ? (
            <div className="hymnSearchWrap">
              <input
                id="hymn-search"
                type="search"
                className="input hymnSearchInput"
                placeholder="بحث باسم الترنيمة…"
                value={hymnSearchQuery}
                onChange={(e) => setHymnSearchQuery(e.target.value)}
                disabled={loadingHymns}
                autoComplete="off"
                spellCheck={false}
                aria-label="بحث باسم الترنيمة"
              />
              {!loadingHymns && hymns.length > 0 ? (
                <p className="hymnSearchMeta" aria-live="polite">
                  {filteredHymns.length === hymns.length
                    ? `${hymns.length} ترنيمة`
                    : `${filteredHymns.length} من ${hymns.length}`}
                </p>
              ) : null}
            </div>
          ) : null}

          {isAdmin || canDelete ? (
            <div className="row wrap sidebarActions">
              {isAdmin ? (
                <button className="btn primary" onClick={onSaveHymnToFirebase} disabled={!hasFirebaseConfig || savingHymn}>
                  {savingHymn ? 'جاري الحفظ...' : selectedHymnId ? 'تحديث' : 'حفظ'}
                </button>
              ) : null}
              {canDelete ? (
                <button className="btn danger" onClick={onDeleteHymnFromFirebase} disabled={!hasFirebaseConfig || !selectedHymnId || deletingHymn}>
                  {deletingHymn ? 'جاري الحذف...' : 'حذف الترانيمة'}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="row sidebarTransposeActions">
            <button className="btn" onClick={() => transposeHymn(-1)} title="Transpose -1 semitone" aria-label="Transpose down">
              -
            </button>
            <button className="btn" onClick={() => transposeHymn(1)} title="Transpose +1 semitone" aria-label="Transpose up">
              +
            </button>
          </div>

          {!hasFirebaseConfig ? (
            <p className="sidebarHint">Firebase غير مهيأ. أضف متغيرات VITE_FIREBASE_* لعرض القائمة.</p>
          ) : null}

          {hasFirebaseConfig && loadingHymns ? <p className="sidebarHint">جاري تحميل الترانيم...</p> : null}

          {hasFirebaseConfig && !loadingHymns && hymns.length === 0 ? (
            <p className="sidebarHint">لا توجد ترانيم محفوظة حاليًا.</p>
          ) : null}

          {hasFirebaseConfig && !loadingHymns && hymns.length > 0 && filteredHymns.length === 0 ? (
            <p className="sidebarHint">لا توجد ترانيم تطابق «{hymnSearchQuery.trim() || '…'}». جرّب حروف أقل أو امسح البحث.</p>
          ) : null}

          {hasFirebaseConfig && !loadingHymns && filteredHymns.length > 0 ? (
            <ul className="hymnList">
              {filteredHymns.map((hymnItem) => (
                <li key={hymnItem.id}>
                  <button
                    className={`hymnListItem ${selectedHymnId === hymnItem.id ? 'active' : ''}`}
                    onClick={() => onSelectHymn(hymnItem)}
                  >
                    <span>{hymnItem.title || 'ترنيمة بدون عنوان'}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>

        <div className="editorPane">
          {state.mode === 'edit' && isAdmin ? <HymnEditor /> : <HymnView ref={viewRef} />}
        </div>
      </main>

      {state.mode === 'edit' && isAdmin ? (
        <section className="previewWrap">
          <h3>معاينة مباشرة</h3>
          <HymnView ref={viewRef} />
        </section>
      ) : null}

      {isAdmin ? (
        <button className="floatingResetBtn" onClick={onResetProject}>
          ابدأ من الأول
        </button>
      ) : null}

      <button
        className={`floatingThemeBtn ${isDark ? 'toLight' : 'toDark'}`}
        onClick={toggleTheme}
        title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
        aria-label={isDark ? 'التحويل إلى الوضع النهاري' : 'التحويل إلى الوضع الليلي'}
      >
        {isDark ? '☀' : '✦'}
      </button>

      {notice ? <div className={`toastNotice ${notice.type}`}>{notice.message}</div> : null}
    </div>
  )
}

function App() {
  return (
    <HymnProvider>
      <AppShell />
    </HymnProvider>
  )
}

export default App
