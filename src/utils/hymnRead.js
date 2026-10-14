export function getHymnReadPlan(userUid, isBootstrapAdmin = false) {
  if (isBootstrapAdmin) {
    return [
      {
        source: "all",
        filters: [],
        orderBy: { field: "createdAt", direction: "desc" },
      },
    ];
  }

  const plan = [
    {
      source: "public",
      filters: [{ field: "isExclusive", operator: "==", value: false }],
      orderBy: { field: "createdAt", direction: "desc" },
    },
  ];

  if (userUid) {
    plan.push({
      source: "ownedExclusive",
      filters: [
        { field: "isExclusive", operator: "==", value: true },
        { field: "exclusiveOwnerUid", operator: "==", value: String(userUid) },
      ],
      orderBy: { field: "createdAt", direction: "desc" },
    });
  }

  return plan;
}

function createdAtMillis(value) {
  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return 0;
}

export function mergeHymnQueryResults(...hymnGroups) {
  const byId = new Map();
  for (const hymns of hymnGroups) {
    for (const hymn of hymns || []) {
      if (hymn?.id) byId.set(String(hymn.id), hymn);
    }
  }

  return [...byId.values()].sort((left, right) => {
    const timeDifference =
      createdAtMillis(right.createdAt) - createdAtMillis(left.createdAt);
    if (timeDifference !== 0) return timeDifference;
    return String(left.id).localeCompare(String(right.id));
  });
}

export function mergeOfflineHymnResults({
  cachedHymns = [],
  serverHymns = [],
  drafts = [],
  serverIsAuthoritative = false,
} = {}) {
  const base = new Map();
  const sourceGroups = serverIsAuthoritative
    ? [serverHymns]
    : [cachedHymns, serverHymns];

  for (const group of sourceGroups) {
    for (const hymn of group || []) {
      if (!hymn?.id) continue;
      const id = String(hymn.id);
      base.set(id, { ...base.get(id), ...hymn, id });
    }
  }

  for (const draftEntry of drafts || []) {
    const draft = draftEntry?.hymn || draftEntry;
    if (!draft?.id) continue;
    const id = String(draft.id);
    base.set(id, { ...base.get(id), ...draft, id });
  }

  return [...base.values()].sort((left, right) => {
    const timeDifference =
      createdAtMillis(right.createdAt) - createdAtMillis(left.createdAt);
    if (timeDifference !== 0) return timeDifference;
    return String(left.id).localeCompare(String(right.id));
  });
}

export function filterAuthorizedHymns(hymns, user, canReadExclusiveHymn) {
  return (hymns || []).filter((hymn) => {
    const exclusiveOwnerUid = String(hymn?.exclusiveOwnerUid || "");
    const isExclusive = Boolean(hymn?.isExclusive) || Boolean(exclusiveOwnerUid);
    return !isExclusive || canReadExclusiveHymn(user, exclusiveOwnerUid);
  });
}

export function getHymnLoadState({ loading, error, hymns, offline = false }) {
  if (hymns.length > 0) return "success";
  if (loading) return "loading";
  if (offline) return "offline-empty";
  if (error) return "error";
  return "empty";
}
