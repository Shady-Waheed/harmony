import { describe, expect, it } from "vitest";
import {
  getHymnLoadState,
  getHymnReadPlan,
  mergeHymnQueryResults,
} from "./hymnRead.js";

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
  it("deduplicates by document ID and keeps the owner-query result on collision", () => {
    const merged = mergeHymnQueryResults(
      [{ id: "same", title: "public copy", createdAt: timestamp(1) }],
      [{ id: "same", title: "owner copy", createdAt: timestamp(2) }],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "same", title: "owner copy" });
    expect(merged[0].createdAt.toMillis()).toBe(2);
  });

  it("sorts merged public and owner hymns by createdAt descending", () => {
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
});
