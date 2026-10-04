import { readFileSync } from "node:fs";

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

export function parseTeamEmailLines(rawContent) {
  return String(rawContent ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

export function readTeamEmailsFromFile(filePath) {
  const rawText = readFileSync(filePath, "utf8");
  return parseTeamEmailLines(rawText);
}

export function buildAuthUserSnapshot(user) {
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  const normalizedEmail = normalizeEmailForComparison(email);

  return {
    uid: user?.uid ?? "",
    email,
    originalEmail: email,
    normalizedEmail,
    emailVerified: Boolean(user?.emailVerified),
    disabled: Boolean(user?.disabled),
    displayName: user?.displayName ?? "",
    providerIds: Array.isArray(user?.providerIds) ? [...user.providerIds] : [],
  };
}

export function reconcileTeamMembership(teamEmails, authUsers) {
  const uniqueTeamEmails = [];
  const seenTeamEmails = new Set();

  for (const item of Array.isArray(teamEmails) ? teamEmails : []) {
    const originalEmail = String(item ?? "").trim();
    const normalizedEmail = normalizeEmailForComparison(originalEmail);

    if (!originalEmail || !normalizedEmail) {
      continue;
    }

    if (!seenTeamEmails.has(normalizedEmail)) {
      seenTeamEmails.add(normalizedEmail);
      uniqueTeamEmails.push({
        teamEmail: originalEmail,
        normalizedEmail,
      });
    }
  }

  const authUserSnapshots = Array.isArray(authUsers)
    ? authUsers.map((user) => buildAuthUserSnapshot(user))
    : [];

  const usersByNormalizedEmail = new Map();

  for (const snapshot of authUserSnapshots) {
    if (!snapshot.email) {
      continue;
    }

    const key = normalizeEmailForComparison(snapshot.email);
    if (!key) {
      continue;
    }

    if (!usersByNormalizedEmail.has(key)) {
      usersByNormalizedEmail.set(key, []);
    }

    usersByNormalizedEmail.get(key).push(snapshot);
  }

  const matched = [];
  const unmatchedTeamEmails = [];
  const ambiguous = [];
  const authUsersNotInTeam = [];
  const authUsersWithoutEmail = [];

  for (const teamEntry of uniqueTeamEmails) {
    const matches = usersByNormalizedEmail.get(teamEntry.normalizedEmail) ?? [];

    if (matches.length === 1) {
      const user = matches[0];
      matched.push({
        teamEmail: teamEntry.teamEmail,
        authEmail: user.email,
        originalEmail: user.originalEmail,
        normalizedEmail: user.normalizedEmail,
        uid: user.uid,
        emailVerified: user.emailVerified,
        disabled: user.disabled,
        displayName: user.displayName,
        providerIds: [...user.providerIds],
      });
      continue;
    }

    if (matches.length > 1) {
      ambiguous.push({
        teamEmail: teamEntry.teamEmail,
        normalizedEmail: teamEntry.normalizedEmail,
        candidates: matches.map((user) => ({
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          disabled: user.disabled,
          providerIds: [...user.providerIds],
        })),
      });
      continue;
    }

    unmatchedTeamEmails.push(teamEntry.teamEmail);
  }

  const teamNormalizedSet = new Set(
    uniqueTeamEmails.map((entry) => entry.normalizedEmail),
  );

  for (const snapshot of authUserSnapshots) {
    if (!snapshot.email) {
      authUsersWithoutEmail.push({
        uid: snapshot.uid,
        displayName: snapshot.displayName,
      });
      continue;
    }

    if (!teamNormalizedSet.has(snapshot.normalizedEmail)) {
      authUsersNotInTeam.push({
        uid: snapshot.uid,
        email: snapshot.email,
        originalEmail: snapshot.originalEmail,
        normalizedEmail: snapshot.normalizedEmail,
        emailVerified: snapshot.emailVerified,
        disabled: snapshot.disabled,
        displayName: snapshot.displayName,
        providerIds: [...snapshot.providerIds],
      });
    }
  }

  return {
    matched,
    unmatchedTeamEmails,
    ambiguous,
    authUsersNotInTeam,
    authUsersWithoutEmail,
  };
}

export function resolveExitCode(report) {
  const unmatchedCount = Number(report?.unmatchedTeamEmails?.length ?? 0);
  const ambiguousCount = Number(report?.ambiguous?.length ?? 0);

  if (unmatchedCount > 0 || ambiguousCount > 0) {
    return 2;
  }

  return 0;
}

export function formatAuditReport(report) {
  const matched = Array.isArray(report?.matched) ? report.matched : [];
  const unmatched = Array.isArray(report?.unmatchedTeamEmails)
    ? report.unmatchedTeamEmails
    : [];
  const ambiguous = Array.isArray(report?.ambiguous) ? report.ambiguous : [];
  const authNotInTeam = Array.isArray(report?.authUsersNotInTeam)
    ? report.authUsersNotInTeam
    : [];
  const usersWithoutEmail = Array.isArray(report?.authUsersWithoutEmail)
    ? report.authUsersWithoutEmail
    : [];

  const lines = [
    "Harmony Notes — Firebase UID Audit",
    "==================================",
    "",
    `Auth users scanned: ${report?.summary?.authUsersScanned ?? 0}`,
    "",
    "MATCHED",
    "-------",
  ];

  if (matched.length === 0) {
    lines.push("(none)");
  } else {
    for (const item of matched) {
      lines.push(`Team email: ${item.teamEmail}`);
      lines.push(`Auth email: ${item.authEmail}`);
      lines.push(`UID: ${item.uid}`);
      lines.push(`Verified: ${item.emailVerified ? "yes" : "no"}`);
      lines.push(`Disabled: ${item.disabled ? "yes" : "no"}`);
      lines.push(
        `Providers: ${item.providerIds.length ? item.providerIds.join(", ") : "none"}`,
      );
      lines.push("");
    }
  }

  lines.push("UNMATCHED TEAM EMAILS");
  lines.push("---------------------");
  if (unmatched.length === 0) {
    lines.push("(none)");
  } else {
    for (const email of unmatched) {
      lines.push(email);
    }
  }

  lines.push("");
  lines.push("DUPLICATE / AMBIGUOUS");
  lines.push("---------------------");
  if (ambiguous.length === 0) {
    lines.push("(none)");
  } else {
    for (const item of ambiguous) {
      lines.push(item.teamEmail);
      lines.push("Candidates:");
      for (const candidate of item.candidates) {
        lines.push(`- ${candidate.uid}`);
      }
      lines.push("");
    }
  }

  lines.push("AUTH USERS NOT IN TEAM");
  lines.push("----------------------");
  if (authNotInTeam.length === 0) {
    lines.push("(none)");
  } else {
    for (const item of authNotInTeam) {
      lines.push(item.email || "(no email)");
      lines.push(`UID: ${item.uid}`);
      lines.push("");
    }
  }

  lines.push("AUTH USERS WITHOUT EMAIL");
  lines.push("------------------------");
  lines.push(String(usersWithoutEmail.length));
  lines.push("");
  lines.push("SUMMARY");
  lines.push("-------");
  lines.push(`Matched: ${report?.summary?.matched ?? matched.length}`);
  lines.push(`Unmatched: ${report?.summary?.unmatched ?? unmatched.length}`);
  lines.push(`Ambiguous: ${report?.summary?.ambiguous ?? ambiguous.length}`);
  lines.push(
    `Auth users not in team: ${report?.summary?.authUsersNotInTeam ?? authNotInTeam.length}`,
  );
  lines.push(
    `Users without email: ${report?.summary?.usersWithoutEmail ?? usersWithoutEmail.length}`,
  );

  return lines.join("\n");
}

export function createSummary(report) {
  const matched = Array.isArray(report?.matched) ? report.matched : [];
  const unmatchedTeamEmails = Array.isArray(report?.unmatchedTeamEmails)
    ? report.unmatchedTeamEmails
    : [];
  const ambiguous = Array.isArray(report?.ambiguous) ? report.ambiguous : [];
  const authUsersNotInTeam = Array.isArray(report?.authUsersNotInTeam)
    ? report.authUsersNotInTeam
    : [];
  const authUsersWithoutEmail = Array.isArray(report?.authUsersWithoutEmail)
    ? report.authUsersWithoutEmail
    : [];

  return {
    authUsersScanned: Number(report?.summary?.authUsersScanned ?? 0),
    matched: matched.length,
    unmatched: unmatchedTeamEmails.length,
    ambiguous: ambiguous.length,
    authUsersNotInTeam: authUsersNotInTeam.length,
    usersWithoutEmail: authUsersWithoutEmail.length,
  };
}
