const PERMS_CACHE_KEY = 'harmony-notes-perms-cache-v1'

export function cacheUserPermissions(user, perms) {
  if (!user?.uid || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      PERMS_CACHE_KEY,
      JSON.stringify({
        uid: user.uid,
        isAdmin: Boolean(perms?.isAdmin),
        canSaveFirebase: Boolean(perms?.canSaveFirebase),
        canDelete: Boolean(perms?.canDelete),
        isSuperAdmin: Boolean(perms?.isSuperAdmin),
      }),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadCachedPermissions(user) {
  if (!user?.uid || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(PERMS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.uid !== user.uid) return null
    return parsed
  } catch {
    return null
  }
}

/** Offline fallback: keep last known admin capabilities for signed-in user. */
export function resolvePermissionsWithOfflineCache(user, teamData, resolvePermissions, online) {
  const live = resolvePermissions(user, teamData)
  if (online || !user) return live

  const cached = loadCachedPermissions(user)
  if (!cached) return live

  return {
    isAdmin: live.isAdmin || cached.isAdmin,
    canSaveFirebase: live.canSaveFirebase || cached.canSaveFirebase,
    canDelete: live.canDelete || cached.canDelete,
    isSuperAdmin: live.isSuperAdmin || cached.isSuperAdmin,
  }
}
