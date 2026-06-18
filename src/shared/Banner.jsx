import { useState, useEffect } from 'react'

// ─── Banner ───────────────────────────────────────────────────────────────────
// Reusable top-of-screen banner for reminders, warnings, and notices
// Usage:
//   <Banner type="reminder" message="Time to log lunch" onDismiss={() => {}} />
//   <Banner type="warning"  message="Drive storage low" onDismiss={() => {}} />
//   <Banner type="info"     message="Syncing…" autoDismiss={3000} />

const TYPES = {
  reminder: { bg: '#1a2a3a', border: '#2a4a6a', icon: '🔔', color: '#7ab8f5' },
  warning:  { bg: '#2a1a1a', border: '#5a2a2a', icon: '⚠️', color: '#ff8c8c' },
  info:     { bg: '#1a2a1a', border: '#2a4a2a', icon: 'ℹ️', color: '#4ecdc4' },
  success:  { bg: '#1a2a1a', border: '#2a4a2a', icon: '✅', color: '#4ecdc4' },
  quota:    { bg: '#2a2a1a', border: '#4a4a2a', icon: '💾', color: '#ffe66d' },
}

export default function Banner({
  type        = 'info',
  message     = '',
  action      = null,   // { label: string, onClick: fn }
  onDismiss   = null,
  autoDismiss = null,   // ms — auto-hide after this delay
  visible     = true,
}) {
  const [show, setShow] = useState(visible)

  useEffect(() => { setShow(visible) }, [visible])

  useEffect(() => {
    if (!autoDismiss || !show) return
    const t = setTimeout(() => dismiss(), autoDismiss)
    return () => clearTimeout(t)
  }, [autoDismiss, show])

  function dismiss() {
    setShow(false)
    onDismiss?.()
  }

  if (!show) return null

  const theme = TYPES[type] || TYPES.info

  return (
    <div style={{ ...styles.banner, background: theme.bg, borderBottom: `1px solid ${theme.border}` }}>
      <span style={styles.icon}>{theme.icon}</span>

      <span style={{ ...styles.message, color: theme.color }}>
        {message}
      </span>

      {action && (
        <button
          style={{ ...styles.actionBtn, color: theme.color, border: `1px solid ${theme.border}` }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}

      {onDismiss && (
        <button style={styles.dismissBtn} onClick={dismiss}>
          ✕
        </button>
      )}
    </div>
  )
}

// ─── BannerStack ──────────────────────────────────────────────────────────────
// Manages multiple banners — shows one at a time, queue the rest
// Usage:
//   const { addBanner } = useBanners()
//   addBanner({ type: 'warning', message: 'Low storage', onDismiss: ... })

import { createContext, useContext, useCallback } from 'react'

const BannerContext = createContext(null)

export function useBanners() {
  const ctx = useContext(BannerContext)
  if (!ctx) throw new Error('useBanners must be used inside BannerProvider')
  return ctx
}

export function BannerProvider({ children }) {
  const [banners, setBanners] = useState([])

  const addBanner = useCallback((banner) => {
    const id = Date.now() + Math.random()
    setBanners(b => [...b, { ...banner, id }])
    return id
  }, [])

  const removeBanner = useCallback((id) => {
    setBanners(b => b.filter(x => x.id !== id))
  }, [])

  // Only show the first banner — rest queued
  const current = banners[0] || null

  return (
    <BannerContext.Provider value={{ addBanner, removeBanner, banners }}>
      {current && (
        <Banner
          key={current.id}
          type={current.type}
          message={current.message}
          action={current.action}
          autoDismiss={current.autoDismiss}
          onDismiss={() => {
            removeBanner(current.id)
            current.onDismiss?.()
          }}
          visible={true}
        />
      )}
      {children}
    </BannerContext.Provider>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  banner: {
    position:       'fixed',
    top:            0,
    left:           0,
    right:          0,
    zIndex:         200,
    display:        'flex',
    alignItems:     'center',
    gap:            '10px',
    padding:        '12px 16px',
    paddingTop:     'calc(12px + env(safe-area-inset-top))',
    minHeight:      '52px',
    boxSizing:      'border-box',
  },
  icon: {
    fontSize:       '16px',
    flexShrink:     0,
  },
  message: {
    flex:           1,
    fontSize:       '14px',
    fontWeight:     '500',
    lineHeight:     '1.4',
  },
  actionBtn: {
    background:     'transparent',
    border:         '1px solid',
    borderRadius:   '8px',
    padding:        '5px 10px',
    fontSize:       '13px',
    fontWeight:     '600',
    cursor:         'pointer',
    flexShrink:     0,
  },
  dismissBtn: {
    background:     'none',
    border:         'none',
    color:          '#555',
    fontSize:       '16px',
    cursor:         'pointer',
    padding:        '4px',
    flexShrink:     0,
    lineHeight:     '1',
  },
}