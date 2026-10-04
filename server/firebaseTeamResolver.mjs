export function normalizeEmailForComparison(email) {
  const value = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!value) {
    return "";
  }

  if (value.endsWith("@googlemail.com")) {
    return value.replace(/@googlemail\.com$/, "@gmail.com");
  }

  return value;
}

export function buildAuthUserSummary(user) {
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  const normalizedEmail = normalizeEmailForComparison(email);

  return {
    uid: user?.uid ?? "",
    email,
    normalizedEmail,
    emailVerified: Boolean(user?.emailVerified),
    disabled: Boolean(user?.disabled),
    displayName: user?.displayName ?? "",
    providerIds: Array.isArray(user?.providerIds) ? [...user.providerIds] : [],
  };
}

export function resolveAuthUserByEmail(teamEmail, authUsers) {
  const normalizedTeamEmail = normalizeEmailForComparison(teamEmail);

  if (!normalizedTeamEmail) {
    return {
      status: "UNMATCHED",
      normalizedTeamEmail: "",
      candidates: [],
      reason: "EMPTY_TEAM_EMAIL",
    };
  }

  const candidates = (Array.isArray(authUsers) ? authUsers : [])
    .map((user) => buildAuthUserSummary(user))
    .filter(
      (user) => user.email && user.normalizedEmail === normalizedTeamEmail,
    );

  if (candidates.length === 0) {
    return {
      status: "UNMATCHED",
      normalizedTeamEmail: normalizedTeamEmail,
      candidates: [],
      reason: "NO_MATCH",
    };
  }

  if (candidates.length > 1) {
    return {
      status: "AMBIGUOUS",
      normalizedTeamEmail: normalizedTeamEmail,
      candidates: candidates.map((user) => ({
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        disabled: user.disabled,
        displayName: user.displayName,
        providerIds: [...user.providerIds],
      })),
      reason: "MULTIPLE_USERS",
    };
  }

  const user = candidates[0];
  return {
    status: "MATCHED",
    normalizedTeamEmail: normalizedTeamEmail,
    authUser: {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      disabled: user.disabled,
      displayName: user.displayName,
      providerIds: [...user.providerIds],
    },
    reason: "UNIQUE_MATCH",
  };
}

export function parseBootstrapAdminUids(rawValue) {
  return [
    ...new Set(
      String(rawValue ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function isServerAuthorizedTeamManager({
  requestUser,
  teamData,
  bootstrapAdminUids = [],
}) {
  const uid = requestUser?.uid;
  if (typeof uid !== "string" || uid.trim().length === 0) {
    return false;
  }

  const configuredUids = Array.isArray(bootstrapAdminUids)
    ? bootstrapAdminUids
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    : [];
  if (configuredUids.includes(uid)) {
    return true;
  }

  const members = teamData?.members;
  if (!members || typeof members !== "object" || Array.isArray(members)) {
    return false;
  }

  const memberRow = members[uid];
  return Boolean(
    memberRow &&
    typeof memberRow === "object" &&
    !Array.isArray(memberRow) &&
    memberRow.canManageDashboard === true,
  );
}

export function createResolvedMemberPreview({
  teamEmail,
  authUsers,
  requestUser,
  teamData,
  bootstrapAdminUids = [],
}) {
  if (
    !isServerAuthorizedTeamManager({
      requestUser,
      teamData,
      bootstrapAdminUids,
    })
  ) {
    return {
      authorized: false,
      status: "UNAUTHORIZED",
      reason: "UNAUTHORIZED_TEAM_MANAGER",
    };
  }

  const result = resolveAuthUserByEmail(teamEmail, authUsers);
  return {
    authorized: true,
    ...result,
  };
}

export function buildUidBackedMemberEntry({
  email,
  uid,
  permissions,
  displayName = "",
}) {
  const next = {
    email: typeof email === "string" ? email.trim() : "",
    uid: uid || "",
    displayName: displayName || "",
    canEdit: permissions?.canEdit === true,
    canSaveFirebase: permissions?.canSaveFirebase === true,
    canDeleteHymn: permissions?.canDeleteHymn === true,
    canManageDashboard: permissions?.canManageDashboard === true,
    canManageSetlists: permissions?.canManageSetlists === true,
  };

  return next;
}

export function buildUidBackedTeamDocument(
  existingMembers = [],
  nextMemberValue = {},
) {
  const memberMap = {};

  for (const member of Array.isArray(existingMembers) ? existingMembers : []) {
    if (member && member.uid) {
      memberMap[member.uid] = { ...member };
    }
  }

  if (nextMemberValue && nextMemberValue.uid) {
    memberMap[nextMemberValue.uid] = {
      ...memberMap[nextMemberValue.uid],
      ...nextMemberValue,
    };
  }

  return {
    members: memberMap,
    ignoreEnvAdminList: false,
    updatedAt: new Date().toISOString(),
  };
}
