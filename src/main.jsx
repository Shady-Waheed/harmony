import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

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
