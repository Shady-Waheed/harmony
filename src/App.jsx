import { useEffect, useMemo, useRef, useState } from 'react'
import AdminDashboard from './components/AdminDashboard'
import HymnEditor from './components/HymnEditor'
import HymnView from './components/HymnView'
import { HymnProvider, useHymnStore } from './store/hymnStore.jsx'
import { exportNodeToPng } from './utils/exportImage'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, googleProvider, hasFirebaseConfig } from './firebase'
import { canAccessTeamDashboard, resolvePermissions, SETTINGS_TEAM_DOC } from './utils/permissions'
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
      const {
        gapChords = [],
        gapInversions = [],
        beforeWordChords = [],
        beforeWordInversions = [],
        afterWordChords = [],
        afterWordInversions = [],
        ...lineRest
      } = line
      const gapEntries = gapChords.map((group, index) => ({
        chords: Array.isArray(group) ? group : [],
        inversions: Array.isArray(gapInversions[index]) ? gapInversions[index] : [],
      }))
      const beforeWordEntries = beforeWordChords.map((group, index) => ({
        chords: Array.isArray(group) ? group : [],
        inversions: Array.isArray(beforeWordInversions[index]) ? beforeWordInversions[index] : [],
      }))
      const afterWordEntries = afterWordChords.map((group, index) => ({
        chords: Array.isArray(group) ? group : [],
        inversions: Array.isArray(afterWordInversions[index]) ? afterWordInversions[index] : [],
      }))

      return {
        ...lineRest,
        wordInversions: Array.isArray(line.wordInversions) ? line.wordInversions : [],
        gapEntries,
        beforeWordEntries,
        afterWordEntries,
      }
    }),
  }))
}

