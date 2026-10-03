import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminDashboard from "./components/AdminDashboard";
import HymnEditor from "./components/HymnEditor";
import HymnView from "./components/HymnView";
import OutputMode from "./components/OutputMode";
import ServiceMode from "./components/ServiceMode";
import { HymnProvider, useHymnStore } from "./store/hymnStore.jsx";
import { exportNodeToPng } from "./utils/exportImage";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocFromCache,
  getDocFromServer,
  getDocsFromServer,
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
import { clearDraft, getDraft } from "./utils/hymnDrafts";
import {
  useOfflineSync,
  isBrowserOffline,
  offlineSaveNotice,
} from "./hooks/useOfflineSync";
import { hymnShareUrl, useHymnRoute } from "./hooks/useHymnRoute";
import {
  buildHymnSearchIndex,
  filterHymnSearchIndex,
  getHymnKeyOptions,
} from "./utils/hymnSearch";
import SetlistPanel from "./components/SetlistPanel";
import {
  decodeStoredHymn,
  encodeHymnForFirestore,
} from "./utils/hymnFirestore";
import {
  decodeStoredSetlist,
  encodeSetlistForFirestore,
  normalizeSharedSetlist,
  reorderSetlistHymns,
} from "./utils/setlistFirestore";
import {
  findNextServiceIndex,
  loadServiceModeFromStorage,
  normalizeServiceSetlist,
  resolveServiceIndex,
  saveServiceModeToStorage,
} from "./utils/serviceMode";
import {
  resolveSaveState,
  shouldBlockBeforeUnload,
  shouldPromptBeforeDiscard,
} from "./utils/saveState";
import {
  HYMN_LIBRARY_EVENT,
  isFavorite,
  readFavoriteIds,
  readRecentHymnIds,
  resolveHymnsByIds,
  toggleFavorite,
} from "./utils/hymnLibrary";

async function fetchHymnDocFromServer(hymnId) {
  if (!db || !hasFirebaseConfig || !hymnId) {
    return null;
  }

  try {
    const snapshot = await getDocFromServer(doc(db, "hymns", hymnId));
    if (!snapshot.exists()) {
      return null;
    }
    return { id: snapshot.id, ...snapshot.data() };
  } catch (error) {
    console.warn("[fetchHymnDocFromServer] server failed:", error);
    try {
      const snapshot = await getDocFromCache(doc(db, "hymns", hymnId));
      if (!snapshot.exists()) {
        return null;
      }
      return { id: snapshot.id, ...snapshot.data() };
    } catch (cacheError) {
      console.warn(
        "[fetchHymnDocFromServer] cache fallback failed:",
        cacheError,
      );
      return null;
    }
  }
}

