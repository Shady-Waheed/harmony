import { useEffect, useMemo, useRef, useState } from "react";
import AdminDashboard from "./components/AdminDashboard";
import HymnEditor from "./components/HymnEditor";
import HymnView from "./components/HymnView";
import { HymnProvider, useHymnStore } from "./store/hymnStore.jsx";
import { exportNodeToPng } from "./utils/exportImage";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db, googleProvider, hasFirebaseConfig } from "./firebase";
import {
  canAccessTeamDashboard,
  resolvePermissions,
  SETTINGS_TEAM_DOC,
} from "./utils/permissions";
import {
  downloadProjectFile,
  parseProjectFileContent,
  PROJECT_EXTENSION,
  readTextFile,
} from "./utils/projectFile";

const EXPORT_LOGO_URL = "/harmony-notes-logo.png";

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
      } = line;
      const gapEntries = gapChords.map((group, index) => ({
        chords: Array.isArray(group) ? group : [],
        inversions: Array.isArray(gapInversions[index])
          ? gapInversions[index]
          : [],
      }));
      const beforeWordEntries = beforeWordChords.map((group, index) => ({
        chords: Array.isArray(group) ? group : [],
        inversions: Array.isArray(beforeWordInversions[index])
          ? beforeWordInversions[index]
          : [],
      }));
      const afterWordEntries = afterWordChords.map((group, index) => ({
        chords: Array.isArray(group) ? group : [],
        inversions: Array.isArray(afterWordInversions[index])
          ? afterWordInversions[index]
          : [],
      }));

      return {
        ...lineRest,
        wordInversions: Array.isArray(line.wordInversions)
          ? line.wordInversions
          : [],
        gapEntries,
        beforeWordEntries,
        afterWordEntries,
      };
    }),
  }));
}

function decodeSectionsFromFirestore(sections = []) {
  return (sections || []).map((section) => ({
    ...section,
    lines: (section.lines || []).map((line) => {
      const {
        gapEntries = [],
        beforeWordEntries = [],
        afterWordEntries = [],
        ...lineRest
      } = line;
      return {
        ...lineRest,
        gapChords: gapEntries.map((entry) =>
          Array.isArray(entry?.chords) ? entry.chords : [],
        ),
        gapInversions: gapEntries.map((entry) =>
          Array.isArray(entry?.inversions) ? entry.inversions : [],
        ),
        beforeWordChords: beforeWordEntries.map((entry) =>
          Array.isArray(entry?.chords) ? entry.chords : [],
        ),
        beforeWordInversions: beforeWordEntries.map((entry) =>
          Array.isArray(entry?.inversions) ? entry.inversions : [],
        ),
        afterWordChords: afterWordEntries.map((entry) =>
          Array.isArray(entry?.chords) ? entry.chords : [],
        ),
        afterWordInversions: afterWordEntries.map((entry) =>
          Array.isArray(entry?.inversions) ? entry.inversions : [],
        ),
      };
    }),
  }));
}

