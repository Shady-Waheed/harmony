/** مطابقة مستخدم Firebase مع القوائم البيئية + مستند الفريق في Firestore */

function parseList(raw) {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * مشرف رئيسي صريح (صلاحيات كاملة + تجاوز مستند الفريق). يعمل فقط لو عرّفت VITE_SUPER_ADMIN_*.
 */
export function isSuperAdminUser(user) {
  if (!user) return false
  const emails = parseList(import.meta.env.VITE_SUPER_ADMIN_EMAILS).map((e) => e.toLowerCase())
  const uids = parseList(import.meta.env.VITE_SUPER_ADMIN_UIDS)
  if (emails.length === 0 && uids.length === 0) {
    return false
  }
  const email = String(user.email || '').toLowerCase()
  const uid = String(user.uid || '')
  return emails.includes(email) || uids.includes(uid)
}

/**
 * من يقدر يفتح لوحة الصلاحيات ويحفظ settings/team:
 * — لو VITE_SUPER_ADMIN_* فاضية: أي حساب في VITE_ADMIN_EMAILS / VITE_ADMIN_UIDS
 * — لو في قائمة مشرف رئيسي: نفس isSuperAdminUser
 */
export function canAccessTeamDashboard(user) {
  if (!user) return false
  const emails = parseList(import.meta.env.VITE_SUPER_ADMIN_EMAILS).map((e) => e.toLowerCase())
  const uids = parseList(import.meta.env.VITE_SUPER_ADMIN_UIDS)
  const email = String(user.email || '').toLowerCase()
  const uid = String(user.uid || '')
  if (emails.length === 0 && uids.length === 0) {
    return isAdminUserEnv(user)
  }
  return emails.includes(email) || uids.includes(uid)
}

function isAdminUserEnv(user) {
  if (!user) return false
  const allowedEmails = parseList(import.meta.env.VITE_ADMIN_EMAILS).map((e) => e.toLowerCase())
  const allowedUids = parseList(import.meta.env.VITE_ADMIN_UIDS)
  const email = String(user.email || '').toLowerCase()
  const uid = String(user.uid || '')
  return allowedEmails.includes(email) || allowedUids.includes(uid)
}

function canDeleteHymnsEnv(user) {
  if (!user) return false
  const allowedEmails = parseList(import.meta.env.VITE_DELETE_EMAILS).map((e) => e.toLowerCase())
  const allowedUids = parseList(import.meta.env.VITE_DELETE_UIDS)

  if (allowedEmails.length === 0 && allowedUids.length === 0) {
    return isAdminUserEnv(user)
  }

  const email = String(user.email || '').toLowerCase()
  const uid = String(user.uid || '')
  return allowedEmails.includes(email) || allowedUids.includes(uid)
}

function canSaveHymnsToFirebaseEnv(user) {
  if (!user) return false
  const allowedEmails = parseList(import.meta.env.VITE_SAVE_EMAILS).map((e) => e.toLowerCase())
  const allowedUids = parseList(import.meta.env.VITE_SAVE_UIDS)
  const email = String(user.email || '').toLowerCase()
  const uid = String(user.uid || '')

  if (allowedEmails.length === 0 && allowedUids.length === 0) {
    return isAdminUserEnv(user)
  }

  return allowedEmails.includes(email) || allowedUids.includes(uid)
}

function envFallbackPermissions(user) {
  return {
    isAdmin: isAdminUserEnv(user),
    canSaveFirebase: canSaveHymnsToFirebaseEnv(user),
    canDelete: canDeleteHymnsEnv(user),
  }
}

/**
 * دمج: المشرف الرئيسي دائمًا كل الصلاحيات؛ وإلا صف في members؛ وإلا القيم من الـ env
 */
export function resolvePermissions(user, teamData) {
  if (!user) {
    return { isAdmin: false, canSaveFirebase: false, canDelete: false, isSuperAdmin: false }
  }

  if (isSuperAdminUser(user)) {
    return { isAdmin: true, canSaveFirebase: true, canDelete: true, isSuperAdmin: true }
  }

  const email = String(user.email || '').toLowerCase()
  const members = teamData?.members
  if (Array.isArray(members) && email) {
    const row = members.find((m) => String(m.email || '').toLowerCase() === email)
    if (row) {
      return {
        isAdmin: Boolean(row.canEdit),
        canSaveFirebase: Boolean(row.canSaveFirebase),
        canDelete: Boolean(row.canDeleteHymn),
        isSuperAdmin: false,
      }
    }
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
  }
}
