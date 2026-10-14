const DATABASE_NAME = "harmony-notes-offline-v1";
const DATABASE_VERSION = 1;
const ACCOUNT_STORE = "accounts";
const FALLBACK_PREFIX = "harmony-notes-offline-v1:";

function emptyAccount(uid) {
  return {
    uid,
    hymns: [],
    sharedSetlists: [],
    pendingSetlistChanges: [],
  };
}

function normalizeAccount(uid, value) {
  return {
    ...emptyAccount(uid),
    ...(value && typeof value === "object" ? value : {}),
    uid,
    hymns: Array.isArray(value?.hymns) ? value.hymns : [],
    sharedSetlists: Array.isArray(value?.sharedSetlists)
      ? value.sharedSetlists
      : [],
    pendingSetlistChanges: Array.isArray(value?.pendingSetlistChanges)
      ? value.pendingSetlistChanges
      : [],
  };
}

function serialize(value) {
  return JSON.stringify(value, (_key, item) =>
    typeof item?.toMillis === "function" ? item.toMillis() : item,
  );
}

export function createOfflineAccountStore({
  getIndexedDB = () => globalThis.indexedDB,
  getStorage = () => globalThis.localStorage,
} = {}) {
  let databasePromise;

  const openDatabase = () => {
    if (databasePromise) return databasePromise;
    const indexedDB = getIndexedDB();
    if (!indexedDB) return Promise.reject(new Error("IndexedDB unavailable"));

    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ACCOUNT_STORE)) {
          database.createObjectStore(ACCOUNT_STORE, { keyPath: "uid" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
    return databasePromise;
  };

  const readFallback = (uid) => {
    try {
      const storage = getStorage();
      const raw = storage?.getItem(`${FALLBACK_PREFIX}${uid}`);
      return raw ? normalizeAccount(uid, JSON.parse(raw)) : emptyAccount(uid);
    } catch {
      return emptyAccount(uid);
    }
  };

  const writeFallback = (uid, account) => {
    try {
      getStorage()?.setItem(`${FALLBACK_PREFIX}${uid}`, serialize(account));
    } catch {
      return;
    }
  };

  const readFromIndexedDB = async (uid) => {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(ACCOUNT_STORE, "readonly");
      const request = transaction.objectStore(ACCOUNT_STORE).get(uid);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  };

  const updateIndexedDB = async (uid, patchOrUpdater) => {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(ACCOUNT_STORE, "readwrite");
      const store = transaction.objectStore(ACCOUNT_STORE);
      const request = store.get(uid);
      let account;
      request.onsuccess = () => {
        const existing = normalizeAccount(uid, request.result);
        const patch =
          typeof patchOrUpdater === "function"
            ? patchOrUpdater(existing)
            : patchOrUpdater;
        account = normalizeAccount(uid, {
          ...existing,
          ...patch,
        });
        store.put(account);
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(account);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  };

  return {
    async read(uidValue) {
      const uid = String(uidValue || "");
      if (!uid) return emptyAccount("");

      try {
        const stored = await readFromIndexedDB(uid);
        if (stored) return normalizeAccount(uid, stored);
        const fallback = readFallback(uid);
        if (
          fallback.hymns.length ||
          fallback.sharedSetlists.length ||
          fallback.pendingSetlistChanges.length
        ) {
          await updateIndexedDB(uid, fallback);
          try {
            getStorage()?.removeItem(`${FALLBACK_PREFIX}${uid}`);
          } catch {
            return fallback;
          }
        }
        return fallback;
      } catch {
        return readFallback(uid);
      }
    },

    async update(uidValue, patchOrUpdater) {
      const uid = String(uidValue || "");
      if (!uid) return emptyAccount("");
      const normalizedPatch =
        typeof patchOrUpdater === "function" ||
        (patchOrUpdater && typeof patchOrUpdater === "object")
          ? patchOrUpdater
          : {};

      try {
        const account = await updateIndexedDB(uid, normalizedPatch);
        try {
          getStorage()?.removeItem(`${FALLBACK_PREFIX}${uid}`);
        } catch {
          return account;
        }
        return account;
      } catch {
        const existing = readFallback(uid);
        const patch =
          typeof normalizedPatch === "function"
            ? normalizedPatch(existing)
            : normalizedPatch;
        const account = normalizeAccount(uid, { ...existing, ...patch });
        writeFallback(uid, account);
        return account;
      }
    },
  };
}

export const offlineAccountStore = createOfflineAccountStore();