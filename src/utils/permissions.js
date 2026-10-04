/** مطابقة مستخدم Firebase مع القوائم البيئية + مستند الفريق في Firestore */

function parseList(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Google يعيد أحيانًا @googlemail.com بدل @gmail.com لنفس الحساب */
function normalizeGoogleEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e) return "";
  if (e.endsWith("@googlemail.com")) {
    return e.replace(/@googlemail\.com$/, "@gmail.com");
  }
  return e;
}

/** كل القيم الممكنة للمقارنة مع القوائم (email + مزودي الدخول) */
function userEmailKeys(user) {
  if (!user) return [];
  const raw = [
    user.email,
    ...(user.providerData || []).map((p) => p?.email),
  ].filter(Boolean);
  const keys = new Set();
  for (const item of raw) {
    const n = normalizeGoogleEmail(item);
    if (n) keys.add(n);
  }
  return [...keys];
}

function envEmailListMatchesUser(envRawList, user) {
  const allowed = parseList(envRawList).map((e) =>
    normalizeGoogleEmail(e.toLowerCase()),
  );
  if (!allowed.length) return false;
  const keys = userEmailKeys(user);
  return keys.some((k) => allowed.includes(k));
}

const BOOTSTRAP_ADMIN_UIDS = new Set(["ADMIN_UID_1", "ADMIN_UID_2"]);

function isBootstrapAdminUser(user) {
  return Boolean(user?.uid && BOOTSTRAP_ADMIN_UIDS.has(String(user.uid)));
}

export function coerceMembersMap(teamData = {}) {
  const rawMembers = teamData?.members;
  if (
    rawMembers &&
    typeof rawMembers === "object" &&
    !Array.isArray(rawMembers)
  ) {
    return Object.entries(rawMembers).reduce((map, [uid, row]) => {
      if (row && typeof row === "object" && uid) {
        map[String(uid)] = row;
      }
      return map;
    }, {});
  }
  return {};
}

function findMemberRow(user, teamData) {
  if (!user) return null;

  const uid = String(user.uid || "");
  const memberMap = coerceMembersMap(teamData);
  const row = uid ? memberMap[uid] : null;
  return row && typeof row === "object" ? row : null;
}

/**
 * مشرف رئيسي صريح (صلاحيات كاملة + تجاوز مستند الفريق). يعمل فقط لو عرّفت VITE_SUPER_ADMIN_*.
 */
export function isSuperAdminUser(user) {
  return isBootstrapAdminUser(user);
}

export function hasEnvSuperAdminConfig() {
  return (
    parseList(import.meta.env.VITE_SUPER_ADMIN_EMAILS).length > 0 ||
    parseList(import.meta.env.VITE_SUPER_ADMIN_UIDS).length > 0
  );
}

/**
 * من يقدر يفتح لوحة الصلاحيات ويحفظ settings/team:
 * — لو ignoreEnvAdminList: المشرف من env أو عضو عليه canManageDashboard
 * — غير ذلك: نفس السلوك السابق (سوبر من env أو كل أدمن البيئة لو السوبر فاضي)
 */
export function canAccessTeamDashboard(user, teamData = {}) {
  if (!user) return false;
  return (
    isBootstrapAdminUser(user) ||
    findMemberRow(user, teamData)?.canManageDashboard === true
  );
}

export function canManageSetlists(user, teamData = {}) {
  if (!user) return false;
  return (
    isBootstrapAdminUser(user) ||
    findMemberRow(user, teamData)?.canManageSetlists === true
  );
}

function isAdminUserEnv(user) {
  if (!user) return false;
  const allowedUids = parseList(import.meta.env.VITE_ADMIN_UIDS);
  const uid = String(user.uid || "");
  if (allowedUids.includes(uid)) return true;
  return envEmailListMatchesUser(import.meta.env.VITE_ADMIN_EMAILS, user);
}

/**
 * Rules-backed capabilities resolve from bootstrap UID or the UID-keyed team row.
 * Environment admin lists remain editor UI hints only.
 */
export function resolvePermissions(user, teamData) {
  if (!user) {
    return {
      isAdmin: false,
      canSaveFirebase: false,
      canDelete: false,
      canManageSetlists: false,
      isSuperAdmin: false,
    };
  }

  if (isSuperAdminUser(user)) {
    return {
      isAdmin: true,
      canSaveFirebase: true,
      canDelete: true,
      canManageSetlists: true,
      isSuperAdmin: true,
    };
  }

  const ignore = Boolean(teamData?.ignoreEnvAdminList);
  const row = findMemberRow(user, teamData);
  const envEditor = !ignore && isAdminUserEnv(user);

  return {
    isAdmin: row?.canEdit === true || envEditor,
    canSaveFirebase: row?.canSaveFirebase === true,
    canDelete: row?.canDeleteHymn === true,
    canManageSetlists: canManageSetlists(user, teamData),
    isSuperAdmin: false,
  };
}

export const SETTINGS_TEAM_DOC = { collection: "settings", id: "team" };

export function normalizeMemberRow(row) {
  const email = String(row?.email || "")
    .trim()
    .toLowerCase();
  return {
    uid: String(row?.uid || ""),
    email,
    displayName: String(row?.displayName || ""),
    canEdit: row?.canEdit === true,
    canSaveFirebase: row?.canSaveFirebase === true,
    canDeleteHymn: row?.canDeleteHymn === true,
    canManageDashboard: row?.canManageDashboard === true,
    canManageSetlists: row?.canManageSetlists === true,
  };
}
