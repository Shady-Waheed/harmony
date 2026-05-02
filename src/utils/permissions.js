/** مطابقة مستخدم Firebase مع القوائم البيئية + مستند الفريق في Firestore */

function parseList(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/** Google يعيد أحيانًا @googlemail.com بدل @gmail.com لنفس الحساب */
function normalizeGoogleEmail(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return ''
  if (e.endsWith('@googlemail.com')) {
    return e.replace(/@googlemail\.com$/, '@gmail.com')
  }
  return e
}

/** كل القيم الممكنة للمقارنة مع القوائم (email + مزودي الدخول) */
function userEmailKeys(user) {
  if (!user) return []
  const raw = [user.email, ...(user.providerData || []).map((p) => p?.email)].filter(Boolean)
  const keys = new Set()
  for (const item of raw) {
    const n = normalizeGoogleEmail(item)
    if (n) keys.add(n)
  }
  return [...keys]
}

function envEmailListMatchesUser(envRawList, user) {
  const allowed = parseList(envRawList).map((e) => normalizeGoogleEmail(e.toLowerCase()))
  if (!allowed.length) return false
  const keys = userEmailKeys(user)
  return keys.some((k) => allowed.includes(k))
}

function findMemberRow(user, teamData) {
  const keys = userEmailKeys(user)
  const members = teamData?.members
  if (!Array.isArray(members) || !keys.length) return null
  return members.find((m) => keys.includes(normalizeGoogleEmail(String(m.email || '').toLowerCase()))) || null
}

/**
 * مشرف رئيسي صريح (صلاحيات كاملة + تجاوز مستند الفريق). يعمل فقط لو عرّفت VITE_SUPER_ADMIN_*.
 */
export function isSuperAdminUser(user) {
  if (!user) return false
  const emails = parseList(import.meta.env.VITE_SUPER_ADMIN_EMAILS).map((e) => normalizeGoogleEmail(e.toLowerCase()))
  const uids = parseList(import.meta.env.VITE_SUPER_ADMIN_UIDS)
  if (emails.length === 0 && uids.length === 0) {
    return false
  }
  const uid = String(user.uid || '')
  return userEmailKeys(user).some((k) => emails.includes(k)) || uids.includes(uid)
}

export function hasEnvSuperAdminConfig() {
  return parseList(import.meta.env.VITE_SUPER_ADMIN_EMAILS).length > 0 || parseList(import.meta.env.VITE_SUPER_ADMIN_UIDS).length > 0
}

/**
 * من يقدر يفتح لوحة الصلاحيات ويحفظ settings/team:
 * — لو ignoreEnvAdminList: المشرف من env أو عضو عليه canManageDashboard
 * — غير ذلك: نفس السلوك السابق (سوبر من env أو كل أدمن البيئة لو السوبر فاضي)
 */
export function canAccessTeamDashboard(user, teamData = {}) {
  if (!user) return false

  if (teamData.ignoreEnvAdminList) {
    if (isSuperAdminUser(user)) return true
    const row = findMemberRow(user, teamData)
    return Boolean(row?.canManageDashboard)
  }

  const emails = parseList(import.meta.env.VITE_SUPER_ADMIN_EMAILS).map((e) => normalizeGoogleEmail(e.toLowerCase()))
  const uids = parseList(import.meta.env.VITE_SUPER_ADMIN_UIDS)
  if (emails.length === 0 && uids.length === 0) {
    return isAdminUserEnv(user)
  }
  const uid = String(user.uid || '')
  return userEmailKeys(user).some((k) => emails.includes(k)) || uids.includes(uid)
}

function isAdminUserEnv(user) {
  if (!user) return false
  const allowedUids = parseList(import.meta.env.VITE_ADMIN_UIDS)
  const uid = String(user.uid || '')
  if (allowedUids.includes(uid)) return true
  return envEmailListMatchesUser(import.meta.env.VITE_ADMIN_EMAILS, user)
}

function canDeleteHymnsEnv(user) {
  if (!user) return false
  const allowedUids = parseList(import.meta.env.VITE_DELETE_UIDS)
  const uid = String(user.uid || '')

  if (!parseList(import.meta.env.VITE_DELETE_EMAILS).length && allowedUids.length === 0) {
    return isAdminUserEnv(user)
  }

  if (allowedUids.includes(uid)) return true
  return envEmailListMatchesUser(import.meta.env.VITE_DELETE_EMAILS, user)
}

function canSaveHymnsToFirebaseEnv(user) {
  if (!user) return false
  const allowedUids = parseList(import.meta.env.VITE_SAVE_UIDS)
  const uid = String(user.uid || '')

  if (!parseList(import.meta.env.VITE_SAVE_EMAILS).length && allowedUids.length === 0) {
    return isAdminUserEnv(user)
  }

  if (allowedUids.includes(uid)) return true
  return envEmailListMatchesUser(import.meta.env.VITE_SAVE_EMAILS, user)
}

function envFallbackPermissions(user) {
  return {
    isAdmin: isAdminUserEnv(user),
    canSaveFirebase: canSaveHymnsToFirebaseEnv(user),
    canDelete: canDeleteHymnsEnv(user),
  }
}

/**
 * دمج: المشرف الرئيسي من env دائمًا كل الصلاحيات؛
 * لو ignoreEnvAdminList: الصلاحيات من صف members فقط (غير المذكور = قارئ)؛
 * غير ذلك: صف members يدمج مع env كما سبق.
 */
export function resolvePermissions(user, teamData) {
  if (!user) {
    return { isAdmin: false, canSaveFirebase: false, canDelete: false, isSuperAdmin: false }
  }

  if (isSuperAdminUser(user)) {
    return { isAdmin: true, canSaveFirebase: true, canDelete: true, isSuperAdmin: true }
  }

  const ignore = Boolean(teamData?.ignoreEnvAdminList)
  const row = findMemberRow(user, teamData)

  if (row) {
    if (ignore) {
      return {
        isAdmin: Boolean(row.canEdit),
        canSaveFirebase: Boolean(row.canSaveFirebase),
        canDelete: Boolean(row.canDeleteHymn),
        isSuperAdmin: false,
      }
    }
    const env = envFallbackPermissions(user)
    return {
      isAdmin: Boolean(row.canEdit) || env.isAdmin,
      canSaveFirebase: Boolean(row.canSaveFirebase) || env.canSaveFirebase,
      canDelete: Boolean(row.canDeleteHymn) || env.canDelete,
      isSuperAdmin: false,
    }
  }

  if (ignore) {
    return { isAdmin: false, canSaveFirebase: false, canDelete: false, isSuperAdmin: false }
  }

  return {
    ...envFallbackPermissions(user),
    isSuperAdmin: false,
  }
}

export const SETTINGS_TEAM_DOC = { collection: 'settings', id: 'team' }

export function normalizeMemberRow(row) {
  const email = String(row?.email || '')
    .trim()
    .toLowerCase()
  return {
    email,
    canEdit: Boolean(row?.canEdit),
    canSaveFirebase: Boolean(row?.canSaveFirebase),
    canDeleteHymn: Boolean(row?.canDeleteHymn),
    canManageDashboard: Boolean(row?.canManageDashboard),
  }
}