async function refreshHymnsListFromServer() {
  if (!db || !hasFirebaseConfig) {
    return [];
  }

  const hymnsQuery = query(
    collection(db, "hymns"),
    orderBy("createdAt", "desc"),
  );

  const snapshot = await getDocsFromServer(hymnsQuery);
  const nextHymns = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  return nextHymns;
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
  const [isExporting, setIsExporting] = useState(false);
  const [outputModeOpen, setOutputModeOpen] = useState(false);
  const [hymns, setHymns] = useState([]);
  const [loadingHymns, setLoadingHymns] = useState(true);
  const [selectedHymnId, setSelectedHymnId] = useState("");
  const [favoriteIds, setFavoriteIds] = useState(readFavoriteIds);
  const [recentHymnIds, setRecentHymnIds] = useState(readRecentHymnIds);
  const [savingHymn, setSavingHymn] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deletingHymn, setDeletingHymn] = useState(false);
  const [notice, setNotice] = useState(null);
  const [pendingUnsafeTransition, setPendingUnsafeTransition] = useState(null);
  const [hymnSearchQuery, setHymnSearchQuery] = useState("");
  const [hymnKeyFilter, setHymnKeyFilter] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
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
  const [sharedSetlists, setSharedSetlists] = useState([]);
  const [sharedSetlistsLoading, setSharedSetlistsLoading] = useState(false);
  const [selectedSharedSetlistId, setSelectedSharedSetlistId] = useState("");
  const [serviceMode, setServiceMode] = useState(() =>
    loadServiceModeFromStorage(),
  );

  const {
    status: syncStatus,
    label: syncLabel,
    online,
  } = useOfflineSync({
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

  const hymnSearchIndex = useMemo(
    () => buildHymnSearchIndex(visibleHymns),
    [visibleHymns],
  );
  const hymnKeyOptions = useMemo(
    () => getHymnKeyOptions(hymnSearchIndex),
    [hymnSearchIndex],
  );
  const filteredHymns = useMemo(
    () =>
      filterHymnSearchIndex(hymnSearchIndex, {
        query: hymnSearchQuery,
        key: hymnKeyFilter,
        favoritesOnly,
        favoriteIds,
        recentOnly,
        recentIds: recentHymnIds,
      }),
    [
      favoriteIds,
      favoritesOnly,
      hymnKeyFilter,
      hymnSearchIndex,
      hymnSearchQuery,
      recentHymnIds,
      recentOnly,
    ],
  );
  const visibleHymnsById = useMemo(
    () => new Map(visibleHymns.map((item) => [item.id, item])),
    [visibleHymns],
  );
  const favoriteHymns = useMemo(
    () => resolveHymnsByIds(favoriteIds, visibleHymns),
    [favoriteIds, visibleHymns],
  );
  const recentHymns = useMemo(
    () => resolveHymnsByIds(recentHymnIds, visibleHymns),
    [recentHymnIds, visibleHymns],
  );
  const selectedHymnIsAccessible = visibleHymnsById.has(selectedHymnId);
  const selectedHymnIsFavorite = isFavorite(selectedHymnId, favoriteIds);

  useEffect(() => {
    const onLibraryChange = (event) => {
      if (event.detail?.kind === "favorites") {
        setFavoriteIds(event.detail.hymnIds || readFavoriteIds());
      }
      if (event.detail?.kind === "recent") {
        setRecentHymnIds(event.detail.hymnIds || readRecentHymnIds());
      }
    };
    const onStorage = (event) => {
      if (!event.key || event.key.includes("favorites")) {
        setFavoriteIds(readFavoriteIds());
      }
      if (!event.key || event.key.includes("recent")) {
        setRecentHymnIds(readRecentHymnIds());
      }
    };

    window.addEventListener(HYMN_LIBRARY_EVENT, onLibraryChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HYMN_LIBRARY_EVENT, onLibraryChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const teamMembersForDashboard = useMemo(
    () => teamData?.members || [],
    [teamData],
  );
  const canManageSharedSetlists = Boolean(
    currentUser &&
    hasFirebaseConfig &&
    (canSaveFirebase || isAdmin || canDelete),
  );
  const selectedSharedSetlist = useMemo(
    () =>
      sharedSetlists.find((item) => item.id === selectedSharedSetlistId) ||
      null,
    [selectedSharedSetlistId, sharedSetlists],
  );
  const selectedSharedSetlistItems = useMemo(() => {
    if (!selectedSharedSetlist) return [];
    return selectedSharedSetlist.hymnIds
      .map((hymnId) => {
        const hymnDoc = hymns.find((item) => item.id === hymnId);
        return {
          id: hymnId,
          title: hymnDoc?.title || "ترنيمة غير متاحة",
          missing: !hymnDoc,
        };
      })
      .filter((item) => item.id);
  }, [hymns, selectedSharedSetlist]);

  const canAccessHymnById = useCallback(
    (hymnId) => {
      if (!hymnId) return false;
      const hymnDoc = hymns.find((item) => item.id === hymnId);
      if (!hymnDoc) return false;

      const exclusiveOwnerUid = String(hymnDoc.exclusiveOwnerUid || "");
      const isExclusive =
        Boolean(hymnDoc.isExclusive) || exclusiveOwnerUid.length > 0;
      if (!isExclusive) return true;
      if (!currentUser) return false;
      return exclusiveOwnerUid === String(currentUser.uid || "");
    },
    [currentUser, hymns],
  );

  const showNotice = useCallback((message, type = "info") => {
    setNotice({ message, type });
    window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(() => setNotice(null), 2800);
  }, []);

  const closeOutputMode = useCallback(() => {
    setOutputModeOpen(false);
  }, []);

  const hasLocalDraft = useMemo(() => {
    const hymnId = state.hymn?.id;
    if (!hymnId) return false;
    return Boolean(getDraft(hymnId));
  }, [state.hymn?.id]);

  const saveState = useMemo(
    () =>
      resolveSaveState({
        isDirty,
        isSaving: savingHymn,
        isOffline: !online,
        isLoading: loadingHymns || authLoading,
        hasLocalDraft,
        saveFailed: Boolean(saveError),
        pendingSync: Boolean(pendingFirestoreWrites),
        hasServerState: Boolean(selectedHymnId || state.lastSavedHymn),
      }),
    [
      authLoading,
      hasLocalDraft,
      isDirty,
      loadingHymns,
      online,
      pendingFirestoreWrites,
      saveError,
      savingHymn,
      selectedHymnId,
      state.lastSavedHymn,
    ],
  );

  const runGuardedTransition = useCallback(
    ({ title, message, onSave, onDiscard, onCancel }) => {
      if (
        !shouldPromptBeforeDiscard({ isDirty, saveFailed: Boolean(saveError) })
      ) {
        onSave?.();
        return;
      }

      setPendingUnsafeTransition({
        title,
        message,
        onSave: async () => {
          setPendingUnsafeTransition(null);
          await onSave?.();
        },
        onDiscard: () => {
          setPendingUnsafeTransition(null);
          onDiscard?.();
        },
        onCancel: () => {
          setPendingUnsafeTransition(null);
          onCancel?.();
        },
      });
    },
    [isDirty, saveError],
  );

  useEffect(() => {
    if (
      currentUser &&
      (perms.isAdmin || perms.canSaveFirebase || perms.canDelete)
    ) {
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
      { includeMetadataChanges: true, source: "server" },
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
  }, [authLoading, currentUser]);

  useEffect(() => {
    if (!db || !hasFirebaseConfig || authLoading || !currentUser) {
      setSharedSetlists([]);
      setSelectedSharedSetlistId("");
      setSharedSetlistsLoading(false);
      return undefined;
    }

    setSharedSetlistsLoading(true);
    const setlistsQuery = query(
      collection(db, "setlists"),
      orderBy("updatedAt", "desc"),
    );
    const unsubscribe = onSnapshot(
      setlistsQuery,
      (snapshot) => {
        const nextSetlists = snapshot.docs.map((docSnap) => {
          const raw = { id: docSnap.id, ...docSnap.data() };
          return decodeStoredSetlist(raw);
        });
        setSharedSetlists(nextSetlists);
        setSharedSetlistsLoading(false);
      },
      (err) => {
        console.warn("[setlists snapshot]", err?.code || err?.message || err);
        setSharedSetlists([]);
        setSharedSetlistsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [authLoading, currentUser]);

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
      { includeMetadataChanges: true, source: "server" },
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
    if (serviceMode) {
      setMode("view");
      saveServiceModeToStorage(serviceMode);
      return;
    }

    saveServiceModeToStorage(null);
  }, [serviceMode, setMode]);

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
        console.warn(
          "[waitForPendingWrites]",
          err?.code || err?.message || err,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [online, pendingFirestoreWrites, showNotice]);

  const onSaveHymnToFirebase = useCallback(
    async ({ afterSave } = {}) => {
      if (!canSaveFirebase) {
        showNotice("ليس لديك صلاحية حفظ الترانيم على السيرفر.", "error");
        return false;
      }
      if (!db || !hasFirebaseConfig) return false;
      const title = String(state.hymn.title || "").trim();
      if (!title) {
        showNotice("اكتب عنوان الترانيمة قبل الحفظ.", "error");
        return false;
      }

      const canonicalPayload = encodeHymnForFirestore(state.hymn);
      const payload = {
        title: canonicalPayload.title || title,
        key: canonicalPayload.key || state.hymn.key || "",
        sections: canonicalPayload.sections || [],
        schemaVersion: canonicalPayload.schemaVersion || 2,
        isExclusive: isSuperAdmin ? Boolean(state.hymn.isExclusive) : false,
        exclusiveOwnerUid:
          isSuperAdmin && state.hymn.isExclusive
            ? String(currentUser?.uid || "")
            : "",
        updatedAt: serverTimestamp(),
      };

      try {
        setSavingHymn(true);
        setSaveError(null);
        const offline = isBrowserOffline();

        if (selectedHymnId) {
          await setDoc(doc(db, "hymns", selectedHymnId), payload, {
            merge: true,
          });
          setHymns((prev) =>
            prev.map((item) =>
              item.id === selectedHymnId
                ? {
                    ...item,
                    title,
                    key: payload.key,
                    sections: payload.sections,
                    isExclusive: payload.isExclusive,
                    exclusiveOwnerUid: payload.exclusiveOwnerUid,
                    updatedAt: Date.now(),
                  }
                : item,
            ),
          );
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
          if (afterSave) await afterSave();
          return true;
        }

        const created = await addDoc(collection(db, "hymns"), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        setSelectedHymnId(created.id);
        setHymns((prev) => [
          {
            id: created.id,
            title,
            key: payload.key,
            sections: payload.sections,
            isExclusive: payload.isExclusive,
            exclusiveOwnerUid: payload.exclusiveOwnerUid,
            updatedAt: Date.now(),
          },
          ...prev.filter((item) => item.id !== created.id),
        ]);
        loadHymn(
          {
            ...state.hymn,
            id: created.id,
            title,
            isExclusive: payload.isExclusive,
            exclusiveOwnerUid: payload.exclusiveOwnerUid,
          },
          { ignoreDraft: true, mode: "edit" },
        );
        navigateHymn(created.id, { replace: true });
        showNotice(
          offline ? offlineSaveNotice("save") : "تم حفظ ترنيمة جديدة.",
          "success",
        );
        if (afterSave) await afterSave();
        return true;
      } catch (error) {
        setSaveError(error?.message || "save failed");
        showNotice(`تعذر الحفظ على السيرفر: ${error.message}`, "error");
        return false;
      } finally {
        setSavingHymn(false);
      }
    },
    [
      canSaveFirebase,
      currentUser?.uid,
      isSuperAdmin,
      loadHymn,
      markHymnSaved,
      navigateHymn,
      selectedHymnId,
      setHymns,
      showNotice,
      state.hymn,
    ],
  );

  const finalizeSelectHymn = useCallback(
    async (hymnDoc, { fromRoute = false } = {}) => {
      const remoteDoc =
        hymnDoc?.id && db && hasFirebaseConfig
          ? await fetchHymnDocFromServer(hymnDoc.id)
          : null;
      const sourceDoc = remoteDoc || hymnDoc;
      if (!sourceDoc) return false;

      const exclusiveOwnerUid = String(sourceDoc.exclusiveOwnerUid || "");
      const isExclusive =
        Boolean(sourceDoc.isExclusive) || exclusiveOwnerUid.length > 0;
      const canOpenExclusive =
        !isExclusive ||
        (currentUser && exclusiveOwnerUid === String(currentUser.uid || ""));
      if (!canOpenExclusive) {
        showNotice("هذه الترانيمة حصرية وغير متاحة لهذا الحساب.", "error");
        return false;
      }
      setSelectedHymnId(sourceDoc.id);
      if (!fromRoute) {
        navigateHymn(sourceDoc.id);
      }
      const canonicalDoc = decodeStoredHymn(sourceDoc);
      loadHymn(
        {
          id: canonicalDoc.id || sourceDoc.id,
          title: canonicalDoc.title || "",
          key: canonicalDoc.key || "",
          sections: canonicalDoc.sections || [],
          isExclusive,
          exclusiveOwnerUid,
        },
        {
          ignoreDraft: true,
          useDraft: false,
          mode: isAdmin ? "edit" : "view",
        },
      );
      return true;
    },
    [currentUser, isAdmin, loadHymn, navigateHymn, showNotice],
  );

  const onSelectHymn = useCallback(
    async (hymnDoc, { fromRoute = false } = {}) => {
      if (isDirty && !fromRoute && hymnDoc?.id !== selectedHymnId) {
        runGuardedTransition({
          title: "تغييرات غير محفوظة",
          message: "لديك تغييرات غير محفوظة. هل تريد حفظها قبل تبديل الترنيمة؟",
          onSave: async () => {
            await onSaveHymnToFirebase({
              afterSave: async () => {
                await finalizeSelectHymn(hymnDoc, { fromRoute });
              },
            });
          },
          onDiscard: async () => {
            discardDraft();
            await finalizeSelectHymn(hymnDoc, { fromRoute });
          },
          onCancel: () => undefined,
        });
        return false;
      }
      return finalizeSelectHymn(hymnDoc, { fromRoute });
    },
    [
      discardDraft,
      finalizeSelectHymn,
      isDirty,
      onSaveHymnToFirebase,
      runGuardedTransition,
      selectedHymnId,
    ],
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
  }, [
    loadingHymns,
    routeHymnId,
    hymns,
    selectedHymnId,
    onSelectHymn,
    showNotice,
  ]);

  useEffect(() => {
    const id = state.hymn?.id;
    if (!id || loadingHymns) return;
    const hymnDoc = hymns.find((item) => item.id === id);
    if (!hymnDoc) return;
    if (selectedHymnId !== id) setSelectedHymnId(id);
    const canonicalDoc = decodeStoredHymn(hymnDoc);
    syncLastSavedIfEmpty({
      id: canonicalDoc.id || hymnDoc.id,
      title: canonicalDoc.title || "",
      key: canonicalDoc.key || "",
      sections: canonicalDoc.sections || [],
      isExclusive:
        Boolean(hymnDoc.isExclusive) || Boolean(hymnDoc.exclusiveOwnerUid),
      exclusiveOwnerUid: String(hymnDoc.exclusiveOwnerUid || ""),
    });
    if (!routeHymnId) {
      navigateHymn(id, { replace: true });
    }
  }, [
    loadingHymns,
    hymns,
    state.hymn.id,
    selectedHymnId,
    routeHymnId,
    navigateHymn,
    syncLastSavedIfEmpty,
  ]);

  useEffect(() => {
    if (!isAdmin || !shouldBlockBeforeUnload(saveState)) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isAdmin, saveState]);

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
    if (isDirty) {
      runGuardedTransition({
        title: "تغييرات غير محفوظة",
        message:
          "لديك تغييرات غير محفوظة. هل تريد حفظها قبل إنشاء ترنيمة جديدة؟",
        onSave: async () => {
          await onSaveHymnToFirebase({
            afterSave: () => {
              setSelectedHymnId("");
              navigateHymn("");
              createNewHymn();
            },
          });
        },
        onDiscard: () => {
          discardDraft();
          setSelectedHymnId("");
          navigateHymn("");
          createNewHymn();
        },
        onCancel: () => undefined,
      });
      return;
    }
    setSelectedHymnId("");
    navigateHymn("");
    createNewHymn();
  };

  const onDeleteHymnFromFirebase = async () => {
    if (!canDelete) {
      showNotice("ليس لديك صلاحية حذف الترانيم.", "error");
      return;
    }
    if (!db || !hasFirebaseConfig || !selectedHymnId) return;

    const doDelete = async () => {
      const confirmed = window.confirm("هل تريد حذف هذه الترانيمة نهائيًا؟");
      if (!confirmed) return;

      try {
        setDeletingHymn(true);
        const offline = isBrowserOffline();
        await deleteDoc(doc(db, "hymns", selectedHymnId));
        setHymns((prev) => prev.filter((item) => item.id !== selectedHymnId));
        setSelectedHymnId("");
        clearDraft(selectedHymnId);
        navigateHymn("");
        createNewHymn();
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

    if (isDirty) {
      runGuardedTransition({
        title: "حذف ترنيمة",
        message: "لديك تغييرات غير محفوظة. هل تريد حفظها قبل حذف الترانيمة؟",
        onSave: async () => {
          await onSaveHymnToFirebase({ afterSave: doDelete });
        },
        onDiscard: () => {
          discardDraft();
          doDelete();
        },
        onCancel: () => undefined,
      });
      return;
    }

    await doDelete();
  };

  const onRefreshFromServer = useCallback(
    async ({ force = false } = {}) => {
      if (!db || !hasFirebaseConfig) {
        return;
      }

      try {
        setLoadingHymns(true);
        const nextHymns = await refreshHymnsListFromServer();
        setHymns(nextHymns);
        setHymnsFromCache(false);
        setPendingFirestoreWrites(false);

        if (selectedHymnId) {
          const remoteDoc = await fetchHymnDocFromServer(selectedHymnId);
          if (remoteDoc) {
            const sourceDoc = remoteDoc;
            const canonicalRemote = decodeStoredHymn(sourceDoc);
            loadHymn(
              {
                id: canonicalRemote.id || sourceDoc.id,
                title: canonicalRemote.title || "",
                key: canonicalRemote.key || "",
                sections: canonicalRemote.sections || [],
                isExclusive:
                  Boolean(sourceDoc.isExclusive) ||
                  Boolean(sourceDoc.exclusiveOwnerUid),
                exclusiveOwnerUid: String(sourceDoc.exclusiveOwnerUid || ""),
              },
              {
                ignoreDraft: true,
                useDraft: false,
                mode: isAdmin ? "edit" : "view",
              },
            );
          }
        }

        if (force && isDirty) {
          clearDraft(state.hymn.id);
        }

        showNotice("تم تحديث البيانات من السيرفر بنجاح.", "success");
      } catch (error) {
        console.warn("[refreshFromServer]", error);
        showNotice(`فشل التحديث من السيرفر: ${error.message}`, "error");
      } finally {
        setLoadingHymns(false);
      }
    },
    [isAdmin, isDirty, loadHymn, selectedHymnId, showNotice, state.hymn?.id],
  );

  const onTriggerRefresh = useCallback(() => {
    if (isDirty) {
      runGuardedTransition({
        title: "تحديث من السيرفر",
        message:
          "لديك تغييرات غير محفوظة. تحديث النسخة من السيرفر سيؤدي إلى تجاهل هذه التغييرات.",
        onSave: async () => {
          await onSaveHymnToFirebase({
            afterSave: () => onRefreshFromServer({ force: true }),
          });
        },
        onDiscard: () => {
          discardDraft();
          onRefreshFromServer({ force: true });
        },
        onCancel: () => undefined,
      });
      return;
    }

    onRefreshFromServer({ force: true });
  }, [
    discardDraft,
    isDirty,
    onRefreshFromServer,
    onSaveHymnToFirebase,
    runGuardedTransition,
  ]);

  const onExport = async () => {
    if (!viewRef.current) return;
    try {
      setLoadingExport(true);
      setIsExporting(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await exportNodeToPng(
        viewRef.current,
        `${state.hymn.title || "harmony-notes"}.png`,
        isDark,
        {
          desktopWidth: 800,
        },
      );
    } catch (error) {
      showNotice(`فشل التصدير: ${error.message}`, "error");
    } finally {
      setLoadingExport(false);
      setIsExporting(false);
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

  const onStartServiceMode = useCallback(
    ({
      setlistId = "",
      title = "قائمة الخدمة",
      hymnIds = [],
      source = "local",
    }) => {
      const nextSetlist = normalizeServiceSetlist({
        setlistId,
        title,
        source,
        hymnIds,
        currentIndex: 0,
      });

      if (!nextSetlist.hymnIds.length) {
        showNotice(
          "لا توجد ترانيم في هذه القائمة للعرض في وضع الخدمة.",
          "error",
        );
        return;
      }

      const activeIndex = findNextServiceIndex(
        nextSetlist.hymnIds,
        0,
        1,
        (hymnId) => canAccessHymnById(hymnId),
      );
      setServiceMode({ ...nextSetlist, currentIndex: activeIndex });
    },
    [canAccessHymnById, showNotice],
  );

  const onExitServiceMode = useCallback(() => {
    setServiceMode(null);
  }, []);

  const onMoveServiceMode = useCallback(
    (direction) => {
      if (!serviceMode) return;
      const nextIndex = findNextServiceIndex(
        serviceMode.hymnIds,
        serviceMode.currentIndex,
        direction,
        (hymnId) => canAccessHymnById(hymnId),
      );
      setServiceMode((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentIndex: nextIndex,
        };
      });
    },
    [canAccessHymnById, serviceMode],
  );

  const onSelectServiceIndex = useCallback(
    (index) => {
      if (!serviceMode) return;
      const safeIndex = resolveServiceIndex(serviceMode.hymnIds, index);
      setServiceMode((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentIndex: safeIndex,
        };
      });
    },
    [serviceMode],
  );

  useEffect(() => {
    if (!serviceMode) return;

    const activeIndex = resolveServiceIndex(
      serviceMode.hymnIds,
      serviceMode.currentIndex,
    );
    const currentHymnId = serviceMode.hymnIds[activeIndex];
    if (!currentHymnId || !canAccessHymnById(currentHymnId)) {
      return;
    }

    const hymnDoc = hymns.find((item) => item.id === currentHymnId);
    if (!hymnDoc) return;

    const canonicalDoc = decodeStoredHymn(hymnDoc);
    loadHymn(
      {
        id: canonicalDoc.id || hymnDoc.id,
        title: canonicalDoc.title || "",
        key: canonicalDoc.key || "",
        sections: canonicalDoc.sections || [],
        isExclusive:
          Boolean(hymnDoc.isExclusive) || Boolean(hymnDoc.exclusiveOwnerUid),
        exclusiveOwnerUid: String(hymnDoc.exclusiveOwnerUid || ""),
      },
      {
        ignoreDraft: true,
        useDraft: false,
        mode: "view",
      },
    );
  }, [canAccessHymnById, hymns, loadHymn, serviceMode]);

  const onSaveDraftClick = () => {
    saveDraftNow();
    showNotice("تم حفظ المسودة على هذا الجهاز.", "success");
  };

  const onDiscardDraftClick = () => {
    if (!isDirty) return;
    const confirmed = window.confirm("تجاهل المسودة واسترجاع آخر نسخة محفوظة؟");
    if (!confirmed) return;
    discardDraft();
    showNotice("تم استرجاع آخر نسخة محفوظة.", "success");
  };

  const onRetrySave = useCallback(() => {
    if (!saveError) return;
    setSaveError(null);
    onSaveHymnToFirebase();
  }, [onSaveHymnToFirebase, saveError]);

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

    const doImport = async () => {
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

    if (isDirty) {
      runGuardedTransition({
        title: "استيراد ملف مشروع",
        message:
          "لديك تغييرات غير محفوظة. هل تريد حفظها قبل استبدال المشروع الحالي؟",
        onSave: async () => {
          await onSaveHymnToFirebase({
            afterSave: doImport,
          });
        },
        onDiscard: async () => {
          discardDraft();
          await doImport();
        },
        onCancel: () => {
          event.target.value = "";
        },
      });
      return;
    }

    await doImport();
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

  const persistSharedSetlist = useCallback(
    async (setlist) => {
      if (
        !db ||
        !hasFirebaseConfig ||
        !currentUser ||
        !canManageSharedSetlists
      ) {
        return null;
      }

      const normalized = normalizeSharedSetlist({
        ...setlist,
        ownerUid: setlist?.ownerUid || currentUser.uid,
        createdBy: setlist?.createdBy || currentUser.uid,
        updatedBy: currentUser.uid,
        updatedAt: new Date().toISOString(),
        createdAt: setlist?.createdAt || new Date().toISOString(),
      });

      const serialized = encodeSetlistForFirestore(normalized);
      const payload = {
        schemaVersion: serialized.schemaVersion,
        name: serialized.name,
        hymnIds: serialized.hymnIds,
        ownerUid: serialized.ownerUid,
        createdBy: serialized.createdBy,
        updatedBy: serialized.updatedBy,
        createdAt: setlist?.createdAt
          ? serialized.createdAt
          : serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (!normalized.id) {
        const created = await addDoc(collection(db, "setlists"), payload);
        return {
          ...normalized,
          id: created.id,
        };
      }

      await setDoc(doc(db, "setlists", normalized.id), payload, {
        merge: true,
      });
      return normalized;
    },
    [canManageSharedSetlists, currentUser],
  );

  const onSaveSharedSetlist = useCallback(
    async (setlist) => {
      if (!setlist) return null;
      const next = await persistSharedSetlist(setlist);
      if (!next) return null;

      setSharedSetlists((prev) => {
        const existed = prev.some((item) => item.id === next.id);
        if (!existed) {
          return [next, ...prev];
        }
        return prev.map((item) => (item.id === next.id ? next : item));
      });
      if (next.id) {
        setSelectedSharedSetlistId(next.id);
      }
      return next;
    },
    [persistSharedSetlist],
  );

  const onCreateSharedSetlist = useCallback(async () => {
    if (!canManageSharedSetlists) {
      showNotice("ليس لديك صلاحية إنشاء قوائم الخدمة المشتركة.", "error");
      return;
    }

    const nextName = `قائمة خدمة ${sharedSetlists.length + 1}`;
    const created = await onSaveSharedSetlist(
      normalizeSharedSetlist({
        id: "",
        name: nextName,
        hymnIds: [],
        ownerUid: currentUser?.uid || "",
        createdBy: currentUser?.uid || "",
        updatedBy: currentUser?.uid || "",
      }),
    );

    if (created?.id) {
      showNotice("تم إنشاء قائمة الخدمة المشتركة.", "success");
    }
  }, [
    canManageSharedSetlists,
    currentUser?.uid,
    onSaveSharedSetlist,
    sharedSetlists.length,
    showNotice,
  ]);

  const onDeleteSharedSetlist = useCallback(
    async (setlistId) => {
      if (!db || !hasFirebaseConfig || !setlistId) return;
      if (!canManageSharedSetlists) {
        showNotice("ليس لديك صلاحية حذف قوائم الخدمة المشتركة.", "error");
        return;
      }

      const confirmed = window.confirm("هل تريد حذف هذه القائمة المشتركة؟");
      if (!confirmed) return;

      try {
        await deleteDoc(doc(db, "setlists", setlistId));
        setSharedSetlists((prev) =>
          prev.filter((item) => item.id !== setlistId),
        );
        if (selectedSharedSetlistId === setlistId) {
          setSelectedSharedSetlistId("");
        }
        showNotice("تم حذف قائمة الخدمة المشتركة.", "success");
      } catch (error) {
        showNotice(`فشل حذف قائمة الخدمة: ${error.message}`, "error");
      }
    },
    [canManageSharedSetlists, selectedSharedSetlistId, showNotice],
  );

  const onAddCurrentToSharedSetlist = useCallback(
    async (setlistId, hymnId) => {
      if (!setlistId || !hymnId || !currentUser) return;
      const target = sharedSetlists.find((item) => item.id === setlistId);
      if (!target) return;
      const nextHymnIds = target.hymnIds.includes(hymnId)
        ? target.hymnIds
        : [...target.hymnIds, hymnId];
      const nextSetlist = normalizeSharedSetlist({
        ...target,
        hymnIds: nextHymnIds,
      });
      const saved = await onSaveSharedSetlist(nextSetlist);
      if (saved) {
        showNotice("تمت إضافة الترنيمة إلى قائمة الخدمة المشتركة.", "success");
      }
    },
    [currentUser, onSaveSharedSetlist, sharedSetlists, showNotice],
  );

  const onRemoveSharedSetlistItem = useCallback(
    async (setlistId, hymnId) => {
      if (!setlistId || !hymnId) return;
      const target = sharedSetlists.find((item) => item.id === setlistId);
      if (!target) return;
      const nextSetlist = normalizeSharedSetlist({
        ...target,
        hymnIds: target.hymnIds.filter((item) => item !== hymnId),
      });
      const saved = await onSaveSharedSetlist(nextSetlist);
      if (saved) {
        showNotice("تم حذف الترنيمة من القائمة المشتركة.", "success");
      }
    },
    [onSaveSharedSetlist, sharedSetlists, showNotice],
  );

  const onMoveSharedSetlistItem = useCallback(
    async (setlistId, fromIndex, direction) => {
      if (!setlistId) return;
      const target = sharedSetlists.find((item) => item.id === setlistId);
      if (!target) return;
      const nextHymnIds = reorderSetlistHymns(
        target.hymnIds,
        fromIndex,
        fromIndex + direction,
      );
      const nextSetlist = normalizeSharedSetlist({
        ...target,
        hymnIds: nextHymnIds,
      });
      const saved = await onSaveSharedSetlist(nextSetlist);
      if (saved) {
        showNotice("تم تحديث ترتيب قائمة الخدمة المشتركة.", "success");
      }
    },
    [onSaveSharedSetlist, sharedSetlists, showNotice],
  );

  const onRenameSharedSetlist = useCallback(
    async (setlistId) => {
      if (!setlistId) return;
      const target = sharedSetlists.find((item) => item.id === setlistId);
      if (!target) return;
      const nextName = window.prompt(
        "اسم قائمة الخدمة",
        target.name || "قائمة الخدمة",
      );
      if (nextName === null) return;
      const trimmed = String(nextName).trim();
      if (!trimmed) return;
      const nextSetlist = normalizeSharedSetlist({
        ...target,
        name: trimmed,
      });
      const saved = await onSaveSharedSetlist(nextSetlist);
      if (saved) {
        showNotice("تم تحديث اسم قائمة الخدمة المشتركة.", "success");
      }
    },
    [onSaveSharedSetlist, sharedSetlists, showNotice],
  );

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

  if (serviceMode) {
    return (
      <ServiceMode
        serviceMode={serviceMode}
        hymns={hymns}
        currentUser={currentUser}
        onExit={onExitServiceMode}
        onMove={onMoveServiceMode}
        onSelectIndex={onSelectServiceIndex}
        canReadHymn={canAccessHymnById}
      />
    );
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
    <div
      className={`app ${state.theme} ${outputModeOpen ? "outputModeActive" : ""}`}
      dir="rtl"
      lang="ar"
    >
      <header className="topBar">
        <div>
          <h1>Harmony Notes</h1>
          <p>محرر ترانيم احترافي لكتابة الكوردات وعرضها</p>
        </div>

        <div className="row wrap">
          <div
            className={`saveStatus saveStatus--${saveState.status}`}
            role="status"
          >
            <span className="saveStatusDot" aria-hidden="true" />
            <span>{saveState.label}</span>
            {saveState.retryable ? (
              <button
                type="button"
                className="btn btnSmall"
                onClick={onRetrySave}
              >
                إعادة المحاولة
              </button>
            ) : null}
          </div>
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
          <button className="btn" onClick={onTriggerRefresh}>
            تحديث / مزامنة
          </button>
          <button className="btn" onClick={onExport} disabled={loadingExport}>
            {loadingExport ? "جاري التصدير..." : "تصدير PNG (HD)"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setOutputModeOpen(true)}
            aria-haspopup="dialog"
          >
            إخراج
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
          <section className="hymnLibrary" aria-label="My library">
            <div className="row between sidebarHeader">
              <h3>مكتبتي</h3>
              {selectedHymnIsAccessible ? (
                <button
                  type="button"
                  className={`btn favoriteToggle ${selectedHymnIsFavorite ? "isFavorite" : ""}`}
                  aria-pressed={selectedHymnIsFavorite}
                  aria-label={
                    selectedHymnIsFavorite
                      ? "إزالة من المفضلة"
                      : "إضافة إلى المفضلة"
                  }
                  title={
                    selectedHymnIsFavorite
                      ? "إزالة من المفضلة"
                      : "إضافة إلى المفضلة"
                  }
                  onClick={() =>
                    setFavoriteIds(toggleFavorite(selectedHymnId, favoriteIds))
                  }
                >
                  <span aria-hidden="true">
                    {selectedHymnIsFavorite ? "★" : "☆"}
                  </span>
                  <span>
                    {selectedHymnIsFavorite ? "مفضلة" : "أضف للمفضلة"}
                  </span>
                </button>
              ) : null}
            </div>
            <details className="libraryGroup">
              <summary>
                <span>المفضلة</span>
                <small>{favoriteHymns.length}</small>
              </summary>
              {favoriteHymns.length ? (
                <ul className="hymnList libraryHymnList">
                  {favoriteHymns.map((hymnItem) => (
                    <li key={hymnItem.id}>
                      <button
                        type="button"
                        className={`hymnListItem ${selectedHymnId === hymnItem.id ? "active" : ""}`}
                        onClick={() => onSelectHymn(hymnItem)}
                      >
                        <span>{hymnItem.title || "ترنيمة بدون عنوان"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sidebarHint">لا توجد ترانيم مفضلة متاحة.</p>
              )}
            </details>
            <details className="libraryGroup" open>
              <summary>
                <span>استُخدمت مؤخرًا</span>
                <small>{recentHymns.length}</small>
              </summary>
              {recentHymns.length ? (
                <ul className="hymnList libraryHymnList">
                  {recentHymns.map((hymnItem, index) => (
                    <li key={hymnItem.id}>
                      <button
                        type="button"
                        className={`hymnListItem ${selectedHymnId === hymnItem.id ? "active" : ""}`}
                        onClick={() => onSelectHymn(hymnItem)}
                      >
                        <span>
                          {index + 1}. {hymnItem.title || "ترنيمة بدون عنوان"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sidebarHint">ستظهر هنا الترانيم التي تفتحها.</p>
              )}
            </details>
          </section>
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
                placeholder="العنوان أو الكلمات أو المقام أو الكورد…"
                value={hymnSearchQuery}
                onChange={(e) => setHymnSearchQuery(e.target.value)}
                disabled={loadingHymns}
                autoComplete="off"
                spellCheck={false}
                aria-label="البحث في العنوان والكلمات والمقام والكورد"
              />
              <div className="hymnSearchFilters" aria-label="مرشحات الترانيم">
                <select
                  className="input hymnKeyFilter"
                  value={hymnKeyFilter}
                  onChange={(event) => setHymnKeyFilter(event.target.value)}
                  disabled={loadingHymns}
                  aria-label="تصفية حسب المقام المحفوظ"
                >
                  <option value="">كل المقامات</option>
                  {hymnKeyOptions.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`btn hymnFilterToggle ${favoritesOnly ? "active" : ""}`}
                  aria-pressed={favoritesOnly}
                  onClick={() => setFavoritesOnly((active) => !active)}
                >
                  المفضلة
                </button>
                <button
                  type="button"
                  className={`btn hymnFilterToggle ${recentOnly ? "active" : ""}`}
                  aria-pressed={recentOnly}
                  onClick={() => setRecentOnly((active) => !active)}
                >
                  الأخيرة
                </button>
              </div>
              {!loadingHymns && hymns.length > 0 ? (
                <p className="hymnSearchMeta" aria-live="polite">
                  {filteredHymns.length === visibleHymns.length &&
                  !hymnSearchQuery.trim() &&
                  !hymnKeyFilter &&
                  !favoritesOnly &&
                  !recentOnly
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
                <button
                  type="button"
                  className="btn"
                  onClick={onSaveDraftClick}
                >
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
          filteredHymns.length === 0 &&
          (hymnSearchQuery.trim() ||
            hymnKeyFilter ||
            favoritesOnly ||
            recentOnly) ? (
            <p className="sidebarHint">
              لا توجد ترانيم تطابق البحث والمرشحات الحالية.
            </p>
          ) : null}

          {hasFirebaseConfig && !loadingHymns && filteredHymns.length > 0 ? (
            <ul className="hymnList hymnSearchResultList">
              {filteredHymns.map((hymnItem) => (
                <li key={hymnItem.id}>
                  <button
                    type="button"
                    className={`hymnListItem ${selectedHymnId === hymnItem.id ? "active" : ""}`}
                    onClick={() => onSelectHymn(hymnItem)}
                    aria-label={`${hymnItem.title || "ترنيمة بدون عنوان"}, ${hymnItem.key || "مقام غير محدد"}${isFavorite(hymnItem.id, favoriteIds) ? ", مفضلة" : ""}`}
                  >
                    <span className="hymnSearchResultTitle">
                      {hymnItem.title || "ترنيمة بدون عنوان"}
                      {hymnItem.isExclusive ? <small> (حصرية)</small> : null}
                    </span>
                    <span className="hymnSearchResultMeta" dir="ltr">
                      {isFavorite(hymnItem.id, favoriteIds) ? (
                        <span aria-hidden="true">★</span>
                      ) : null}
                      {hymnItem.key || "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <SetlistPanel
            currentId={selectedHymnId}
            currentTitle={state.hymn.title}
            canAdd={Boolean(selectedHymnId)}
            canManageSharedSetlists={canManageSharedSetlists}
            sharedSetlists={sharedSetlists}
            selectedSharedSetlistId={selectedSharedSetlistId}
            onSelectSharedSetlist={setSelectedSharedSetlistId}
            onCreateSharedSetlist={onCreateSharedSetlist}
            onDeleteSharedSetlist={onDeleteSharedSetlist}
            onRenameSharedSetlist={onRenameSharedSetlist}
            onAddCurrentToSharedSetlist={onAddCurrentToSharedSetlist}
            onMoveSharedSetlistItem={onMoveSharedSetlistItem}
            onRemoveSharedSetlistItem={onRemoveSharedSetlistItem}
            onStartServiceMode={onStartServiceMode}
            sharedSetlistItems={selectedSharedSetlistItems}
            sharedSetlistsLoading={sharedSetlistsLoading}
            onOpen={onOpenSetlistHymn}
          />
        </aside>

        <div className="editorPane">
          {state.mode === "edit" && isAdmin ? (
            <HymnEditor />
          ) : (
            <HymnView ref={viewRef} isExporting={isExporting} />
          )}
        </div>
      </main>

      {state.mode === "edit" && isAdmin ? (
        <section className="previewWrap">
          <h3>معاينة مباشرة</h3>
          <HymnView ref={viewRef} isExporting={isExporting} />
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

      {outputModeOpen ? <OutputMode onClose={closeOutputMode} /> : null}

      {pendingUnsafeTransition ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="card confirmModal">
            <h3>{pendingUnsafeTransition.title}</h3>
            <p>{pendingUnsafeTransition.message}</p>
            <div className="row wrap confirmActions">
              <button
                type="button"
                className="btn primary"
                onClick={pendingUnsafeTransition.onSave}
              >
                حفظ والتبديل
              </button>
              <button
                type="button"
                className="btn"
                onClick={pendingUnsafeTransition.onDiscard}
              >
                تجاهل التعديلات
              </button>
              <button
                type="button"
                className="btn"
                onClick={pendingUnsafeTransition.onCancel}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
