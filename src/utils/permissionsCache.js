const PERMS_CACHE_KEY = 'harmony-notes-perms-cache-v1'

export function cacheUserPermissions(user, perms) {
  if (!user?.uid || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      PERMS_CACHE_KEY,
      JSON.stringify({
        uid: user.uid,
        isAdmin: Boolean(perms?.isAdmin),
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

/** Offline fallback: retain the editor UI role without caching Firestore access. */
export function resolvePermissionsWithOfflineCache(user, teamData, resolvePermissions, online) {
  const live = resolvePermissions(user, teamData)
  if (online || !user) return live

  const cached = loadCachedPermissions(user)
  if (!cached) return live

  return {
    ...live,
    isAdmin: live.isAdmin || cached.isAdmin,
  }
}
