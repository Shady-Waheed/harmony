import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Timestamp,
  waitForPendingWrites,
} from "firebase/firestore";
import { auth, db, googleProvider, hasFirebaseConfig } from "./firebase";
import {
  canAccessTeamDashboard,
  resolvePermissions,
  SETTINGS_TEAM_DOC,
} from "./utils/permissions";
import {
  cacheUserPermissions,
  resolvePermissionsWithOfflineCache,
} from "./utils/permissionsCache";
import {
  downloadProjectFile,
  parseProjectFileContent,
  PROJECT_EXTENSION,
  readTextFile,
} from "./utils/projectFile";
import { useOfflineSync, isBrowserOffline, offlineSaveNotice } from "./hooks/useOfflineSync";
import { hymnShareUrl, useHymnRoute } from "./hooks/useHymnRoute";
import { hymnMatchesQuery } from "./utils/hymnSearch";
import SetlistPanel from "./components/SetlistPanel";

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
    markHymnSaved,
    syncLastSavedIfEmpty,
    saveDraftNow,
    discardDraft,
    isDirty,
    undo,
    redo,
  } = useHymnStore();
  const { routeHymnId, navigateHymn } = useHymnRoute();
  const [loadingExport, setLoadingExport] = useState(false);
  const [hymns, setHymns] = useState([]);
  const [loadingHymns, setLoadingHymns] = useState(true);
  const [selectedHymnId, setSelectedHymnId] = useState("");
  const [savingHymn, setSavingHymn] = useState(false);
  const [deletingHymn, setDeletingHymn] = useState(false);
  const [notice, setNotice] = useState(null);
  const [hymnSearchQuery, setHymnSearchQuery] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const viewRef = useRef(null);
  const projectFileInputRef = useRef(null);
  const noticeTimeoutRef = useRef(null);

  const [teamData, setTeamData] = useState(null);
  const [hymnsFromCache, setHymnsFromCache] = useState(false);
  const [teamFromCache, setTeamFromCache] = useState(false);
  const [pendingFirestoreWrites, setPendingFirestoreWrites] = useState(false);
  const pendingSyncNoticeRef = useRef(false);
  const lastRouteAttemptRef = useRef("");
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);

  const { status: syncStatus, label: syncLabel, online } = useOfflineSync({
    hymnsFromCache,
    teamFromCache,
    teamActive: Boolean(currentUser),
    hymnsReady: !loadingHymns,
    pendingWrites: pendingFirestoreWrites,
  });

  const isDark = state.theme === "dark";
  const perms = useMemo(
    () =>
      resolvePermissionsWithOfflineCache(
        currentUser,
        teamData || {},
        resolvePermissions,
        online,
      ),
    [currentUser, teamData, online],
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
      visibleHymns.filter((item) => hymnMatchesQuery(item, hymnSearchQuery)),
    [visibleHymns, hymnSearchQuery],
  );

  const teamMembersForDashboard = useMemo(
    () => teamData?.members || [],
    [teamData],
  );

  const showNotice = useCallback((message, type = "info") => {
    setNotice({ message, type });
    window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), 2800);
  }, []);

  useEffect(() => {
    if (currentUser && (perms.isAdmin || perms.canSaveFirebase || perms.canDelete)) {
      cacheUserPermissions(currentUser, perms);
    }
  }, [currentUser, perms]);

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
      { includeMetadataChanges: true },
      (snapshot) => {
        const nextHymns = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setHymns(nextHymns);
        setHymnsFromCache(snapshot.metadata.fromCache);
        setPendingFirestoreWrites(snapshot.metadata.hasPendingWrites);
        setLoadingHymns(false);
      },
      (err) => {
        console.warn("[hymns snapshot]", err?.code || err?.message || err);
        setLoadingHymns(false);
      },
    );

    return () => unsubscribe();
  }, [authLoading, currentUser?.uid]);

  useEffect(() => {
    if (!db || !hasFirebaseConfig || authLoading || !currentUser) {
      if (!authLoading && !currentUser) {
        setTeamData(null);
        setTeamFromCache(false);
      }
      return;
    }

    const teamRef = doc(db, SETTINGS_TEAM_DOC.collection, SETTINGS_TEAM_DOC.id);
    const unsubscribe = onSnapshot(
      teamRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        setTeamData(snapshot.exists() ? snapshot.data() : { members: [] });
        setTeamFromCache(snapshot.metadata.fromCache);
        if (snapshot.metadata.hasPendingWrites) {
          setPendingFirestoreWrites(true);
        }
      },
      (err) => {
        console.warn(
          "[settings/team snapshot]",
          err?.code || err?.message || err,
        );
        setTeamFromCache(true);
      },
    );
    return () => unsubscribe();
  }, [authLoading, currentUser]);

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

  useEffect(() => {
    if (!db || !online || !pendingFirestoreWrites) {
      pendingSyncNoticeRef.current = false;
      return undefined;
    }

    let cancelled = false;
    waitForPendingWrites(db)
      .then(() => {
        if (!cancelled && !pendingSyncNoticeRef.current) {
          pendingSyncNoticeRef.current = true;
          showNotice("تم رفع كل التعديلات إلى السيرفر.", "success");
        }
      })
      .catch((err) => {
        console.warn("[waitForPendingWrites]", err?.code || err?.message || err);
      });

    return () => {
      cancelled = true;
    };
  }, [online, pendingFirestoreWrites, showNotice]);

  const onSelectHymn = useCallback(
    (hymnDoc, { fromRoute = false } = {}) => {
      const exclusiveOwnerUid = String(hymnDoc.exclusiveOwnerUid || "");
      const isExclusive =
        Boolean(hymnDoc.isExclusive) || exclusiveOwnerUid.length > 0;
      const canOpenExclusive =
        !isExclusive ||
        (currentUser && exclusiveOwnerUid === String(currentUser.uid || ""));
      if (!canOpenExclusive) {
        showNotice("هذه الترانيمة حصرية وغير متاحة لهذا الحساب.", "error");
        return false;
      }
      setSelectedHymnId(hymnDoc.id);
      if (!fromRoute) {
        navigateHymn(hymnDoc.id);
      }
      loadHymn(
        {
          id: hymnDoc.id,
          title: hymnDoc.title || "",
          key: hymnDoc.key || "",
          sections: decodeSectionsFromFirestore(hymnDoc.sections || []),
          isExclusive,
          exclusiveOwnerUid,
        },
        { mode: isAdmin ? "edit" : "view" },
      );
      return true;
    },
    [currentUser, isAdmin, loadHymn, navigateHymn, showNotice],
  );

  useEffect(() => {
    if (loadingHymns || !routeHymnId) return;
    if (selectedHymnId === routeHymnId) return;
    const hymnDoc = hymns.find((item) => item.id === routeHymnId);
    if (!hymnDoc) {
      if (!hymns.length) return;
      if (lastRouteAttemptRef.current !== routeHymnId) {
        lastRouteAttemptRef.current = routeHymnId;
        showNotice("الترنيمة غير موجودة.", "error");
      }
      return;
    }
    const opened = onSelectHymn(hymnDoc, { fromRoute: true });
    lastRouteAttemptRef.current = opened ? "" : routeHymnId;
  }, [loadingHymns, routeHymnId, hymns, selectedHymnId, onSelectHymn, showNotice]);

  useEffect(() => {
    const id = state.hymn?.id;
    if (!id || loadingHymns) return;
    const hymnDoc = hymns.find((item) => item.id === id);
    if (!hymnDoc) return;
    if (selectedHymnId !== id) setSelectedHymnId(id);
    syncLastSavedIfEmpty({
      id: hymnDoc.id,
      title: hymnDoc.title || "",
      key: hymnDoc.key || "",
      sections: decodeSectionsFromFirestore(hymnDoc.sections || []),
      isExclusive: Boolean(hymnDoc.isExclusive) || Boolean(hymnDoc.exclusiveOwnerUid),
      exclusiveOwnerUid: String(hymnDoc.exclusiveOwnerUid || ""),
    });
    if (!routeHymnId) {
      navigateHymn(id, { replace: true });
    }
  }, [loadingHymns, hymns, state.hymn.id, selectedHymnId, routeHymnId, navigateHymn, syncLastSavedIfEmpty]);

  useEffect(() => {
    if (!isAdmin || !isDirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isAdmin, isDirty]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const onKeyDown = (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      const key = String(event.key || "").toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }
      if (key === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAdmin, undo, redo]);

  const onNewNote = () => {
    if (!isAdmin) return;
    setSelectedHymnId("");
    navigateHymn("");
    createNewHymn();
  };

  const onSaveHymnToFirebase = async () => {
    if (!canSaveFirebase) {
      showNotice("ليس لديك صلاحية حفظ الترانيم على السيرفر.", "error");
      return;
    }
    if (!db || !hasFirebaseConfig) return;
    const title = String(state.hymn.title || "").trim();
    if (!title) {
      showNotice("اكتب عنوان الترانيمة قبل الحفظ.", "error");
      return;
    }

    const payload = {
      title,
      key: state.hymn.key || "",
      sections: encodeSectionsForFirestore(state.hymn.sections || []),
      isExclusive: isSuperAdmin ? Boolean(state.hymn.isExclusive) : false,
      exclusiveOwnerUid:
        isSuperAdmin && state.hymn.isExclusive
          ? String(currentUser?.uid || "")
          : "",
      updatedAt: serverTimestamp(),
    };

    try {
      setSavingHymn(true);
      const offline = isBrowserOffline();

      if (selectedHymnId) {
        await setDoc(doc(db, "hymns", selectedHymnId), payload, {
          merge: true,
        });
        markHymnSaved({
          ...state.hymn,
          id: selectedHymnId,
          title,
          key: payload.key,
          isExclusive: payload.isExclusive,
          exclusiveOwnerUid: payload.exclusiveOwnerUid,
        });
        navigateHymn(selectedHymnId, { replace: true });
        showNotice(
          offline ? offlineSaveNotice("save") : "تم تحديث الترنيمة.",
          "success",
        );
        return;
      }

      const created = await addDoc(collection(db, "hymns"), {
        ...payload,
        createdAt: Timestamp.now(),
      });
      setSelectedHymnId(created.id);
      loadHymn(
        { ...state.hymn, id: created.id, title, isExclusive: payload.isExclusive, exclusiveOwnerUid: payload.exclusiveOwnerUid },
        { ignoreDraft: true, mode: "edit" },
      );
      navigateHymn(created.id, { replace: true });
      showNotice(
        offline ? offlineSaveNotice("save") : "تم حفظ ترنيمة جديدة.",
        "success",
      );
    } catch (error) {
      showNotice(`فشل الحفظ: ${error.message}`, "error");
    } finally {
      setSavingHymn(false);
    }
  };

  const onDeleteHymnFromFirebase = async () => {
    if (!canDelete) {
      showNotice("ليس لديك صلاحية حذف الترانيم.", "error");
      return;
    }
    if (!db || !hasFirebaseConfig || !selectedHymnId) return;
    const confirmed = window.confirm("هل تريد حذف هذه الترانيمة نهائيًا؟");
    if (!confirmed) return;

    try {
      setDeletingHymn(true);
      const offline = isBrowserOffline();
      await deleteDoc(doc(db, "hymns", selectedHymnId));
      onNewNote();
      showNotice(
        offline ? offlineSaveNotice("delete") : "تم حذف الترانيمة.",
        "success",
      );
    } catch (error) {
      showNotice(`فشل الحذف: ${error.message}`, "error");
    } finally {
      setDeletingHymn(false);
    }
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

  const onCopyHymnLink = async () => {
    if (!selectedHymnId) {
      showNotice("احفظ الترنيمة على السيرفر أولاً لنسخ الرابط.", "error");
      return;
    }
    const url = hymnShareUrl(selectedHymnId);
    try {
      await navigator.clipboard.writeText(url);
      showNotice("تم نسخ رابط الترنيمة.", "success");
    } catch {
      showNotice(url, "info");
    }
  };

  const onOpenSetlistHymn = (id) => {
    const hymnDoc = hymns.find((item) => item.id === id);
    if (!hymnDoc) {
      showNotice("الترنيمة غير موجودة في القائمة.", "error");
      return;
    }
    onSelectHymn(hymnDoc);
  };

  const onSaveDraftClick = () => {
    saveDraftNow();
    showNotice("تم حفظ المسودة على هذا الجهاز.", "success");
  };

  const onDiscardDraftClick = () => {
    if (!isDirty) return;
    const confirmed = window.confirm("تجاهل المسودة واسترجاع آخر نسخة من السيرفر؟");
    if (!confirmed) return;
    discardDraft();
    showNotice("تم استرجاع آخر نسخة محفوظة.", "success");
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
      const offline = isBrowserOffline();
      await setDoc(
        doc(db, SETTINGS_TEAM_DOC.collection, SETTINGS_TEAM_DOC.id),
        {
          members,
          ignoreEnvAdminList,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      showNotice(
        offline ? offlineSaveNotice("save") : "تم حفظ صلاحيات الفريق.",
        "success",
      );
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
              وضع التعديل
            </button>
          ) : null}
          <button
            className={`btn ${state.mode === "view" ? "primary" : ""}`}
            onClick={() => setMode("view")}
          >
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
            {loadingExport ? "جاري التصدير..." : "تصدير PNG (HD)"}
          </button>
          <button
            className="btn"
            onClick={onCopyHymnLink}
            disabled={!selectedHymnId}
          >
            نسخ الرابط
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
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowAdminDashboard(true)}
            >
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
          <p className={`syncBadge syncBadge--${syncStatus}`} role="status">
            {syncLabel}
          </p>
          <p className={`roleBadge ${isAdmin ? "admin" : "viewer"}`}>
            {isAdmin
              ? `أدمن: ${currentUser?.email || currentUser?.uid || "مُسجل"}`
              : currentUser
                ? "مستخدم مسجل (قراءة فقط)"
                : "وضع القراءة فقط"}
          </p>
          <div className="row between sidebarHeader">
            <h3>الترانيم المحفوظة</h3>
            {isAdmin ? (
              <button
                className="btn primary"
                onClick={onNewNote}
                aria-label="إضافة ترنيمة جديدة"
              >
               اضافة
              </button>
            ) : null}
          </div>

          {hasFirebaseConfig ? (
            <div className="hymnSearchWrap">
              <input
                id="hymn-search"
                type="search"
                className="input hymnSearchInput"
                placeholder="بحث بالعنوان أو الكلمات…"
                value={hymnSearchQuery}
                onChange={(e) => setHymnSearchQuery(e.target.value)}
                disabled={loadingHymns}
                autoComplete="off"
                spellCheck={false}
                aria-label="بحث بالعنوان أو الكلمات"
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
                    onChange={(e) =>
                      updateHymn({ isExclusive: e.target.checked })
                    }
                  />
                  <span>حصرية لي فقط</span>
                </label>
              ) : null}
              {showFirebaseSaveBtn ? (
                <button
                  className="btn primary"
                  onClick={onSaveHymnToFirebase}
                  disabled={savingHymn}
                >
                  {savingHymn
                    ? "جاري الحفظ..."
                    : selectedHymnId
                      ? "تحديث"
                      : "حفظ"}
                </button>
              ) : null}
              {showFirebaseDeleteBtn ? (
                <button
                  className="btn danger"
                  onClick={onDeleteHymnFromFirebase}
                  disabled={!selectedHymnId || deletingHymn}
                >
                  {deletingHymn ? "جاري الحذف..." : "حذف الترانيمة"}
                </button>
              ) : null}
            </div>
          ) : null}
          {isAdmin ? (
            <div className="draftActions">
              {isDirty ? (
                <p className="draftBadge" role="status">
                  مسودة محلية — غير محفوظة على السيرفر
                </p>
              ) : null}
              <div className="row wrap sidebarActions">
                <button type="button" className="btn" onClick={onSaveDraftClick}>
                  حفظ مسودة
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={onDiscardDraftClick}
                  disabled={!isDirty || !state.lastSavedHymn}
                >
                  تجاهل المسودة
                </button>
              </div>
            </div>
          ) : null}
          <div className="row sidebarTransposeActions">
            <button
              className="btn"
              onClick={() => transposeHymn(-1)}
              title="Transpose -1 semitone"
              aria-label="Transpose down"
            >
              -
            </button>
            <button
              className="btn"
              onClick={() => transposeHymn(1)}
              title="Transpose +1 semitone"
              aria-label="Transpose up"
            >
              +
            </button>
          </div>

          {!hasFirebaseConfig ? (
            <p className="sidebarHint">
              Firebase غير مهيأ. أضف متغيرات VITE_FIREBASE_* لعرض القائمة.
            </p>
          ) : null}

          {hasFirebaseConfig && loadingHymns ? (
            <p className="sidebarHint">جاري تحميل الترانيم...</p>
          ) : null}

          {hasFirebaseConfig && !loadingHymns && hymns.length === 0 ? (
            <p className="sidebarHint">لا توجد ترانيم محفوظة حاليًا.</p>
          ) : null}

          {hasFirebaseConfig &&
          !loadingHymns &&
          hymns.length > 0 &&
          filteredHymns.length === 0 ? (
            <p className="sidebarHint">
              لا توجد ترانيم تطابق «{hymnSearchQuery.trim() || "…"}». جرّب حروف
              أقل أو امسح البحث.
            </p>
          ) : null}

          {hasFirebaseConfig && !loadingHymns && filteredHymns.length > 0 ? (
            <ul className="hymnList">
              {filteredHymns.map((hymnItem) => (
                <li key={hymnItem.id}>
                  <button
                    className={`hymnListItem ${selectedHymnId === hymnItem.id ? "active" : ""}`}
                    onClick={() => onSelectHymn(hymnItem)}
                  >
                    <span>{hymnItem.title || "ترنيمة بدون عنوان"}</span>
                    {hymnItem.isExclusive ? (
                      <small> (حصرية)</small>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <SetlistPanel
            currentId={selectedHymnId}
            currentTitle={state.hymn.title}
            canAdd={Boolean(selectedHymnId)}
            onOpen={onOpenSetlistHymn}
          />
        </aside>

        <div className="editorPane">
          {state.mode === "edit" && isAdmin ? (
            <HymnEditor />
          ) : (
            <HymnView ref={viewRef} />
          )}
        </div>
      </main>

      {state.mode === "edit" && isAdmin ? (
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
