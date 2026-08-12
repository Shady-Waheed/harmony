import { useEffect, useState } from 'react'

/**
 * Tracks browser connectivity and whether Firestore data came from local cache.
 * Firestore auto-syncs when the device goes back online (onSnapshot fires again).
 */
export function useOfflineSync({ hymnsFromCache, teamFromCache }) {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const dataFromCache = hymnsFromCache || teamFromCache
  const syncing = online && dataFromCache

  let status = 'live'
  let label = 'متصل — البيانات محدّثة'
  if (!online) {
    status = 'offline'
    label = 'بدون إنترنت — تعرض نسخة محفوظة على الجهاز'
  } else if (syncing) {
    status = 'syncing'
    label = 'جاري مزامنة التحديثات…'
  }

  return { online, dataFromCache, syncing, status, label }
}
