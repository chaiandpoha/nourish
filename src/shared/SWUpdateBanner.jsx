import { useState, useEffect } from 'react'

export default function SWUpdateBanner() {
  const [waitingSW, setWaitingSW] = useState(null)
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let isMounted = true

    async function checkForWaiting() {
      const reg = await navigator.serviceWorker.getRegistration().catch(() => null)
      if (!reg || !isMounted) return

      if (reg.waiting) {
        setWaitingSW(reg.waiting)
        return
      }

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller && isMounted) {
            setWaitingSW(installing)
          }
        })
      })
    }

    checkForWaiting()

    // Also trigger a background check so updates are detected while app is open
    navigator.serviceWorker.getRegistration()
      .then(reg => reg?.update?.())
      .catch(() => {})

    return () => { isMounted = false }
  }, [])

  function applyUpdate() {
    if (!waitingSW || reloading) return
    setReloading(true)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    }, { once: true })
    waitingSW.postMessage('SKIP_WAITING')
  }

  if (!waitingSW) return null

  return (
    <div style={s.bar}>
      <span style={s.text}>Update available</span>
      <button style={{ ...s.btn, opacity: reloading ? 0.6 : 1 }} onClick={applyUpdate} disabled={reloading}>
        {reloading ? 'Reloading…' : 'Tap to update'}
      </button>
    </div>
  )
}

const s = {
  bar: {
    position:      'fixed',
    top:           0,
    left:          0,
    right:         0,
    zIndex:        9999,
    display:       'flex',
    alignItems:    'center',
    justifyContent:'space-between',
    gap:           '12px',
    padding:       '10px 16px',
    background:    'var(--accent)',
    color:         '#fff',
    fontSize:      '14px',
    fontWeight:    '500',
  },
  text: { flex: 1 },
  btn: {
    padding:      '6px 14px',
    background:   'rgba(255,255,255,0.25)',
    border:       '1px solid rgba(255,255,255,0.4)',
    borderRadius: '20px',
    color:        '#fff',
    fontSize:     '13px',
    fontWeight:   '700',
    cursor:       'pointer',
    flexShrink:   0,
  },
}
