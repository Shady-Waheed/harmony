import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

let orientationLockWarningShown = false

function lockInstalledAppOrientation() {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  const orientation = window.screen.orientation

  if (!isStandalone || typeof orientation?.lock !== 'function') return

  orientation.lock('portrait').catch((error) => {
    if (!orientationLockWarningShown) {
      orientationLockWarningShown = true
      console.warn('[PWA] تعذر تثبيت اتجاه التطبيق على الوضع الرأسي:', error)
    }
  })
}

lockInstalledAppOrientation()
window.addEventListener('pageshow', lockInstalledAppOrientation)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    lockInstalledAppOrientation()
  }
})

registerSW({
  immediate: true,
  onOfflineReady() {
    console.info('[PWA] التطبيق جاهز للعمل بدون إنترنت.')
  },
  onRegistered(registration) {
    if (registration) {
      console.info('[PWA] Service worker مسجّل.')
    }
  },
  onRegisterError(error) {
    console.warn('[PWA] فشل تسجيل service worker:', error)
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
