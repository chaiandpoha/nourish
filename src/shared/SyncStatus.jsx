import { useState, useEffect, useCallback } from 'react'
import { db } from '../db/indexedDB.js'
import { useAuth } from '../auth/useAuth.jsx'
import { isTokenValid, initiateOAuthFlow } from '../db/driveApi.js'

const TABLES = ['foodLogs', 'workoutLogs', 'weightLog', 'measurements', 'waterLog', 'supplementLog']

export default function SyncStatus() {
  const { user } = useAuth()
  const [status,      setStatus]      = useState('synced') // 'synced' | 'pending' | 'disconnected'
  const [lastSync,    setLastSync]    = useState(null)
  const [open,        setOpen]        = useState(false)

  const checkStatus = useCallback(async () => {
    if (!user) return
    try {
      if (!isTokenValid()) {
        setStatus('disconnected')
        return
      }
      let dirty = 0
      for (const t of TABLES) {
        if (!db[t]) continue
        const c = await db[t].where('userId').equals(user.id).and(r => r.dirty === 1).count()
        dirty += c
      }
      setStatus(dirty > 0 ? 'pending' : 'synced')

      const states = await db.syncState.where('userId').equals(user.id).toArray()
      if (states.length) {
        const latest = states.sort((a, b) =>
          (b.lastSyncAt || '').localeCompare(a.lastSyncAt || '')
        )[0]
        setLastSync(latest.lastSyncAt)
      }
    } catch {}
  }, [user?.id])

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 30_000)
    return () => clearInterval(interval)
  }, [checkStatus])

  const color = status === 'synced' ? '#34C759' : status === 'disconnected' ? '#FF3B30' : '#FF9500'

  function fmtTime(iso) {
    if (!iso) return 'Never'
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now - d
    const diffMin = Math.round(diffMs / 60000)
    if (diffMin < 1)  return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.round(diffMin / 60)
    if (diffH < 24)   return `${diffH}h ago`
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short' })
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        style={styles.btn}
        onClick={() => { setOpen(o => !o); checkStatus() }}
        aria-label="Sync status"
      >
        <span style={{ ...styles.icon, color }}>
          {status === 'pending' ? '⚠' : '✓'}
        </span>
        <span style={{ ...styles.cloudIcon, color }}>☁</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={styles.backdrop} />
          <div style={styles.popover}>
            <div style={styles.popoverRow}>
              <div style={{ ...styles.dot, background: color }} />
              <span style={styles.popoverStatus}>
                {status === 'synced'       ? 'Synced to Drive'     :
                 status === 'disconnected' ? 'Drive not connected' :
                                            'Sync pending'}
              </span>
            </div>
            {status === 'disconnected' ? (
              <button style={styles.connectBtn} onClick={() => { setOpen(false); initiateOAuthFlow() }}>
                Connect Google Drive
              </button>
            ) : (
              <div style={styles.popoverSub}>Last sync: {fmtTime(lastSync)}</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const styles = {
  btn: {
    background:   'none',
    border:       'none',
    cursor:       'pointer',
    padding:      '4px',
    display:      'flex',
    alignItems:   'center',
    position:     'relative',
    width:        '28px',
    height:       '28px',
    justifyContent: 'center',
  },
  cloudIcon: {
    fontSize:   '22px',
    lineHeight: 1,
  },
  icon: {
    position:  'absolute',
    fontSize:  '9px',
    fontWeight:'900',
    bottom:    '2px',
    right:     '1px',
    lineHeight: 1,
    textShadow: '0 0 3px var(--bg-base)',
  },
  backdrop: {
    position: 'fixed',
    inset:    0,
    zIndex:   60,
  },
  popover: {
    position:     'absolute',
    right:        0,
    top:          '36px',
    background:   'var(--bg-surface)',
    border:       '0.5px solid var(--border-subtle)',
    borderRadius: 'var(--r-lg)',
    padding:      '12px 14px',
    zIndex:       61,
    minWidth:     '180px',
    boxShadow:    '0 4px 16px rgba(0,0,0,0.1)',
    display:      'flex',
    flexDirection:'column',
    gap:          '4px',
  },
  popoverRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '8px',
  },
  dot: {
    width:        '8px',
    height:       '8px',
    borderRadius: '50%',
    flexShrink:   0,
  },
  popoverStatus: {
    fontSize:   '13px',
    fontWeight: '600',
    color:      'var(--text-primary)',
  },
  popoverSub: {
    fontSize:    '12px',
    color:       'var(--text-tertiary)',
    paddingLeft: '16px',
  },
  connectBtn: {
    marginTop:    '8px',
    padding:      '8px 12px',
    background:   'var(--accent-dim)',
    border:       '1px solid var(--accent)',
    borderRadius: 'var(--r-md)',
    color:        'var(--accent)',
    fontSize:     '13px',
    fontWeight:   '600',
    cursor:       'pointer',
    width:        '100%',
  },
}
