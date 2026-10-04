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

export function isServerAuthorizedTeamManager({
  requestUser,
  teamData,
  adminEmails = [],
  adminUids = [],
}) {
  if (!requestUser || !requestUser.uid) {
    return false;
  }

  const uid = String(requestUser.uid);
  if (adminUids.some((allowed) => String(allowed) === uid)) {
    return true;
  }

  const candidateEmails = [
    requestUser.email,
    ...(requestUser.providerData || []).map((p) => p?.email),
  ]
    .map((part) => normalizeEmailForComparison(part))
    .filter(Boolean);

  const normalizedAdminEmails = adminEmails
    .map((email) => normalizeEmailForComparison(email))
    .filter(Boolean);

  if (candidateEmails.some((email) => normalizedAdminEmails.includes(email))) {
    return true;
  }

  if (
    teamData &&
    teamData.members &&
    typeof teamData.members === "object" &&
    !Array.isArray(teamData.members)
  ) {
    const memberRow = teamData.members[uid];
    if (memberRow && Boolean(memberRow.canManageDashboard)) {
      return true;
    }
  }

  return false;
}

export function createResolvedMemberPreview({
  teamEmail,
  authUsers,
  requestUser,
  teamData,
  adminEmails = [],
  adminUids = [],
}) {
  if (
    !isServerAuthorizedTeamManager({
      requestUser,
      teamData,
      adminEmails,
      adminUids,
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
    canEdit: Boolean(permissions?.canEdit),
    canSaveFirebase: Boolean(permissions?.canSaveFirebase),
    canDeleteHymn: Boolean(permissions?.canDeleteHymn),
    canManageDashboard: Boolean(permissions?.canManageDashboard),
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
