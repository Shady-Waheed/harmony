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
  updateDoc,
  waitForPendingWrites,
  where,
} from "firebase/firestore";
import {
  app as firebaseApp,
  auth,
  db,
  googleProvider,
  hasFirebaseConfig,
} from "./firebase";
import {
  canReadExclusiveHymn,
  canAccessTeamDashboard,
  canManageSetlists,
  isSuperAdminUser,
  resolvePermissions,
  SETTINGS_TEAM_DOC,
} from "./utils/permissions";
import {
  isDraftStale,
  isPermissionFailure,
  selectPendingSyncDraft,
  shouldClearPendingDraft,
} from "./utils/pendingSyncRecovery";
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
import {
  clearDraft,
  getAllDrafts,
  getDraft,
  markDraftConflict,
  markDraftPendingSync,
  writeDraft,
} from "./utils/hymnDrafts";
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
  buildHymnWriteMetadata,
  areHymnContentsEqual,
  decodeStoredHymn,
  encodeHymnForFirestore,
  resolveHymnWriteMode,
} from "./utils/hymnFirestore";
import {
  decodeStoredSetlist,
  encodeSetlistForFirestore,
  mergeSharedSetlists,
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
  resolveSaveAttempt,
  resolveSaveErrorNotification,
  resolveSaveState,
  showSaveSuccessNotification,
  shouldBlockBeforeUnload,
  shouldPromptBeforeDiscard,
} from "./utils/saveState";
import {
  HYMN_LIBRARY_EVENT,
  isFavorite,
  readFavoriteIds,
  readRecentHymnIds,
  resolveHymnsByIds,
  setHymnLibraryScope,
  toggleFavorite,
} from "./utils/hymnLibrary";
import {
  filterAuthorizedHymns,
  getHymnLoadState,
  getHymnReadPlan,
  mergeOfflineHymnResults,
  mergeHymnQueryResults,
} from "./utils/hymnRead";
import { offlineAccountStore } from "./utils/offlineAccountStore";

function buildHymnQueries(userUid, isBootstrapAdmin) {
  const hymnsCollection = collection(db, "hymns");
  return getHymnReadPlan(userUid, isBootstrapAdmin).map((plan) => ({
    source: plan.source,
    query: query(
      hymnsCollection,
      ...plan.filters.map((filter) =>
        where(filter.field, filter.operator, filter.value),
      ),
      orderBy(plan.orderBy.field, plan.orderBy.direction),
    ),
  }));
}

