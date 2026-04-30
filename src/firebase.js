import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAnalytics, isSupported } from 'firebase/analytics'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

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

export const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null
export const db = app ? getFirestore(app) : null
export const auth = app ? getAuth(app) : null
export const googleProvider = new GoogleAuthProvider()
export const analyticsPromise =
  app && typeof window !== 'undefined'
    ? isSupported().then((supported) => (supported ? getAnalytics(app) : null))
    : Promise.resolve(null)
export { hasFirebaseConfig }
