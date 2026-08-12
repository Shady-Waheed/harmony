import { useEffect, useState } from 'react'

const SYNC_TIMEOUT_MS = 12_000

/**
 * Tracks connectivity, Firestore cache vs server, and queued local writes.
 * Firestore persists writes offline and uploads them when the network returns.
 */
export function useOfflineSync({
  hymnsFromCache,
  teamFromCache,
  teamActive,
  hymnsReady,
  pendingWrites,
}) {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [syncTimedOut, setSyncTimedOut] = useState(false)

  const dataFromCache = teamActive ? hymnsFromCache || teamFromCache : hymnsFromCache
  const waitingForServer = online && dataFromCache && hymnsReady && !pendingWrites

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

  useEffect(() => {
    if (!waitingForServer) {
      setSyncTimedOut(false)
      return undefined
    }

    const timer = window.setTimeout(() => setSyncTimedOut(true), SYNC_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [waitingForServer, hymnsFromCache, teamFromCache, pendingWrites])

  let status = 'live'
  let label = 'متصل — البيانات محدّثة'

  if (pendingWrites && !online) {
    status = 'pending-offline'
    label = 'بدون إنترنت — التعديلات محفوظة محليًا وستُرفع عند عودة النت'
  } else if (pendingWrites && online) {
    status = 'pending-upload'
    label = 'جاري رفع التعديلات إلى السيرفر…'
  } else if (!online) {
    status = 'offline'
    label = 'بدون إنترنت — تعرض نسخة محفوظة على الجهاز'
  } else if (waitingForServer && !syncTimedOut) {
    status = 'syncing'
    label = 'جاري جلب آخر التحديثات…'
  } else if (dataFromCache) {
    status = 'cached'
    label = 'متصل — تعرض نسخة محفوظة على الجهاز'
  }

  return {
    online,
    dataFromCache,
    syncing: waitingForServer && !syncTimedOut,
    status,
    label,
  }
}

export function isBrowserOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

export function offlineSaveNotice(action = 'save') {
  if (action === 'delete') {
    return 'تم الحذف محليًا — سيُطبَّق على السيرفر عند عودة الإنترنت.'
  }
  return 'تم الحفظ على الجهاز — سيُرفع للسيرفر عند عودة الإنترنت.'
}