function mapHymnSnapshot(snapshot) {
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

function awaitFirestoreOperation(operation) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      const error = new Error("Firestore operation timed out.");
      error.code = "deadline-exceeded";
      reject(error);
    }, 10000);
  });

  return Promise.race([operation, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

async function fetchHymnDocFromServer(hymnId) {
  if (!db || !hasFirebaseConfig || !hymnId) {
    return null;
  }

  try {
    const snapshot = await awaitFirestoreOperation(
      getDocFromServer(doc(db, "hymns", hymnId)),
    );
    if (!snapshot.exists()) {
      return null;
    }
    return { id: snapshot.id, ...snapshot.data() };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(
        "[fetchHymnDocFromServer] server failed:",
        error?.code || error?.message || error,
      );
    }
    try {
      const snapshot = await getDocFromCache(doc(db, "hymns", hymnId));
      if (!snapshot.exists()) {
        return null;
      }
      return { id: snapshot.id, ...snapshot.data() };
    } catch (cacheError) {
      if (import.meta.env.DEV) {
        console.warn(
          "[fetchHymnDocFromServer] cache fallback failed:",
          cacheError?.code || cacheError?.message || cacheError,
        );
      }
      return null;
    }
  }
}

async function refreshHymnsListFromServer(userUid, isBootstrapAdmin) {
  if (!db || !hasFirebaseConfig) {
    return [];
  }

  const queries = buildHymnQueries(userUid, isBootstrapAdmin);
  const snapshots = await Promise.all(
    queries.map(({ query: hymnsQuery }) =>
      awaitFirestoreOperation(getDocsFromServer(hymnsQuery)),
    ),
  );
  return mergeHymnQueryResults(...snapshots.map(mapHymnSnapshot));
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
    setStorageScopeUid,
    markHymnSaved,
    syncLastSavedIfEmpty,
    saveDraftNow,
    discardDraft,
    isDirty,
    undo,
    redo,
  } = useHymnStore();
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const { routeHymnId, navigateHymn } = useHymnRoute();
  const [loadingExport, setLoadingExport] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [outputModeOpen, setOutputModeOpen] = useState(false);
  const [hymns, setHymns] = useState([]);
  const hymnsRef = useRef(hymns);
  hymnsRef.current = hymns;
  const synchronizedHymnsRef = useRef([]);
  const hymnServerReadyUidRef = useRef("");
  const [loadingHymns, setLoadingHymns] = useState(true);
  const [hymnsError, setHymnsError] = useState(null);
  const [hymnListenerRetry, setHymnListenerRetry] = useState(0);
  const [selectedHymnId, setSelectedHymnId] = useState("");
  const [favoriteIds, setFavoriteIds] = useState(readFavoriteIds);
  const [recentHymnIds, setRecentHymnIds] = useState(readRecentHymnIds);
  const [savingHymn, setSavingHymn] = useState(false);
  const saveInFlightRef = useRef(false);
  const [saveError, setSaveError] = useState(null);
  const [saveErrorCode, setSaveErrorCode] = useState("");
  const [saveDiagnostic, setSaveDiagnostic] = useState(null);
  const [saveErrorWriteCompleted, setSaveErrorWriteCompleted] = useState(false);
  const [deletingHymn, setDeletingHymn] = useState(false);
  const [notice, setNotice] = useState(null);
  const [pendingUnsafeTransition, setPendingUnsafeTransition] = useState(null);
  const [hymnSearchQuery, setHymnSearchQuery] = useState("");
  const [hymnKeyFilter, setHymnKeyFilter] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const currentHymnRef = useRef(state.hymn);
  currentHymnRef.current = state.hymn;
  const [authLoading, setAuthLoading] = useState(true);
  const viewRef = useRef(null);
  const projectFileInputRef = useRef(null);
  const noticeTimeoutRef = useRef(null);
  const currentUserUidRef = useRef("");
  currentUserUidRef.current = String(currentUser?.uid || "");
  const authScopeUidRef = useRef(null);

  const [teamData, setTeamData] = useState(null);
  const [hymnsFromCache, setHymnsFromCache] = useState(false);
  const [teamFromCache, setTeamFromCache] = useState(false);
  const [pendingFirestoreWrites, setPendingFirestoreWrites] = useState(false);
  const pendingSyncNoticeRef = useRef(false);
  const lastDirectHymnWriteAtRef = useRef(0);
  const hymnSyncInFlightRef = useRef(false);
  const lastRouteAttemptRef = useRef("");
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [sharedSetlists, setSharedSetlists] = useState([]);
  const [sharedSetlistsLoading, setSharedSetlistsLoading] = useState(false);
  const [selectedSharedSetlistId, setSelectedSharedSetlistId] = useState("");
  const pendingSetlistChangesRef = useRef([]);
  const setlistSyncInFlightRef = useRef(false);
  const [pendingSyncRevision, setPendingSyncRevision] = useState(0);
  const [serviceMode, setServiceMode] = useState(null);
  const scopedDrafts = getAllDrafts(currentUser?.uid || "guest");
  const hasHymnSyncConflict = scopedDrafts.some((draft) => draft.conflict);
  const canRetryLocalSync =
    scopedDrafts.some((draft) => draft.pendingSync && !draft.conflict) ||
    pendingSetlistChangesRef.current.length > 0;
  const pendingLocalSync =
    scopedDrafts.some((draft) => draft.pendingSync) ||
    pendingSetlistChangesRef.current.length > 0;

  const {
    status: syncStatus,
    label: syncLabel,
    online,
  } = useOfflineSync({
    hymnsFromCache,
    teamFromCache,
    teamActive: Boolean(currentUser),
    hymnsReady: !loadingHymns,
    pendingWrites: pendingFirestoreWrites || pendingLocalSync,
  });

  const isDark = state.theme === "dark";
  const livePerms = useMemo(
    () => resolvePermissions(currentUser, teamData || {}),
    [currentUser, teamData],
  );
  const livePermsRef = useRef(livePerms);
  livePermsRef.current = livePerms;
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
  const isSuperAdmin = livePerms.isSuperAdmin;
  const canDelete = livePerms.canDelete;
  const canSaveFirebase = livePerms.canSaveFirebase;
  const canWriteHymns = canSaveFirebase || isSuperAdmin;
  const canManageTeam = useMemo(
    () => canAccessTeamDashboard(currentUser, teamData || {}),
    [currentUser, teamData],
  );

  const showFirebaseSaveBtn = canWriteHymns && hasFirebaseConfig;
  const showFirebaseDeleteBtn = canDelete && hasFirebaseConfig;

  const visibleHymns = useMemo(
    () =>
      hymns.filter((item) => {
        const exclusiveOwnerUid = String(item.exclusiveOwnerUid || "");
        const isExclusive =
          Boolean(item.isExclusive) || exclusiveOwnerUid.length > 0;
        if (!isExclusive) return true;
        return canReadExclusiveHymn(currentUser, exclusiveOwnerUid);
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
  const hymnLoadState = getHymnLoadState({
    loading: authLoading || loadingHymns,
    error: hymnsError,
    hymns,
    offline: !online,
  });
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

  const teamMembersForDashboard = useMemo(() => {
    const rawMembers = teamData?.members;
    if (Array.isArray(rawMembers)) return rawMembers;
    if (rawMembers && typeof rawMembers === "object") {
      return Object.values(rawMembers);
    }
    return [];
  }, [teamData]);
  const canManageSharedSetlists = Boolean(
    currentUser &&
    hasFirebaseConfig &&
    canManageSetlists(currentUser, teamData || {}),
  );
  const canManageSharedSetlistsRef = useRef(canManageSharedSetlists);
  canManageSharedSetlistsRef.current = canManageSharedSetlists;
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
      return canReadExclusiveHymn(currentUser, exclusiveOwnerUid);
    },
    [currentUser, hymns],
  );

  const showNotice = useCallback((message, type = "info") => {
    setNotice({ message, type });
    window.clearTimeout(noticeTimeoutRef.current);
    const duration = type === "error" ? 7000 : type === "success" ? 4000 : 5000;
    noticeTimeoutRef.current = window.setTimeout(
      () => setNotice(null),
      duration,
    );
  }, []);

  const runSaveFollowup = useCallback(
    async (afterSave, isOffline = false) => {
      if (!afterSave) return true;
      try {
        await afterSave();
        return true;
      } catch (error) {
        console.warn(
          "[save follow-up failed]",
          error?.code || error?.name || "unknown",
        );
        showNotice(
          isOffline
            ? "تم حفظ التغييرات على الجهاز فقط، لكن تعذّر إكمال الإجراء التالي."
            : "تم حفظ التغييرات بنجاح، لكن تعذّر إكمال الإجراء التالي.",
          "info",
        );
        return false;
      }
    },
    [showNotice],
  );

  const logSaveFailure = useCallback(
    (error, context = {}) => {
      const authenticatedUid = String(context.authenticatedUser?.uid || "");
      const memberRow =
        authenticatedUid &&
        context.teamData?.members &&
        !Array.isArray(context.teamData.members)
          ? context.teamData.members[authenticatedUid]
          : null;
      const safeContext = {
        code: error?.code || "unknown",
        message: error?.message || "save failed",
        userUid: authenticatedUid || null,
        teamMemberFound: Boolean(memberRow && typeof memberRow === "object"),
        teamCanSaveFirebase: memberRow?.canSaveFirebase === true,
        teamSnapshotFromCache: Boolean(context.teamFromCache),
        savePermissions: context.savePermissions
          ? {
              canSaveFirebase: context.savePermissions.canSaveFirebase,
              isSuperAdmin: context.savePermissions.isSuperAdmin,
            }
          : null,
        hymnId: context.selectedHymnId || context.hymnId || null,
        projectId: context.projectId || null,
        writeOperation: context.writeOperation || null,
        payloadValidation: context.payloadValidation || null,
        isDirty: Boolean(context.isDirty),
        isOffline: Boolean(context.isOffline),
        firestoreWriteCompleted: Boolean(context.firestoreWriteCompleted),
      };
      console.warn("[save failed]", safeContext);
      return safeContext;
    },
    [],
  );

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
      const nextUid = String(user?.uid || "guest");
      if (authScopeUidRef.current !== nextUid) {
        authScopeUidRef.current = nextUid;
        setStorageScopeUid(nextUid);
        setHymnLibraryScope(nextUid);
        setFavoriteIds(readFavoriteIds());
        setRecentHymnIds(readRecentHymnIds());
        setHymns([]);
        synchronizedHymnsRef.current = [];
        hymnServerReadyUidRef.current = "";
        setLoadingHymns(true);
        setSharedSetlists([]);
        setSharedSetlistsLoading(Boolean(user));
        pendingSetlistChangesRef.current = [];
        setPendingSyncRevision((revision) => revision + 1);
        setSelectedHymnId("");
        setSelectedSharedSetlistId("");
        setTeamData(null);
        setTeamFromCache(false);
        setPendingFirestoreWrites(false);
        setHymnsError(null);
        setServiceMode(loadServiceModeFromStorage(nextUid));
      }
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [setStorageScopeUid]);

  useEffect(() => {
    if (authLoading) return undefined;
    const userUid = String(currentUser?.uid || "guest");
    if (!db || !hasFirebaseConfig) {
      setHymns([]);
      setHymnsError(null);
      setLoadingHymns(false);
      return undefined;
    }

    setLoadingHymns(true);
    setHymnsError(null);
    setHymnsFromCache(false);
    setPendingFirestoreWrites(false);
    if (!online) hymnServerReadyUidRef.current = "";

    const queries = buildHymnQueries(
      currentUser?.uid || null,
      isSuperAdminUser(currentUser),
    );
    const queryResults = Object.fromEntries(
      queries.map(({ source }) => [source, []]),
    );
    const queryMetadata = Object.fromEntries(
      queries.map(({ source }) => [source, null]),
    );
    const receivedInitialSnapshot = Object.fromEntries(
      queries.map(({ source }) => [source, false]),
    );
    let active = true;
    let cachedHymns = [];
    let accountCacheReady = false;
    let serverSnapshotsComplete = false;

    const publishResults = () => {
      if (!active) return;
      const serverHymns = mergeHymnQueryResults(
        ...Object.values(queryResults),
      );
      const serverIsAuthoritative =
        Object.values(receivedInitialSnapshot).every(Boolean) &&
        Object.values(queryMetadata).every(
          (metadata) => metadata && !metadata.fromCache && !metadata.hasPendingWrites,
        );
      const mergedHymns = mergeOfflineHymnResults({
        cachedHymns,
        serverHymns,
        drafts: getAllDrafts(userUid),
        serverIsAuthoritative,
      });
      setHymns(
        filterAuthorizedHymns(
          mergedHymns,
          currentUser,
          canReadExclusiveHymn,
        ),
      );
      setHymnsFromCache(
        !serverIsAuthoritative &&
          (cachedHymns.length > 0 ||
            Object.values(queryMetadata).some((metadata) => metadata?.fromCache)),
      );
      setPendingFirestoreWrites(
        Object.values(queryMetadata).some(
          (metadata) => metadata?.hasPendingWrites,
        ),
      );
      if (serverIsAuthoritative) {
        cachedHymns = filterAuthorizedHymns(
          serverHymns,
          currentUser,
          canReadExclusiveHymn,
        );
        synchronizedHymnsRef.current = cachedHymns;
        if (hymnServerReadyUidRef.current !== userUid) {
          hymnServerReadyUidRef.current = userUid;
          setPendingSyncRevision((revision) => revision + 1);
        }
        offlineAccountStore
          .update(userUid, { hymns: cachedHymns })
          .catch(() => undefined);
      }
      serverSnapshotsComplete = serverIsAuthoritative;
      if (serverSnapshotsComplete && accountCacheReady) {
        setLoadingHymns(false);
      }
    };

    offlineAccountStore.read(userUid).then((account) => {
      if (
        !active ||
        String(currentUserUidRef.current || "guest") !== userUid
      ) return;
      accountCacheReady = true;
      cachedHymns = filterAuthorizedHymns(
        account.hymns,
        currentUser,
        canReadExclusiveHymn,
      );
      synchronizedHymnsRef.current = cachedHymns;
      if (getAllDrafts(userUid).some((draft) => draft.pendingSync)) {
        setPendingSyncRevision((revision) => revision + 1);
      }
      publishResults();
      if (cachedHymns.length || !online || serverSnapshotsComplete) {
        setLoadingHymns(false);
      }
    });

    const unsubscribes = queries.map(({ source, query: hymnsQuery }) => {
      return onSnapshot(
        hymnsQuery,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!active) return;
          queryResults[source] = mapHymnSnapshot(snapshot);
          queryMetadata[source] = snapshot.metadata;
          receivedInitialSnapshot[source] = true;
          if (!snapshot.metadata.fromCache) setHymnsError(null);
          publishResults();
        },
        (error) => {
          if (!active) return;
          hymnServerReadyUidRef.current = "";
          setHymnsError(error?.code || "read-failed");
          if (accountCacheReady) setLoadingHymns(false);
          if (import.meta.env.DEV) {
            console.warn(
              `[hymns ${source} snapshot]`,
              error?.code || error?.message || error,
            );
          }
        },
      );
    });

    return () => {
      active = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [authLoading, currentUser, hymnListenerRetry, online]);

  useEffect(() => {
    if (!db || !hasFirebaseConfig || authLoading || !currentUser) {
      setSelectedSharedSetlistId("");
      setSharedSetlistsLoading(false);
      return undefined;
    }

    const userUid = String(currentUser.uid);
    let active = true;
    let cachedSetlists = [];
    let serverSetlists = [];
    let serverIsAuthoritative = false;
    setSharedSetlistsLoading(true);
    offlineAccountStore.read(userUid).then((account) => {
      if (!active || currentUserUidRef.current !== userUid) return;
      cachedSetlists = account.sharedSetlists;
      pendingSetlistChangesRef.current = account.pendingSetlistChanges;
      if (pendingSetlistChangesRef.current.length) {
        setPendingSyncRevision((revision) => revision + 1);
      }
      setSharedSetlists(
        mergeSharedSetlists({
          cachedSetlists,
          serverSetlists,
          pendingChanges: pendingSetlistChangesRef.current,
          serverIsAuthoritative,
        }),
      );
      setSharedSetlistsLoading(false);
    });

    const setlistsQuery = query(
      collection(db, "setlists"),
      orderBy("updatedAt", "desc"),
    );
    const unsubscribe = onSnapshot(
      setlistsQuery,
      (snapshot) => {
        if (!active) return;
        serverSetlists = snapshot.docs.map((docSnap) => {
          const raw = { id: docSnap.id, ...docSnap.data() };
          return decodeStoredSetlist(raw);
        });
        serverIsAuthoritative =
          !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
        setSharedSetlists(
          mergeSharedSetlists({
            cachedSetlists,
            serverSetlists,
            pendingChanges: pendingSetlistChangesRef.current,
            serverIsAuthoritative,
          }),
        );
        if (serverIsAuthoritative) {
          cachedSetlists = serverSetlists;
          offlineAccountStore
            .update(userUid, { sharedSetlists: serverSetlists })
            .catch(() => undefined);
        }
        setSharedSetlistsLoading(false);
      },
      (err) => {
        if (!active) return;
        console.warn("[setlists snapshot]", err?.code || err?.message || err);
        setSharedSetlistsLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authLoading, currentUser, online]);

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
        const nextTeamData = snapshot.exists() ? snapshot.data() || {} : {};
        setTeamData({
          ...nextTeamData,
          members:
            nextTeamData.members && typeof nextTeamData.members === "object"
              ? nextTeamData.members
              : {},
        });
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
    const userUid = String(currentUser?.uid || "");
    if (
      !online ||
      !userUid ||
      !livePerms.canSaveFirebase ||
      hymnServerReadyUidRef.current !== userUid ||
      hymnSyncInFlightRef.current
    ) {
      return;
    }

    hymnSyncInFlightRef.current = true;
    const syncPendingDrafts = async () => {
      let syncingHymnId = "";
      try {
        for (let attempt = 0; attempt < 50; attempt += 1) {
          if (
            currentUserUidRef.current !== userUid ||
            !livePermsRef.current.canSaveFirebase
          ) {
            break;
          }

          const entry = selectPendingSyncDraft(getAllDrafts(userUid), userUid);
          if (!entry?.hymn?.id) break;

          const hymn = entry.hymn;
          syncingHymnId = hymn.id;
          const latestDraft = getDraft(hymn.id, userUid);
          if (isDraftStale(entry, latestDraft)) {
            continue;
          }

          const existingHymn = entry.isNew
            ? null
            : synchronizedHymnsRef.current.find(
                  (item) => item.id === hymn.id,
                ) ||
              entry.baseHymn ||
              null;
          if (
            !entry.isNew &&
            entry.baseHymn &&
            (!existingHymn ||
              !areHymnContentsEqual(entry.baseHymn, existingHymn))
          ) {
            markDraftConflict(hymn.id, userUid);
            showNotice(
              "تغيّرت نسخة الخادم؛ احتُفظ بالتعديل محليًا. راجع الترنيمة قبل الحفظ.",
              "error",
            );
            break;
          }
          if (!entry.isNew && !existingHymn) {
            markDraftConflict(hymn.id, userUid);
            showNotice(
              "تعذّر تحديد نسخة الترنيمة على السيرفر؛ احتُفظ بالمسودة المحلية ولم يتم إنشاء مستند بالمعرّف القديم.",
              "error",
            );
            break;
          }
          const canonicalPayload = encodeHymnForFirestore(hymn);
          const writeMetadata = buildHymnWriteMetadata({
            currentUserUid: userUid,
            isBootstrapAdmin: livePermsRef.current.isSuperAdmin,
            existingHymn,
            requestedExclusive: hymn.isExclusive,
          });
          const hymnRef = doc(db, "hymns", hymn.id);
          const writeMode = resolveHymnWriteMode({
            hymnId: hymn.id,
            isNew: entry.isNew,
          });
          const hymnPayload = {
            title: canonicalPayload.title,
            key: canonicalPayload.key,
            sections: canonicalPayload.sections,
            schemaVersion: canonicalPayload.schemaVersion,
            ...writeMetadata,
            updatedAt: serverTimestamp(),
            ...(writeMode === "create" ? { createdAt: Timestamp.now() } : {}),
          };
          if (writeMode === "create") {
            await setDoc(hymnRef, hymnPayload, { merge: true });
          } else {
            await updateDoc(hymnRef, hymnPayload);
          }

          if (currentUserUidRef.current !== userUid) break;
          if (
            shouldClearPendingDraft({
              saveSucceeded: true,
              hymnId: hymn.id,
            })
          ) {
            clearDraft(hymn.id, entry.updatedAt, userUid);
          }
          const savedCopy = {
            ...existingHymn,
            id: hymn.id,
            title: canonicalPayload.title,
            key: canonicalPayload.key,
            sections: canonicalPayload.sections,
            schemaVersion: canonicalPayload.schemaVersion,
            ...writeMetadata,
            createdAt: existingHymn?.createdAt || Date.now(),
            updatedAt: Date.now(),
          };
          const account = await offlineAccountStore.read(userUid);
          const cachedHymns = mergeHymnQueryResults(
            account.hymns.filter((item) => item.id !== hymn.id),
            [savedCopy],
          );
          synchronizedHymnsRef.current = cachedHymns;
          await offlineAccountStore.update(userUid, { hymns: cachedHymns });
          setHymns((previous) =>
            mergeOfflineHymnResults({
              cachedHymns: previous,
              serverHymns: [savedCopy],
              drafts: getAllDrafts(userUid),
            }),
          );

          if (
            getDraft(hymn.id, userUid) === null &&
            currentHymnRef.current?.id === hymn.id
          ) {
            markHymnSaved(hymn);
          }
        }
      } catch (error) {
        if (isPermissionFailure(error)) {
          showNotice(
            "ليس لديك صلاحية تحديث هذه الترنيمة على السيرفر.",
            "error",
          );
          return;
        }
        if (error?.code === "not-found") {
          if (syncingHymnId) markDraftConflict(syncingHymnId, userUid);
          showNotice(
            "الترنيمة غير موجودة على السيرفر؛ احتُفظ بالمسودة المحلية ولم يتم إنشاؤها بالمعرّف القديم.",
            "error",
          );
          return;
        }
        if (import.meta.env.DEV) {
          console.warn(
            "[pending hymn sync]",
            error?.code || error?.message || error,
          );
        }
      } finally {
        hymnSyncInFlightRef.current = false;
      }
    };

    syncPendingDrafts();
  }, [
    currentUser?.uid,
    livePerms.canSaveFirebase,
    markHymnSaved,
    online,
    pendingSyncRevision,
    showNotice,
  ]);

  useEffect(() => {
    const userUid = String(currentUser?.uid || "");
    if (
      !online ||
      !userUid ||
      !canManageSharedSetlists ||
      setlistSyncInFlightRef.current
    ) {
      return;
    }

    setlistSyncInFlightRef.current = true;
    const syncPendingSetlists = async () => {
      try {
        for (let attempt = 0; attempt < 50; attempt += 1) {
          if (
            currentUserUidRef.current !== userUid ||
            !canManageSharedSetlistsRef.current
          ) {
            break;
          }

          const account = await offlineAccountStore.read(userUid);
          const change = account.pendingSetlistChanges[0];
          pendingSetlistChangesRef.current = account.pendingSetlistChanges;
          if (!change) break;

          if (change.deleted) {
            await deleteDoc(doc(db, "setlists", change.id));
          } else {
            const serialized = encodeSetlistForFirestore(change.setlist);
            await setDoc(
              doc(db, "setlists", change.id),
              {
                schemaVersion: serialized.schemaVersion,
                name: serialized.name,
                hymnIds: serialized.hymnIds,
                ownerUid: serialized.ownerUid,
                createdBy: serialized.createdBy,
                updatedBy: userUid,
                createdAt: serialized.createdAt,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
          }

          if (currentUserUidRef.current !== userUid) break;
          const updatedAccount = await offlineAccountStore.update(
            userUid,
            (latestAccount) => ({
              pendingSetlistChanges:
                latestAccount.pendingSetlistChanges.filter(
                  (item) => item.token !== change.token,
                ),
            }),
          );
          const remaining = updatedAccount.pendingSetlistChanges;
          pendingSetlistChangesRef.current = remaining;
          setPendingSyncRevision((revision) => revision + 1);
          setSharedSetlists((previous) =>
            mergeSharedSetlists({
              cachedSetlists: previous,
              pendingChanges: remaining,
            }),
          );
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn(
            "[pending setlist sync]",
            error?.code || error?.message || error,
          );
        }
      } finally {
        setlistSyncInFlightRef.current = false;
      }
    };

    syncPendingSetlists();
  }, [
    canManageSharedSetlists,
    currentUser?.uid,
    online,
    pendingSyncRevision,
  ]);

  useEffect(() => {
    if (authLoading) return;
    if (serviceMode) {
      setMode("view");
      saveServiceModeToStorage(serviceMode, currentUser?.uid || "guest");
      return;
    }

    saveServiceModeToStorage(null, currentUser?.uid || "guest");
  }, [authLoading, currentUser?.uid, serviceMode, setMode]);

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
          const directSaveJustConfirmed =
            Date.now() - lastDirectHymnWriteAtRef.current < 10000;
          if (!directSaveJustConfirmed) {
            showNotice("تم رفع كل التعديلات إلى السيرفر.", "success");
          }
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
      const saveAttempt = resolveSaveAttempt({
        isDirty: isDirtyRef.current,
        isSaving: saveInFlightRef.current,
        firestoreWriteCompleted: saveErrorWriteCompleted,
      });
      if (saveAttempt === "in-progress") {
        return false;
      }
      if (saveAttempt === "already-written") {
        showNotice(
          "تم تأكيد الكتابة على السيرفر؛ لن نكررها بسبب تعذّر التحديث المحلي.",
          "info",
        );
        return false;
      }
      if (saveAttempt === "unchanged") {
        showNotice("مفيش تغييرات جديدة للحفظ.", "info");
        return false;
      }

      const authenticatedUser = auth?.currentUser || null;
      const savePermissions = resolvePermissions(
        authenticatedUser,
        teamData || {},
      );
      if (!savePermissions.canSaveFirebase) {
        const authenticatedUid = String(authenticatedUser?.uid || "");
        const memberRow =
          authenticatedUid &&
          teamData?.members &&
          !Array.isArray(teamData.members)
            ? teamData.members[authenticatedUid]
            : null;
        console.warn("[save blocked] permission denied", {
          userUid: authenticatedUid || null,
          teamMemberFound: Boolean(memberRow && typeof memberRow === "object"),
          teamCanSaveFirebase: memberRow?.canSaveFirebase === true,
          isSuperAdmin: savePermissions.isSuperAdmin,
          teamSnapshotFromCache: Boolean(teamFromCache),
        });
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
      const existingHymn = selectedHymnId
        ? hymns.find((item) => item.id === selectedHymnId) ||
          (state.lastSavedHymn?.id === selectedHymnId
            ? state.lastSavedHymn
            : null)
        : null;
      const synchronizedExistingHymn = selectedHymnId
        ? synchronizedHymnsRef.current.find(
            (item) => item.id === selectedHymnId,
          )
        : null;
      const currentDraft = getDraft(state.hymn.id);
      const isNewHymn = selectedHymnId
        ? Boolean(currentDraft?.isNew)
        : true;
      const writeMode = resolveHymnWriteMode({
        hymnId: selectedHymnId,
        isNew: isNewHymn,
      });
      const writeMetadata = buildHymnWriteMetadata({
        currentUserUid: authenticatedUser.uid,
        isBootstrapAdmin: savePermissions.isSuperAdmin,
        existingHymn: writeMode === "update" ? existingHymn : null,
        requestedExclusive: state.hymn.isExclusive,
      });
      const payload = {
        title: canonicalPayload.title || title,
        key: canonicalPayload.key || state.hymn.key || "",
        sections: canonicalPayload.sections || [],
        schemaVersion: canonicalPayload.schemaVersion || 2,
        ...writeMetadata,
        updatedAt: serverTimestamp(),
      };

      if (
        !isBrowserOffline() &&
        !isNewHymn &&
        (!synchronizedExistingHymn ||
          !areHymnContentsEqual(
            state.lastSavedHymn || existingHymn,
            synchronizedExistingHymn,
          )) &&
        !window.confirm(
          "تغيّرت نسخة الخادم منذ فتح الترنيمة. هل تريد استبدالها بتعديلاتك؟",
        )
      ) {
        writeDraft(state.hymn.id, state.hymn, {
          baseHymn: state.lastSavedHymn,
          isNew: false,
          pendingSync: true,
        });
        markDraftConflict(state.hymn.id, authenticatedUser.uid);
        showNotice(
          "احتُفظ بالتعديل محليًا؛ راجع اختلاف نسخة الخادم قبل إعادة المحاولة.",
          "error",
        );
        return false;
      }

      saveInFlightRef.current = true;
      setSavingHymn(true);
      setSaveError(null);
      setSaveErrorCode("");
      setSaveDiagnostic(null);
      setSaveErrorWriteCompleted(false);
      let localDraftSaved = false;
      let firestoreWriteCompleted = false;
      let writeOperation = writeMode;
      try {
        writeDraft(state.hymn.id, state.hymn, {
          baseHymn: state.lastSavedHymn,
          isNew: isNewHymn,
        });
        localDraftSaved = true;
        if (isBrowserOffline()) {
          const localHymnId = String(selectedHymnId || state.hymn.id || "");
          writeDraft(
            localHymnId,
            { ...state.hymn, id: localHymnId, ...writeMetadata },
            {
              baseHymn: state.lastSavedHymn,
              isNew: isNewHymn,
            },
          );
          markDraftPendingSync(localHymnId);
          setPendingSyncRevision((revision) => revision + 1);
          setSelectedHymnId(localHymnId);
          setHymns((previous) =>
            filterAuthorizedHymns(
              mergeOfflineHymnResults({
                cachedHymns: previous,
                drafts: getAllDrafts(authenticatedUser.uid),
              }),
              authenticatedUser,
              canReadExclusiveHymn,
            ),
          );
          navigateHymn(localHymnId, { replace: true });
          if (!(await runSaveFollowup(afterSave, true))) return true;
          showSaveSuccessNotification(showNotice, { isOffline: true });
          return true;
        }

        if (writeMode === "update") {
          lastDirectHymnWriteAtRef.current = Date.now();
          let savedHymnId = selectedHymnId;
          let savedMetadata = writeMetadata;
          try {
            await updateDoc(doc(db, "hymns", selectedHymnId), payload);
          } catch (error) {
            if (error?.code !== "not-found") throw error;

            savedMetadata = buildHymnWriteMetadata({
              currentUserUid: authenticatedUser.uid,
              isBootstrapAdmin: savePermissions.isSuperAdmin,
              existingHymn: null,
              requestedExclusive: state.hymn.isExclusive,
            });
            const createdAt = Timestamp.now();
            const created = await addDoc(collection(db, "hymns"), {
              ...payload,
              ...savedMetadata,
              createdAt,
            });
            savedHymnId = created.id;
            writeOperation = "create-after-not-found";
            clearDraft(selectedHymnId, undefined, authenticatedUser.uid);
            setSelectedHymnId(savedHymnId);
            loadHymn(
              {
                ...state.hymn,
                id: savedHymnId,
                title,
                isExclusive: savedMetadata.isExclusive,
                exclusiveOwnerUid: savedMetadata.exclusiveOwnerUid,
              },
              { ignoreDraft: true, mode: "edit" },
            );
            navigateHymn(savedHymnId, { replace: true });
          }
          firestoreWriteCompleted = true;
          const savedCopy = {
            ...(savedHymnId === selectedHymnId ? existingHymn : {}),
            id: savedHymnId,
            title,
            key: payload.key,
            sections: payload.sections,
            schemaVersion: payload.schemaVersion,
            ...savedMetadata,
            updatedAt: Date.now(),
          };
          synchronizedHymnsRef.current = mergeHymnQueryResults(
            synchronizedHymnsRef.current.filter(
              (item) =>
                item.id !== selectedHymnId && item.id !== savedHymnId,
            ),
            [savedCopy],
          );
          await offlineAccountStore.update(authenticatedUser.uid, {
            hymns: synchronizedHymnsRef.current,
          });
          setHymns((prev) => [
            savedCopy,
            ...prev.filter(
              (item) =>
                item.id !== selectedHymnId && item.id !== savedHymnId,
            ),
          ]);
          markHymnSaved({
            ...state.hymn,
            id: savedHymnId,
            title,
            key: payload.key,
            isExclusive: savedMetadata.isExclusive,
            exclusiveOwnerUid: savedMetadata.exclusiveOwnerUid,
          });
          navigateHymn(savedHymnId, { replace: true });
          if (!(await runSaveFollowup(afterSave))) return true;
          showSaveSuccessNotification(showNotice);
          return true;
        }

        const createdAt = Timestamp.now();
        lastDirectHymnWriteAtRef.current = Date.now();
        const created = selectedHymnId
          ? { id: selectedHymnId }
          : await addDoc(collection(db, "hymns"), {
              ...payload,
              createdAt,
            });
        if (selectedHymnId) {
          await setDoc(
            doc(db, "hymns", selectedHymnId),
            { ...payload, createdAt },
            { merge: true },
          );
        }
        firestoreWriteCompleted = true;
        const savedCopy = {
          id: created.id,
          title,
          key: payload.key,
          sections: payload.sections,
          schemaVersion: payload.schemaVersion,
          ...writeMetadata,
          createdAt,
          updatedAt: Date.now(),
        };
        synchronizedHymnsRef.current = mergeHymnQueryResults(
          synchronizedHymnsRef.current.filter((item) => item.id !== created.id),
          [savedCopy],
        );
        await offlineAccountStore.update(authenticatedUser.uid, {
          hymns: synchronizedHymnsRef.current,
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
            isExclusive: writeMetadata.isExclusive,
            exclusiveOwnerUid: writeMetadata.exclusiveOwnerUid,
          },
          { ignoreDraft: true, mode: "edit" },
        );
        navigateHymn(created.id, { replace: true });
        if (!(await runSaveFollowup(afterSave))) return true;
        showSaveSuccessNotification(showNotice);
        return true;
      } catch (error) {
        if (!firestoreWriteCompleted) {
          lastDirectHymnWriteAtRef.current = 0;
        }
        if (
          !firestoreWriteCompleted &&
          (isBrowserOffline() ||
            ["unavailable", "deadline-exceeded", "network-request-failed"].includes(
              error?.code,
            ))
        ) {
          markDraftPendingSync(state.hymn.id);
          setPendingSyncRevision((revision) => revision + 1);
        }
        setSaveError(error?.message || "save failed");
        setSaveErrorCode(error?.code || "unknown");
        setSaveErrorWriteCompleted(firestoreWriteCompleted);
        const diagnostic = logSaveFailure(error, {
          authenticatedUser,
          teamData,
          teamFromCache,
          savePermissions,
          selectedHymnId,
          hymnId: state.hymn?.id,
          projectId: firebaseApp?.options?.projectId,
          writeOperation,
          payloadValidation: {
            titleIsString: typeof payload.title === "string",
            keyIsString: typeof payload.key === "string",
            sectionsIsArray: Array.isArray(payload.sections),
            updatedByMatchesAuth: payload.updatedBy === authenticatedUser.uid,
            exclusiveMetadataIsValid:
              typeof payload.isExclusive === "boolean" &&
              typeof payload.exclusiveOwnerUid === "string" &&
              (!payload.isExclusive || payload.exclusiveOwnerUid.length > 0),
          },
          isDirty,
          isOffline: isBrowserOffline(),
          firestoreWriteCompleted,
        });
        setSaveDiagnostic(diagnostic);
        const notification = resolveSaveErrorNotification(error, {
          isOffline: isBrowserOffline(),
          localDraftSaved,
          firestoreWriteCompleted,
        });
        showNotice(notification.message, notification.type);
        return false;
      } finally {
        saveInFlightRef.current = false;
        setSavingHymn(false);
      }
    },
    [
      loadHymn,
      markHymnSaved,
      navigateHymn,
      hymns,
      isDirty,
      logSaveFailure,
      runSaveFollowup,
      selectedHymnId,
      setHymns,
      showNotice,
      state.hymn,
      state.lastSavedHymn,
      saveErrorWriteCompleted,
      teamData,
      teamFromCache,
    ],
  );

  const finalizeSelectHymn = useCallback(
    async (hymnDoc, { fromRoute = false } = {}) => {
      const remoteDoc =
        hymnDoc?.id && db && hasFirebaseConfig && !isBrowserOffline()
          ? await fetchHymnDocFromServer(hymnDoc.id)
          : null;
      const sourceDoc = remoteDoc || hymnDoc;
      if (!sourceDoc) return false;

      const exclusiveOwnerUid = String(sourceDoc.exclusiveOwnerUid || "");
      const isExclusive =
        Boolean(sourceDoc.isExclusive) || exclusiveOwnerUid.length > 0;
      const canOpenExclusive =
        !isExclusive ||
        canReadExclusiveHymn(currentUser, exclusiveOwnerUid);
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
        { mode: isAdmin ? "edit" : "view" },
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

      const requestUid = String(currentUser?.uid || "guest");
      const requestIsBootstrapAdmin = isSuperAdmin;
      try {
        setLoadingHymns(true);
        setHymnsError(null);
        const nextHymns = await refreshHymnsListFromServer(
          requestUid === "guest" ? null : requestUid,
          requestIsBootstrapAdmin,
        );
        if (String(currentUserUidRef.current || "guest") !== requestUid) return;
        const authorizedServerHymns = filterAuthorizedHymns(
          nextHymns,
          currentUser,
          canReadExclusiveHymn,
        );
        synchronizedHymnsRef.current = authorizedServerHymns;
        if (hymnServerReadyUidRef.current !== requestUid) {
          hymnServerReadyUidRef.current = requestUid;
          setPendingSyncRevision((revision) => revision + 1);
        }
        const mergedHymns = mergeOfflineHymnResults({
          serverHymns: authorizedServerHymns,
          drafts: getAllDrafts(requestUid),
          serverIsAuthoritative: true,
        });
        setHymns(mergedHymns);
        await offlineAccountStore.update(requestUid, {
          hymns: authorizedServerHymns,
        });
        setHymnsFromCache(false);
        setPendingFirestoreWrites(false);

        if (selectedHymnId) {
          const remoteDoc = await fetchHymnDocFromServer(selectedHymnId);
          if (String(currentUserUidRef.current || "guest") !== requestUid) return;
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
              { mode: isAdmin ? "edit" : "view" },
            );
          }
        }

        if (force && isDirty) {
          clearDraft(state.hymn.id);
        }

        showNotice("تم تحديث البيانات من السيرفر بنجاح.", "success");
      } catch (error) {
        if (String(currentUserUidRef.current || "guest") !== requestUid) return;
        setHymnsError(error?.code || "read-failed");
        if (import.meta.env.DEV) {
          console.warn(
            "[refreshFromServer]",
            error?.code || error?.message || error,
          );
        }
        showNotice("تعذر تحميل الترانيم من الخادم.", "error");
      } finally {
        if (String(currentUserUidRef.current || "guest") === requestUid) {
          setLoadingHymns(false);
        }
      }
    },
    [
      currentUser,
      isAdmin,
      isDirty,
      isSuperAdmin,
      loadHymn,
      selectedHymnId,
      showNotice,
      state.hymn?.id,
    ],
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
        id: setlist?.id || doc(collection(db, "setlists")).id,
        ownerUid: setlist?.ownerUid || currentUser.uid,
        createdBy: setlist?.createdBy || currentUser.uid,
        updatedBy: currentUser.uid,
        updatedAt: new Date().toISOString(),
        createdAt: setlist?.createdAt || new Date().toISOString(),
      });
      const change = {
        id: normalized.id,
        setlist: normalized,
        token: `${Date.now()}-${Math.random()}`,
      };
      const account = await offlineAccountStore.update(
        currentUser.uid,
        (current) => ({
          pendingSetlistChanges: [
            ...current.pendingSetlistChanges.filter(
              (item) => item.id !== normalized.id,
            ),
            change,
          ],
        }),
      );
      pendingSetlistChangesRef.current = account.pendingSetlistChanges;
      setPendingSyncRevision((revision) => revision + 1);
      return { ...normalized, pendingSync: true };
    },
    [canManageSharedSetlists, currentUser],
  );

  const onSaveSharedSetlist = useCallback(
    async (setlist) => {
      if (!setlist) return null;
      const next = await persistSharedSetlist(setlist);
      if (!next) return null;

      setSharedSetlists((prev) =>
        mergeSharedSetlists({
          cachedSetlists: prev,
          pendingChanges: pendingSetlistChangesRef.current,
        }),
      );
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

      const userUid = String(currentUser?.uid || "");
      const change = {
        id: setlistId,
        deleted: true,
        token: `${Date.now()}-${Math.random()}`,
      };
      const account = await offlineAccountStore.update(userUid, (current) => ({
        pendingSetlistChanges: [
          ...current.pendingSetlistChanges.filter(
            (item) => item.id !== setlistId,
          ),
          change,
        ],
      }));
      pendingSetlistChangesRef.current = account.pendingSetlistChanges;
      setPendingSyncRevision((revision) => revision + 1);
      setSharedSetlists((prev) =>
        prev.filter((item) => item.id !== setlistId),
      );
      if (selectedSharedSetlistId === setlistId) {
        setSelectedSharedSetlistId("");
      }
      showNotice(
        isBrowserOffline()
          ? "حُذفت القائمة محليًا وستُزامن عند عودة الاتصال."
          : "تم حذف قائمة الخدمة المشتركة.",
        "success",
      );
    },
    [
      canManageSharedSetlists,
      currentUser?.uid,
      selectedSharedSetlistId,
      showNotice,
    ],
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
    const rawMembers = Array.isArray(payload) ? payload : payload.members || [];
    const ignoreEnvAdminList = Array.isArray(payload)
      ? false
      : Boolean(payload.ignoreEnvAdminList);
    const membersMap = Object.fromEntries(
      rawMembers
        .filter((member) => member && typeof member === "object")
        .map((member) => [String(member.uid || member.email || ""), member])
        .filter(([key]) => key),
    );
    try {
      setSavingTeam(true);
      const offline = isBrowserOffline();
      await setDoc(
        doc(db, SETTINGS_TEAM_DOC.collection, SETTINGS_TEAM_DOC.id),
        {
          members: membersMap,
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
        libraryLoading={loadingHymns}
        currentUser={currentUser}
        theme={state.theme}
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
          {import.meta.env.DEV && auth?.currentUser ? (
            <p className="sidebarHint" dir="ltr">
              Firebase Auth UID: <code>{auth.currentUser.uid}</code>
              <br />
              Firebase Auth email: <code>{auth.currentUser.email || "(none)"}</code>
            </p>
          ) : null}
          <AdminDashboard
            members={teamMembersForDashboard}
            ignoreEnvAdminList={Boolean(teamData?.ignoreEnvAdminList)}
            saving={savingTeam}
            onSave={onSaveTeamMembers}
            onBack={() => setShowAdminDashboard(false)}
          />
        </main>
        {notice ? (
          <div
            className={`toastNotice ${notice.type}`}
            role={notice.type === "error" ? "alert" : "status"}
            aria-live={notice.type === "error" ? "assertive" : "polite"}
          >
            {notice.message}
          </div>
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
        <div className="topBarIdentity">
          <p className="appBrand">Harmony Notes</p>
          <h1>{state.hymn.title || "ترنيمة بدون عنوان"}</h1>
        </div>

        <div className="headerActionGroup headerModeGroup" aria-label="وضع العمل">
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
        </div>

        <div className="topBarControls">
          <div className="headerSaveCluster">
            <div
              className={`saveStatus saveStatus--${saveState.status}`}
              role="status"
            >
              <span className="saveStatusDot" aria-hidden="true" />
              <span>
                {saveErrorWriteCompleted
                  ? "تم تأكيد كتابة الخادم؛ تعذّر إكمال التحديث المحلي"
                  : saveState.label}
              </span>
              {saveState.status === "error" && saveErrorCode ? (
                <span className="saveErrorCode" dir="ltr">
                  {saveErrorCode}
                </span>
              ) : null}
            </div>
            {showFirebaseSaveBtn ? (
              <button
                type="button"
                className="btn primary headerSaveButton"
                onClick={saveError ? onRetrySave : onSaveHymnToFirebase}
                disabled={
                  savingHymn ||
                  saveErrorWriteCompleted
                }
              >
                {savingHymn ? (
                  <span className="headerSaveSpinner" aria-hidden="true" />
                ) : saveState.status === "saved" ? (
                  <span aria-hidden="true">✓</span>
                ) : (
                  <svg
                    className="headerSaveIcon"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 3.75h12l3.25 3.25v13.25H3.75V3.75H5Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7.5 3.75v6h8v-6M7.5 20.25v-7h9v7"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                <span>
                  {savingHymn
                    ? "جارٍ الحفظ..."
                    : saveErrorWriteCompleted
                      ? "تمت الكتابة على الخادم"
                      : saveError
                        ? "إعادة المحاولة"
                        : isDirty
                          ? "حفظ التعديلات"
                          : "محفوظ"}
                </span>
              </button>
            ) : null}
          </div>
          {saveDiagnostic ? (
            <details className="saveDiagnosticDetails">
              <summary>تفاصيل آمنة للتشخيص</summary>
              <dl>
                <div>
                  <dt>رمز الخطأ</dt>
                  <dd dir="ltr">{saveDiagnostic.code}</dd>
                </div>
                <div>
                  <dt>مشروع Firebase</dt>
                  <dd dir="ltr">{saveDiagnostic.projectId || "غير معروف"}</dd>
                </div>
                <div>
                  <dt>UID المستخدم</dt>
                  <dd dir="ltr">{saveDiagnostic.userUid || "غير مسجل"}</dd>
                </div>
                <div>
                  <dt>نوع الكتابة</dt>
                  <dd>
                    {saveDiagnostic.writeOperation === "update"
                      ? "تحديث ترنيمة"
                      : "إنشاء ترنيمة"}
                  </dd>
                </div>
                <div>
                  <dt>صلاحية الحفظ المحلية</dt>
                  <dd>
                    {saveDiagnostic.savePermissions?.canSaveFirebase
                      ? "مسموحة"
                      : "غير مسموحة"}
                  </dd>
                </div>
                <div>
                  <dt>مشرف أساسي</dt>
                  <dd>{saveDiagnostic.savePermissions?.isSuperAdmin ? "نعم" : "لا"}</dd>
                </div>
                <div>
                  <dt>عضو الفريق / canSaveFirebase</dt>
                  <dd>
                    {saveDiagnostic.teamMemberFound ? "موجود" : "غير موجود"} /{" "}
                    {saveDiagnostic.teamCanSaveFirebase ? "مسموحة" : "غير مفعّلة"}
                  </dd>
                </div>
                <div>
                  <dt>بيانات الفريق من الذاكرة المؤقتة</dt>
                  <dd>{saveDiagnostic.teamSnapshotFromCache ? "نعم" : "لا"}</dd>
                </div>
                <div>
                  <dt>تأكيد الكتابة على السيرفر</dt>
                  <dd>
                    {saveDiagnostic.firestoreWriteCompleted ? "نعم" : "لا"}
                  </dd>
                </div>
                <div>
                  <dt>حقول الطلب المطلوبة</dt>
                  <dd>
                    {saveDiagnostic.payloadValidation
                      ? Object.values(saveDiagnostic.payloadValidation).every(Boolean)
                        ? "مكتملة"
                        : "يوجد حقل غير صالح"
                      : "غير متاحة"}
                  </dd>
                </div>
              </dl>
              <p>لا تشمل هذه التفاصيل كلمات مرور أو رموز دخول أو محتوى الترنيمة.</p>
            </details>
          ) : null}

          <details className="headerToolsMenu">
              <summary>أدوات وإجراءات</summary>
              <div className="headerToolsContent">
                <section className="headerToolsSection" aria-labelledby="header-output-label">
                  <h2 id="header-output-label">العرض والتصدير</h2>
                  <div className="headerToolsActions">
                    <button className="btn" onClick={onExport} disabled={loadingExport}>
                      {loadingExport ? "جاري التصدير..." : "تصدير PNG (HD)"}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setOutputModeOpen(true)}
                      aria-haspopup="dialog"
                    >
                      إعدادات العرض والإخراج
                    </button>
                    <button
                      className="btn"
                      onClick={onCopyHymnLink}
                      disabled={!selectedHymnId}
                    >
                      نسخ رابط الترنيمة
                    </button>
                  </div>
                </section>
                {isAdmin ? (
                  <section className="headerToolsSection" aria-labelledby="header-project-label">
                    <h2 id="header-project-label">ملف المشروع</h2>
                    <div className="headerToolsActions">
                      <button className="btn" onClick={onSaveProjectFile}>
                        حفظ ملف المشروع
                      </button>
                      <button className="btn" onClick={onOpenProjectClick}>
                        استيراد ملف المشروع
                      </button>
                    </div>
                  </section>
                ) : null}
                <section className="headerToolsSection" aria-labelledby="header-extra-label">
                  <h2 id="header-extra-label">إجراءات إضافية</h2>
                  <div className="headerToolsActions">
                    <button className="btn" onClick={onTriggerRefresh}>
                      تحديث / مزامنة المكتبة
                    </button>
                    <button type="button" className="btn" onClick={toggleTheme}>
                      {isDark ? "الوضع النهاري" : "الوضع الليلي"}
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        className="btn danger"
                        onClick={onResetProject}
                      >
                        ابدأ من الأول...
                      </button>
                    ) : null}
                  </div>
                </section>
                <section
                  className="headerToolsSection"
                  aria-labelledby="header-account-label"
                >
                  <h2 id="header-account-label">الحساب والإدارة</h2>
                  <div className="headerToolsActions">
                    {!authLoading && !currentUser ? (
                      <button className="btn" onClick={onAdminSignIn}>
                        دخول المشرف
                      </button>
                    ) : null}
                    {!authLoading && currentUser ? (
                      <button className="btn" onClick={onAdminSignOut}>
                        تسجيل الخروج
                      </button>
                    ) : null}
                    {canManageTeam ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setShowAdminDashboard(true)}
                      >
                        إدارة صلاحيات الفريق
                      </button>
                    ) : null}
                  </div>
                </section>
              </div>
          </details>

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
          {hasHymnSyncConflict ? (
            <p className="sidebarHint" role="alert">
              احتُفظ بمسودة محلية لأن نسخة الخادم تغيّرت. افتح الترنيمة وراجعها
              قبل الحفظ.
            </p>
          ) : null}
          {canRetryLocalSync && online ? (
            <button
              type="button"
              className="btn btnSmall"
              disabled={!livePerms.canSaveFirebase && !canManageSharedSetlists}
              onClick={() =>
                setPendingSyncRevision((revision) => revision + 1)
              }
            >
              إعادة المزامنة
            </button>
          ) : null}
          <p className={`roleBadge ${isAdmin ? "admin" : "viewer"}`}>
            {isSuperAdmin
              ? `أدمن رئيسي: ${currentUser?.email || currentUser?.uid || "مُسجل"}`
              : isAdmin && canSaveFirebase
                ? `أدمن: ${currentUser?.email || currentUser?.uid || "مُسجل"}`
                : isAdmin
                  ? `محرر الواجهة فقط (لا يملك حفظ الخادم): ${currentUser?.email || currentUser?.uid || "مُسجل"}`
              : currentUser
                ? "مستخدم مسجل (قراءة فقط)"
                : "وضع القراءة فقط"}
          </p>
          <section className="hymnLibrary" aria-label="مكتبة الترانيم">
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
            <details className="libraryGroup">
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
                disabled={authLoading || (loadingHymns && hymns.length === 0)}
                autoComplete="off"
                spellCheck={false}
                aria-label="البحث في العنوان والكلمات والمقام والكورد"
              />
              <div className="hymnSearchFilters" aria-label="مرشحات الترانيم">
                <select
                  className="input hymnKeyFilter"
                  value={hymnKeyFilter}
                  onChange={(event) => setHymnKeyFilter(event.target.value)}
                  disabled={authLoading || (loadingHymns && hymns.length === 0)}
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
              {!loadingHymns && !hymnsError && hymns.length > 0 ? (
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

          {showFirebaseDeleteBtn || (isSuperAdmin && showFirebaseSaveBtn) ? (
            <details className="sidebarGroup hymnAdminActions">
              <summary>إدارة الترنيمة</summary>
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
            </details>
          ) : null}
          {isAdmin ? (
            <div className="draftActions">
              {isDirty ? (
                <p className="draftBadge" role="status">
                  مسودة محلية — غير محفوظة على السيرفر
                </p>
              ) : null}
              <details className="sidebarGroup">
                <summary>إدارة المسودة المحلية</summary>
                <div className="row wrap sidebarActions">
                  <button
                    type="button"
                    className="btn"
                    onClick={onSaveDraftClick}
                  >
                    حفظ مسودة محلية
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
              </details>
            </div>
          ) : null}
          {!hasFirebaseConfig ? (
            <p className="sidebarHint">
              Firebase غير مهيأ. أضف متغيرات VITE_FIREBASE_* لعرض القائمة.
            </p>
          ) : null}

          {hasFirebaseConfig && hymnLoadState === "loading" ? (
            <p className="sidebarHint">جاري تحميل الترانيم...</p>
          ) : null}

          {hymnsError && hymns.length > 0 ? (
            <p className="sidebarHint" role="status">
              الخادم غير متاح حاليًا؛ تعرض المكتبة المحفوظة على هذا الجهاز.
            </p>
          ) : null}

          {hasFirebaseConfig && hymnLoadState === "error" ? (
            <div className="sidebarHint" role="alert">
              <p>
                تعذر تحميل الترانيم حاليًا. تحقق من الاتصال أو صلاحيات الوصول ثم
                حاول مرة أخرى.
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => setHymnListenerRetry((retry) => retry + 1)}
              >
                إعادة المحاولة
              </button>
            </div>
          ) : null}

          {hasFirebaseConfig && hymnLoadState === "empty" ? (
            <p className="sidebarHint">لا توجد ترانيم محفوظة حاليًا.</p>
          ) : null}

          {hasFirebaseConfig && hymnLoadState === "offline-empty" ? (
            <p className="sidebarHint" role="status">
              لا توجد ترانيم محفوظة على هذا الجهاز. اتصل بالإنترنت مرة واحدة
              لتحميل المكتبة.
            </p>
          ) : null}

          {hasFirebaseConfig &&
          hymnLoadState === "success" &&
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

          {hasFirebaseConfig &&
          hymnLoadState === "success" &&
          filteredHymns.length > 0 ? (
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

          <details className="sidebarGroup serviceListsGroup">
            <summary>قوائم الخدمة</summary>
            <SetlistPanel
              key={currentUser?.uid || "guest"}
              currentId={selectedHymnId}
              currentTitle={state.hymn.title}
              userUid={currentUser?.uid || "guest"}
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
          </details>
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
          <HymnView
            ref={viewRef}
            isExporting={isExporting}
            hideMusicianControls
          />
        </section>
      ) : null}

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
        <div
          className={`toastNotice ${notice.type}`}
          role={notice.type === "error" ? "alert" : "status"}
          aria-live={notice.type === "error" ? "assertive" : "polite"}
        >
          {notice.message}
        </div>
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
