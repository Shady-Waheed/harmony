import { describe, expect, it } from "vitest";
import {
  filterAuthorizedHymns,
  getHymnLoadState,
  getHymnReadPlan,
  mergeOfflineHymnResults,
  mergeHymnQueryResults,
} from "./hymnRead.js";
import { canReadExclusiveHymn } from "./permissions.js";

const timestamp = (milliseconds) => ({ toMillis: () => milliseconds });

describe("hymn read query plan", () => {
  it("loads only public hymns for anonymous users", () => {
    expect(getHymnReadPlan(null)).toEqual([
      {
        source: "public",
        filters: [{ field: "isExclusive", operator: "==", value: false }],
        orderBy: { field: "createdAt", direction: "desc" },
      },
    ]);
  });

  it("adds an owner-scoped exclusive query only for authenticated users", () => {
    const plan = getHymnReadPlan("user-A");
    expect(plan).toHaveLength(2);
    expect(plan[0].source).toBe("public");
    expect(plan[1]).toMatchObject({
      source: "ownedExclusive",
      filters: [
        { field: "isExclusive", operator: "==", value: true },
        { field: "exclusiveOwnerUid", operator: "==", value: "user-A" },
      ],
      orderBy: { field: "createdAt", direction: "desc" },
    });
    expect(getHymnReadPlan("user-B")[1].filters[1].value).toBe("user-B");
  });

  it("uses an unfiltered collection query for bootstrap Admins", () => {
    expect(getHymnReadPlan("ADMIN_UID_1", true)).toEqual([
      {
        source: "all",
        filters: [],
        orderBy: { field: "createdAt", direction: "desc" },
      },
    ]);
  });

  it("starts the owner query after an anonymous-to-authenticated transition", () => {
    const anonymousPlan = getHymnReadPlan(null);
    const authenticatedPlan = getHymnReadPlan("user-A");

    expect(anonymousPlan).toHaveLength(1);
    expect(authenticatedPlan.map((entry) => entry.source)).toEqual([
      "public",
      "ownedExclusive",
    ]);
    expect(authenticatedPlan[1].filters[1].value).toBe("user-A");
  });
});

describe("hymn read result merge", () => {
  it("deduplicates by document ID and keeps the later query result on collision", () => {
    const merged = mergeHymnQueryResults(
      [{ id: "same", title: "public copy", createdAt: timestamp(1) }],
      [{ id: "same", title: "owner copy", createdAt: timestamp(2) }],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "same", title: "owner copy" });
    expect(merged[0].createdAt.toMillis()).toBe(2);
  });

  it("sorts hymns from all queries by createdAt descending", () => {
    const merged = mergeHymnQueryResults(
      [
        { id: "public-old", createdAt: timestamp(100) },
        { id: "public-new", createdAt: timestamp(300) },
      ],
      [{ id: "owned-middle", createdAt: timestamp(200) }],
    );

    expect(merged.map((hymn) => hymn.id)).toEqual([
      "public-new",
      "owned-middle",
      "public-old",
    ]);
  });

  it("renders the cached library before an online server refresh", () => {
    const cached = [{ id: "hymn-1", title: "Saved copy" }];
    const immediate = mergeOfflineHymnResults({ cachedHymns: cached });
    const refreshed = mergeOfflineHymnResults({
      cachedHymns: cached,
      serverHymns: [{ id: "hymn-1", title: "Server copy" }],
      serverIsAuthoritative: true,
    });

    expect(immediate).toEqual(cached);
    expect(refreshed).toEqual([{ id: "hymn-1", title: "Server copy" }]);
  });

  it("does not clear a valid cache after a failed or non-authoritative read", () => {
    expect(
      mergeOfflineHymnResults({
        cachedHymns: [{ id: "cached", title: "Saved" }],
        serverHymns: [],
      }),
    ).toMatchObject([{ id: "cached", title: "Saved" }]);
  });

  it("keeps dirty drafts when an authoritative server response is empty", () => {
    expect(
      mergeOfflineHymnResults({
        cachedHymns: [{ id: "removed", title: "Old server copy" }],
        serverHymns: [],
        drafts: [{ hymn: { id: "removed", title: "Unsynced edit" } }],
        serverIsAuthoritative: true,
      }),
    ).toMatchObject([{ id: "removed", title: "Unsynced edit" }]);
  });

  it("lets a dirty local draft override an older server snapshot without duplicating IDs", () => {
    const merged = mergeOfflineHymnResults({
      cachedHymns: [{ id: "same", title: "Cached" }],
      serverHymns: [
        { id: "same", title: "Older server" },
        { id: "same", title: "Duplicate server" },
      ],
      drafts: [{ hymn: { id: "same", title: "Local unsynced edit" } }],
      serverIsAuthoritative: true,
    });

    expect(merged).toEqual([{ id: "same", title: "Local unsynced edit" }]);
  });

  it("caches Exclusive hymns only for an owner or bootstrap Admin", () => {
    const hymns = [
      { id: "public", isExclusive: false, exclusiveOwnerUid: "" },
      {
        id: "private",
        isExclusive: true,
        exclusiveOwnerUid: "owner-uid",
      },
    ];

    expect(
      filterAuthorizedHymns(hymns, { uid: "other-uid" }, canReadExclusiveHymn),
    ).toMatchObject([{ id: "public" }]);
    expect(
      filterAuthorizedHymns(hymns, { uid: "owner-uid" }, canReadExclusiveHymn),
    ).toHaveLength(2);
    expect(
      filterAuthorizedHymns(
        hymns,
        { uid: "15dQtzmhFmTep92fBEg7jfkJ62I2" },
        canReadExclusiveHymn,
      ),
    ).toHaveLength(2);
  });
});

describe("hymn loading UI state", () => {
  it("shows the empty state only after a successful empty response", () => {
    expect(getHymnLoadState({ loading: false, error: null, hymns: [] })).toBe(
      "empty",
    );
  });

  it("keeps permission and network failures separate from an empty result", () => {
    expect(
      getHymnLoadState({
        loading: false,
        error: "permission-denied",
        hymns: [],
      }),
    ).toBe("error");
  });

  it("prioritizes loading while auth-dependent queries are pending", () => {
    expect(getHymnLoadState({ loading: true, error: null, hymns: [] })).toBe(
      "loading",
    );
  });

  it("shows an offline-empty state instead of claiming the online library is empty", () => {
    expect(
      getHymnLoadState({
        loading: false,
        error: "unavailable",
        hymns: [],
        offline: true,
      }),
    ).toBe("offline-empty");
  });

  it("renders cached hymns even while the server refresh reports an error", () => {
    expect(
      getHymnLoadState({
        loading: true,
        error: "unavailable",
        hymns: [{ id: "cached" }],
      }),
    ).toBe("success");
  });
});
