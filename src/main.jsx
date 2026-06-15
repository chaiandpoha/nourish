import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initTheme } from './shared/theme.js'

initTheme()  // apply before first React paint — no flash

const root = document.getElementById('root')

try {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
} catch (e) {
  root.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100dvh;background:#0f0f0f;color:#fff;gap:12px;padding:24px;text-align:center;font-family:sans-serif">
      <div style="font-size:48px">⚠️</div>
      <p style="font-size:16px;margin:0">Failed to start</p>
      <p style="font-size:12px;color:#888;margin:0;word-break:break-all">${e?.message || String(e)}</p>
      <button onclick="window.location.reload()" style="margin-top:8px;padding:10px 20px;background:#333;border:none;border-radius:8px;color:#fff;cursor:pointer">Reload</button>
    </div>
  `
}
