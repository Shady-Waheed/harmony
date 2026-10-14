import { afterEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createOfflineAccountStore } from "./offlineAccountStore.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

describe("offline account store", () => {
  let store;

  afterEach(() => {
    store = null;
  });

  it("persists synchronized hymns and shared setlists across store instances", async () => {
    const indexedDB = new IDBFactory();
    const storage = createStorage();
    store = createOfflineAccountStore({
      getIndexedDB: () => indexedDB,
      getStorage: () => storage,
    });

    await store.update("user-a", {
      hymns: [{ id: "hymn-a", title: "Saved hymn" }],
      sharedSetlists: [{ id: "setlist-a", hymnIds: ["hymn-a"] }],
    });

    const reloadedStore = createOfflineAccountStore({
      getIndexedDB: () => indexedDB,
      getStorage: () => storage,
    });
    await expect(reloadedStore.read("user-a")).resolves.toMatchObject({
      hymns: [{ id: "hymn-a", title: "Saved hymn" }],
      sharedSetlists: [{ id: "setlist-a", hymnIds: ["hymn-a"] }],
    });
  });

  it("does not expose one account's cached library or setlists to another UID", async () => {
    store = createOfflineAccountStore({ getIndexedDB: () => new IDBFactory() });
    await store.update("user-a", {
      hymns: [{ id: "exclusive-a", exclusiveOwnerUid: "user-a" }],
      sharedSetlists: [{ id: "private-list-a", hymnIds: ["exclusive-a"] }],
    });

    await expect(store.read("user-b")).resolves.toMatchObject({
      uid: "user-b",
      hymns: [],
      sharedSetlists: [],
      pendingSetlistChanges: [],
    });
  });

  it("serializes concurrent queue updates without dropping either operation", async () => {
    store = createOfflineAccountStore({ getIndexedDB: () => new IDBFactory() });
    await Promise.all(
      ["change-a", "change-b"].map((id) =>
        store.update("user-a", (account) => ({
          pendingSetlistChanges: [
            ...account.pendingSetlistChanges,
            { id, token: id },
          ],
        })),
      ),
    );

    const account = await store.read("user-a");
    expect(account.pendingSetlistChanges.map((item) => item.id).sort()).toEqual([
      "change-a",
      "change-b",
    ]);
  });

  it("falls back to a UID-scoped localStorage record when IndexedDB is unavailable", async () => {
    const storage = createStorage();
    store = createOfflineAccountStore({
      getIndexedDB: () => null,
      getStorage: () => storage,
    });
    await store.update("user-a", {
      hymns: [{ id: "hymn-a" }],
    });

    await expect(store.read("user-a")).resolves.toMatchObject({
      hymns: [{ id: "hymn-a" }],
    });
    await expect(store.read("user-b")).resolves.toMatchObject({ hymns: [] });
  });
});