function normalizeHymnSearchText(value) {
  return String(value || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hymnTitleMatches(title, query) {
  const q = normalizeHymnSearchText(query);
  if (!q) return true;
  return normalizeHymnSearchText(title).includes(q);
}

function AppShell() {
  const {
    state,
    updateHymn,
    setMode,
    toggleTheme,
    importProject,
    resetProject,
    loadHymn,
    createNewHymn,
    transposeHymn,
    setPersistFullHymn,
  } = useHymnStore();
  const [loadingExport, setLoadingExport] = useState(false);
  const [currentUser, setCurrentUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const viewRef = useRef(null)

  const isDark = state.theme === "dark";
  const perms = useMemo(
    () => resolvePermissions(currentUser, teamData || {}),
    [currentUser, teamData],
  );
  const isAdmin = perms.isAdmin;
  const isSuperAdmin = perms.isSuperAdmin;
  const canDelete = perms.canDelete;
  const canSaveFirebase = perms.canSaveFirebase;
  const canManageTeam = useMemo(
    () => canAccessTeamDashboard(currentUser, teamData || {}),
    [currentUser, teamData],
  );

  const showFirebaseSaveBtn = canSaveFirebase && hasFirebaseConfig;
  const showFirebaseDeleteBtn = canDelete && hasFirebaseConfig;
  const showFirebaseSidebarActions =
    showFirebaseSaveBtn || showFirebaseDeleteBtn;

  const visibleHymns = useMemo(
    () =>
      hymns.filter((item) => {
        const exclusiveOwnerUid = String(item.exclusiveOwnerUid || "");
        const isExclusive =
          Boolean(item.isExclusive) || exclusiveOwnerUid.length > 0;
        if (!isExclusive) return true;
        if (!currentUser) return false;
        return exclusiveOwnerUid === String(currentUser.uid || "");
      }),
    [hymns, currentUser],
  );

  const filteredHymns = useMemo(
    () =>
      visibleHymns.filter((item) =>
        hymnTitleMatches(item.title, hymnSearchQuery),
      ),
    [visibleHymns, hymnSearchQuery],
  );

  const teamMembersForDashboard = useMemo(
    () => teamData?.members || [],
    [teamData],
  );

  const showNotice = (message, type = "info") => {
    setNotice({ message, type });
    window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), 2800);
  };

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !hasFirebaseConfig || authLoading) {
      if (!authLoading) {
        setLoadingHymns(false);
      }
      return;
    }

    setLoadingHymns(true);
    const hymnsQuery = query(
      collection(db, "hymns"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribe = onSnapshot(
      hymnsQuery,
      (snapshot) => {
        const nextHymns = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setHymns(nextHymns);
        setLoadingHymns(false);
      },
      () => {
        setHymns([]);
        setLoadingHymns(false);
      },
    );

    return () => unsubscribe();
  }, [authLoading, currentUser?.uid]);

  useEffect(() => {
    if (!db || !hasFirebaseConfig || authLoading || !currentUser) {
      if (!authLoading && !currentUser) {
        setTeamData(null);
      }
      return;
    }

    const teamRef = doc(db, SETTINGS_TEAM_DOC.collection, SETTINGS_TEAM_DOC.id);
    const unsubscribe = onSnapshot(
      teamRef,
      (snapshot) => {
        setTeamData(snapshot.exists() ? snapshot.data() : { members: [] });
      },
      (err) => {
        // قراءة settings/team تتطلب تسجيل دخول؛ لا نعرض خطأ القراءة كقائمة فارغة (يُربك وقد يُفسّر كمسح من السيرفر)
        console.warn(
          "[settings/team snapshot]",
          err?.code || err?.message || err,
        );
        setTeamData(null);
      },
    );
    return () => unsubscribe();
  }, [hasFirebaseConfig, authLoading, currentUser?.uid]);

  useEffect(() => {
    if (!canAccessTeamDashboard(currentUser, teamData || {})) {
      setShowAdminDashboard(false);
    }
  }, [currentUser, teamData]);

  useEffect(() => {
    if (!isAdmin && state.mode !== "view") {
      setMode("view");
    }
  }, [isAdmin, setMode, state.mode]);

  useEffect(() => {
    setPersistFullHymn(isAdmin);
  }, [isAdmin, setPersistFullHymn]);

  useEffect(() => {
    return () => window.clearTimeout(noticeTimeoutRef.current);
  }, []);

  const onNewNote = () => {
    if (!isAdmin) return;
    createNewHymn();
  };





  const onExport = async () => {
    if (!viewRef.current) return;
    try {
      setLoadingExport(true);
      await exportNodeToPng(
        viewRef.current,
        `${state.hymn.title || "harmony-notes"}.png`,
        isDark,
        {
          logoUrl: EXPORT_LOGO_URL,
          desktopWidth: 1140,
        },
      );
    } catch (error) {
      showNotice(`فشل التصدير: ${error.message}`, "error");
    } finally {
      setLoadingExport(false);
    }
  };

  const onSaveProjectFile = () => {
    try {
      downloadProjectFile(state);
    } catch (error) {
      showNotice(`فشل حفظ الملف: ${error.message}`, "error");
    }
  };

  const onOpenProjectClick = () => {
    projectFileInputRef.current?.click();
  };

  const onImportProjectFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await readTextFile(file);
      const project = parseProjectFileContent(content);
      importProject(project);
      showNotice("تم استيراد المشروع بنجاح.", "success");
    } catch (error) {
      showNotice(`فشل استيراد الملف: ${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  };

  const onResetProject = () => {
    if (!isAdmin) {
      showNotice("الوضع الحالي للقراءة فقط. سجّل دخول أدمن للتعديل.", "error");
      return;
    }
    const confirmed = window.confirm(
      "هل تريد البدء من الأول؟ سيتم مسح كل التعديلات الحالية.",
    );
    if (!confirmed) return;
    resetProject();
  };

  const onAdminSignIn = async () => {
    if (!auth) return;
    try {
      await signInWithPopup(auth, googleProvider);
      showNotice("تم تسجيل الدخول.", "success");
    } catch (error) {
      const message =
        error?.code === "auth/operation-not-allowed"
          ? "طريقة تسجيل الدخول غير مفعلة. فعّل Google من Firebase Authentication > Sign-in method."
          : `فشل تسجيل الدخول: ${error.message}`;
      showNotice(message, "error");
    }
  };

  const onAdminSignOut = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      showNotice("تم تسجيل الخروج.", "success");
    } catch (error) {
      showNotice(`فشل تسجيل الخروج: ${error.message}`, "error");
    }
  };

  const onSaveTeamMembers = async (payload) => {
    if (
      !db ||
      !hasFirebaseConfig ||
      !canAccessTeamDashboard(currentUser, teamData || {})
    ) {
      return;
    }
    const members = Array.isArray(payload) ? payload : payload.members;
    const ignoreEnvAdminList = Array.isArray(payload)
      ? false
      : Boolean(payload.ignoreEnvAdminList);
    try {
      setSavingTeam(true);
      await setDoc(
        doc(db, SETTINGS_TEAM_DOC.collection, SETTINGS_TEAM_DOC.id),
        {
          members,
          ignoreEnvAdminList,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      showNotice("تم حفظ صلاحيات الفريق.", "success");
    } catch (error) {
      showNotice(`فشل حفظ الصلاحيات: ${error.message}`, "error");
    } finally {
      setSavingTeam(false);
    }
  };

  if (showAdminDashboard && canManageTeam) {
    return (
      <div className={`app ${state.theme}`} dir="rtl" lang="ar">
        <header className="topBar">
          <div>
            <h1>Harmony Notes — لوحة المشرف</h1>
            <p>إدارة صلاحيات الحسابات المسجّلة</p>
          </div>
          <div className="row wrap">
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowAdminDashboard(false)}
            >
              العودة للتطبيق
            </button>
            <button className="btn" onClick={toggleTheme}>
              {isDark ? "الوضع النهاري" : "الوضع الليلي"}
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
        {notice ? (
          <div className={`toastNotice ${notice.type}`}>{notice.message}</div>
        ) : null}
      </div>
    );
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
            <button
              className={`btn ${state.mode === "edit" ? "primary" : ""}`}
              onClick={() => setMode("edit")}
            >
              تعديل
            </button>
          ) : null}
          <button
            className={`btn ${state.mode === "view" ? "primary" : ""}`}
            onClick={() => setMode("view")}
          >
            عرض
          </button>
          {isAdmin ? (
            <button className="btn" onClick={onNewNote}>
              ترنيمة جديدة
            </button>
          ) : null}
          {isAdmin ? (
            <button className="btn" onClick={onSaveProjectFile}>
              حفظ ملف
            </button>
          ) : null}
          <button className="btn" onClick={onExport} disabled={loadingExport}>
            {loadingExport ? "تصدير..." : "تصدير PNG"}
          </button>
          <button className="btn" onClick={toggleTheme}>
            {isDark ? "نهاري" : "ليلي"}
          </button>
          {!authLoading && !currentUser ? (
            <button className="btn primary" onClick={onAdminSignIn}>
              دخول
            </button>
          ) : null}
          {!authLoading && currentUser ? (
            <button className="btn" onClick={onAdminSignOut}>
              خروج
            </button>
          ) : null}
        </div>
      </header>

      <main className="content simpleLayout">
        <div className="simpleEditorPane">
          {state.mode === "edit" && isAdmin ? (
            <HymnEditor />
          ) : (
            <HymnView ref={viewRef} />
          )}
        </div>
      </main>

      {isAdmin ? (
        <button className="floatingResetBtn" onClick={onResetProject}>
          ابدأ من الأول
        </button>
      ) : null}

      <button
        className={`floatingThemeBtn ${isDark ? "toLight" : "toDark"}`}
        onClick={toggleTheme}
        title={isDark ? "الوضع النهاري" : "الوضع الليلي"}
        aria-label={
          isDark ? "التحويل إلى الوضع النهاري" : "التحويل إلى الوضع الليلي"
        }
      >
        {isDark ? "☀" : "✦"}
      </button>

      {notice ? (
        <div className={`toastNotice ${notice.type}`}>{notice.message}</div>
      ) : null}
    </div>
  );
}

function App() {
  return (
    <HymnProvider>
      <AppShell />
    </HymnProvider>
  );
}

export default App;
