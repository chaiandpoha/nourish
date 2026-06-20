import { useState, useEffect } from 'react'

const DISMISS_KEY = 'nourish_install_dismissed'

function isStandalone() {
  return window.navigator.standalone === true ||
         window.matchMedia('(display-mode: standalone)').matches
}

function detectPlatform() {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) && !window.MSStream) return 'ios'
  if (/Android/.test(ua) && /Chrome/.test(ua) && !/Edge/.test(ua)) return 'android'
  return null
}

// iOS Safari share icon (box with up-arrow)
function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display:'inline-block', verticalAlign:'middle', margin:'0 1px -2px' }}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

export default function InstallPrompt() {
  const [show,           setShow]           = useState(false)
  const [platform,       setPlatform]       = useState(null)  // 'ios' | 'android'
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installing,     setInstalling]     = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY)) return

    const plat = detectPlatform()
    if (!plat) return

    if (plat === 'ios') {
      const t = setTimeout(() => { setPlatform('ios'); setShow(true) }, 2500)
      return () => clearTimeout(t)
    }

    // Android: wait for browser's install eligibility signal
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setPlatform('android')
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    setInstalling(true)
    try {
      deferredPrompt.prompt()
      await deferredPrompt.userChoice
      setDeferredPrompt(null)
      setShow(false)
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {}
    setInstalling(false)
  }

  if (!show) return null

  return (
    <div style={s.bar}>
      <img src="/icons/icon-192.png" style={s.appIcon} alt="" />

      <div style={s.content}>
        <div style={s.title}>Add Nourish to Home Screen</div>
        {platform === 'ios' ? (
          <div style={s.sub}>
            Tap <ShareIcon /> then <strong style={{ color:'var(--text-primary)' }}>"Add to Home Screen"</strong>
          </div>
        ) : (
          <div style={s.sub}>Offline · Fast · No browser chrome</div>
        )}
      </div>

      {platform === 'android' && (
        <button
          style={{ ...s.installBtn, opacity: installing ? 0.6 : 1 }}
          onClick={handleInstall}
          disabled={installing}
        >
          {installing ? '…' : 'Install'}
        </button>
      )}

      <button style={s.dismissBtn} onClick={dismiss} aria-label="Dismiss">✕</button>
    </div>
  )
}

const s = {
  bar: {
    position:       'fixed',
    bottom:         '80px',
    left:           '12px',
    right:          '12px',
    zIndex:         140,
    display:        'flex',
    alignItems:     'center',
    gap:            '10px',
    padding:        '12px 14px',
    background:     'var(--bg-surface)',
    border:         '0.5px solid var(--border-subtle)',
    borderRadius:   'var(--r-xl)',
    boxShadow:      '0 4px 24px rgba(0,0,0,0.15)',
    animation:      'sheetUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
  },
  appIcon: {
    width:          '36px',
    height:         '36px',
    borderRadius:   '8px',
    flexShrink:     0,
  },
  content: {
    flex:           1,
    display:        'flex',
    flexDirection:  'column',
    gap:            '2px',
    minWidth:       0,
  },
  title: {
    fontSize:       '13px',
    fontWeight:     '600',
    color:          'var(--text-primary)',
    letterSpacing:  '-0.01em',
  },
  sub: {
    fontSize:       '12px',
    color:          'var(--text-secondary)',
    lineHeight:     '1.4',
  },
  installBtn: {
    padding:        '8px 16px',
    background:     'var(--accent)',
    border:         'none',
    borderRadius:   'var(--r-md)',
    color:          '#fff',
    fontSize:       '13px',
    fontWeight:     '700',
    cursor:         'pointer',
    flexShrink:     0,
  },
  dismissBtn: {
    background:     'none',
    border:         'none',
    color:          'var(--text-tertiary)',
    fontSize:       '14px',
    cursor:         'pointer',
    padding:        '4px',
    flexShrink:     0,
    lineHeight:     '1',
  },
}