function decodeSectionsFromFirestore(sections = []) {
  return (sections || []).map((section) => ({
    ...section,
    lines: (section.lines || []).map((line) => {
      const { gapEntries = [], beforeWordEntries = [], afterWordEntries = [], ...lineRest } = line
      return {
        ...lineRest,
        gapChords: gapEntries.map((entry) => (Array.isArray(entry?.chords) ? entry.chords : [])),
        gapInversions: gapEntries.map((entry) => (Array.isArray(entry?.inversions) ? entry.inversions : [])),
        beforeWordChords: beforeWordEntries.map((entry) => (Array.isArray(entry?.chords) ? entry.chords : [])),
        beforeWordInversions: beforeWordEntries.map((entry) => (Array.isArray(entry?.inversions) ? entry.inversions : [])),
        afterWordChords: afterWordEntries.map((entry) => (Array.isArray(entry?.chords) ? entry.chords : [])),
        afterWordInversions: afterWordEntries.map((entry) => (Array.isArray(entry?.inversions) ? entry.inversions : [])),
      }
    }),
  }))
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

function AppShell() {
  const { state, updateHymn, setMode, toggleTheme, importProject, resetProject, loadHymn, createNewHymn, transposeHymn, setPersistFullHymn } =
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

  const [teamData, setTeamData] = useState(null)
  const [showAdminDashboard, setShowAdminDashboard] = useState(false)
  const [savingTeam, setSavingTeam] = useState(false)

  const isDark = state.theme === 'dark'
  const perms = useMemo(() => resolvePermissions(currentUser, teamData || {}), [currentUser, teamData])
  const isAdmin = perms.isAdmin
  const isSuperAdmin = perms.isSuperAdmin
  const canDelete = perms.canDelete
  const canSaveFirebase = perms.canSaveFirebase
  const canManageTeam = useMemo(
    () => canAccessTeamDashboard(currentUser, teamData || {}),
    [currentUser, teamData],
  )

  const showFirebaseSaveBtn = canSaveFirebase && hasFirebaseConfig
  const showFirebaseDeleteBtn = canDelete && hasFirebaseConfig
  const showFirebaseSidebarActions = showFirebaseSaveBtn || showFirebaseDeleteBtn

  const visibleHymns = useMemo(
    () =>
      hymns.filter((item) => {
        const exclusiveOwnerUid = String(item.exclusiveOwnerUid || '')
        const isExclusive = Boolean(item.isExclusive) || exclusiveOwnerUid.length > 0
        if (!isExclusive) return true
        if (!currentUser) return false
        return exclusiveOwnerUid === String(currentUser.uid || '')
      }),
    [hymns, currentUser],
  )

  const filteredHymns = useMemo(
    () => visibleHymns.filter((item) => hymnTitleMatches(item.title, hymnSearchQuery)),
    [visibleHymns, hymnSearchQuery],
  )

  const teamMembersForDashboard = useMemo(() => teamData?.members || [], [teamData])

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
    if (!db || !hasFirebaseConfig || authLoading || !currentUser) {
      if (!authLoading && !currentUser) {
        setTeamData(null)
      }
      return
    }

    const teamRef = doc(db, SETTINGS_TEAM_DOC.collection, SETTINGS_TEAM_DOC.id)
    const unsubscribe = onSnapshot(
      teamRef,
      (snapshot) => {
        setTeamData(snapshot.exists() ? snapshot.data() : { members: [] })
      },
      (err) => {
        // قراءة settings/team تتطلب تسجيل دخول؛ لا نعرض خطأ القراءة كقائمة فارغة (يُربك وقد يُفسّر كمسح من السيرفر)
        console.warn('[settings/team snapshot]', err?.code || err?.message || err)
        setTeamData(null)
      },
    )
    return () => unsubscribe()
  }, [hasFirebaseConfig, authLoading, currentUser?.uid])

  useEffect(() => {
    if (!canAccessTeamDashboard(currentUser, teamData || {})) {
      setShowAdminDashboard(false)
    }
  }, [currentUser, teamData])

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
    const exclusiveOwnerUid = String(hymnDoc.exclusiveOwnerUid || '')
    const isExclusive = Boolean(hymnDoc.isExclusive) || exclusiveOwnerUid.length > 0
    const canOpenExclusive = !isExclusive || (currentUser && exclusiveOwnerUid === String(currentUser.uid || ''))
    if (!canOpenExclusive) {
      showNotice('هذه الترانيمة حصرية وغير متاحة لهذا الحساب.', 'error')
      return
    }
    setSelectedHymnId(hymnDoc.id)
    loadHymn({
      id: hymnDoc.id,
      title: hymnDoc.title || '',
      key: hymnDoc.key || '',
      sections: decodeSectionsFromFirestore(hymnDoc.sections || []),
      isExclusive,
      exclusiveOwnerUid,
    })
  }

  const onNewNote = () => {
    if (!isAdmin) return
    setSelectedHymnId('')
    createNewHymn()
  }

  const onSaveHymnToFirebase = async () => {
    if (!canSaveFirebase) {
      showNotice('ليس لديك صلاحية حفظ الترانيم على السيرفر.', 'error')
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
      isExclusive: isSuperAdmin ? Boolean(state.hymn.isExclusive) : false,
      exclusiveOwnerUid: isSuperAdmin && state.hymn.isExclusive ? String(currentUser?.uid || '') : '',
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

  const onSaveTeamMembers = async (payload) => {
    if (!db || !hasFirebaseConfig || !canAccessTeamDashboard(currentUser, teamData || {})) {
      return
    }
    const members = Array.isArray(payload) ? payload : payload.members
    const ignoreEnvAdminList = Array.isArray(payload) ? false : Boolean(payload.ignoreEnvAdminList)
    try {
      setSavingTeam(true)
      await setDoc(
        doc(db, SETTINGS_TEAM_DOC.collection, SETTINGS_TEAM_DOC.id),
        {
          members,
          ignoreEnvAdminList,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      showNotice('تم حفظ صلاحيات الفريق.', 'success')
    } catch (error) {
      showNotice(`فشل حفظ الصلاحيات: ${error.message}`, 'error')
    } finally {
      setSavingTeam(false)
    }
  }

  if (showAdminDashboard && canManageTeam) {
    return (
      <div className={`app ${state.theme}`} dir="rtl" lang="ar">
        <header className="topBar">
          <div>
            <h1>Harmony Notes — لوحة المشرف</h1>
            <p>إدارة صلاحيات الحسابات المسجّلة</p>
          </div>
          <div className="row wrap">
            <button type="button" className="btn primary" onClick={() => setShowAdminDashboard(false)}>
              العودة للتطبيق
            </button>
            <button className="btn" onClick={toggleTheme}>
              {isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
            </button>
            {!authLoading && currentUser ? (
              <button className="btn" onClick={onAdminSignOut}>
                خروج
              </button>
            ) : null}
          </div>
        </header>
        <main className="content adminDashboardPage">
          <AdminDashboard
            members={teamMembersForDashboard}
            ignoreEnvAdminList={Boolean(teamData?.ignoreEnvAdminList)}
            saving={savingTeam}
            onSave={onSaveTeamMembers}
            onBack={() => setShowAdminDashboard(false)}
          />
        </main>
        {notice ? <div className={`toastNotice ${notice.type}`}>{notice.message}</div> : null}
      </div>
    )
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
          {isAdmin ? (
            <>
              <button className="btn" onClick={onSaveProjectFile}>
                حفظ ملف المشروع
              </button>
              <button className="btn" onClick={onOpenProjectClick}>
                استيراد ملف المشروع
              </button>
            </>
          ) : null}
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
          {canManageTeam ? (
            <button type="button" className="btn primary" onClick={() => setShowAdminDashboard(true)}>
              لوحة الصلاحيات
            </button>
          ) : null}
          {isAdmin ? (
            <input
              ref={projectFileInputRef}
              type="file"
              accept={`${PROJECT_EXTENSION},application/json`}
              onChange={onImportProjectFile}
              hidden
            />
          ) : null}
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
                  {filteredHymns.length === visibleHymns.length
                    ? `${visibleHymns.length} ترنيمة`
                    : `${filteredHymns.length} من ${visibleHymns.length}`}
                </p>
              ) : null}
            </div>
          ) : null}

          {showFirebaseSidebarActions ? (
            <div className="row wrap sidebarActions">
              {isSuperAdmin ? (
                <label className="adminDashToggle">
                  <input
                    type="checkbox"
                    checked={Boolean(state.hymn.isExclusive)}
                    onChange={(e) => updateHymn({ isExclusive: e.target.checked })}
                  />
                  <span>حصرية لي فقط</span>
                </label>
              ) : null}
              {showFirebaseSaveBtn ? (
                <button className="btn primary" onClick={onSaveHymnToFirebase} disabled={savingHymn}>
                  {savingHymn ? 'جاري الحفظ...' : selectedHymnId ? 'تحديث' : 'حفظ'}
                </button>
              ) : null}
              {showFirebaseDeleteBtn ? (
                <button className="btn danger" onClick={onDeleteHymnFromFirebase} disabled={!selectedHymnId || deletingHymn}>
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
                    {Boolean(hymnItem.isExclusive) ? <small> (حصرية)</small> : null}
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
