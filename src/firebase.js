import { initializeApp } from 'firebase/app'
import {
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore'
import { getAnalytics, isSupported } from 'firebase/analytics'
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyD40x6ixdgcqjW8ibHCKl6_DZRAlxCMLUI',
  authDomain: 'harmony-notes.firebaseapp.com',
  projectId: 'harmony-notes',
  storageBucket: 'harmony-notes.firebasestorage.app',
  messagingSenderId: '764642698675',
  appId: '1:764642698675:web:1802999ae70f0b0afb97c6',
  measurementId: 'G-NPJ13345VY',
}

const hasFirebaseConfig = true

function clearLegacyFirestorePersistence() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return
  }

  const legacyNames = [
    'firebaseLocalStorageDb',
    'firebase-heartbeat-database',
    'firebase-local-database',
  ]

  legacyNames.forEach((name) => {
    try {
      window.indexedDB.deleteDatabase(name)
    } catch {
      // Ignore legacy cache cleanup errors and force server-first reads.
    }
  })
}

clearLegacyFirestorePersistence()

export const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null

/**
 * Use in-memory cache only so stale IndexedDB copies do not override
 * fresh Firestore server data on mobile and reloads.
 */
export const db = app
  ? initializeFirestore(app, {
      localCache: memoryLocalCache(),
    })
  : null

export const auth = app ? getAuth(app) : null
if (auth && typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('[auth] local persistence:', err?.code || err?.message || err)
  })
}
export const googleProvider = new GoogleAuthProvider()
export const analyticsPromise =
  app && typeof window !== 'undefined'
    ? isSupported().then((supported) => (supported ? getAnalytics(app) : null))
    : Promise.resolve(null)
export { hasFirebaseConfig }
