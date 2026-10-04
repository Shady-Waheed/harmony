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

export function getHymnLoadState({ loading, error, hymns }) {
  if (loading) return "loading";
  if (error) return "error";
  return hymns.length === 0 ? "empty" : "success";
}
