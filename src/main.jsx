import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initTheme } from './shared/theme.js'

initTheme()  // apply before first React paint — no flash

const root = document.getElementById('root')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)