import { normalizeMemberRow as normalizeRow } from "./permissions.js";

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

export function buildMemberLookupRequest({ email }) {
  const sanitized = String(email ?? "").trim();
  return {
    email: sanitized,
  };
}

export function resolveMemberKey(member) {
  const email = normalizeEmailForComparison(member?.email ?? "");
  const uid = String(member?.uid ?? "");
  return `${uid}|${email}`;
}

export function isDuplicateMember(existingMembers, candidate) {
  const rows = Array.isArray(existingMembers) ? existingMembers : [];
  const candidateEmail = normalizeEmailForComparison(candidate?.email ?? "");
  const candidateUid = String(candidate?.uid ?? "");

  if (!candidateEmail && !candidateUid) {
    return false;
  }

  return rows.some((member) => {
    const memberUid = String(member?.uid ?? "");
    const memberEmail = normalizeEmailForComparison(member?.email ?? "");
    if (candidateUid && memberUid && candidateUid === memberUid) {
      return true;
    }
    if (candidateEmail && memberEmail && candidateEmail === memberEmail) {
      return true;
    }
    return false;
  });
}

export const normalizeMemberRow = normalizeRow;
