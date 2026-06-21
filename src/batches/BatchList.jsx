import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db, addFoodLogEntry, sbFetchBatches, sbCloseBatch, sbReopenBatch } from '../db/db.js'
import { calcPortionMacros } from './batchCalc.js'
import BatchBuilder from './BatchBuilder.jsx'
import { localDate } from '../log/DayLog.jsx'

export default function BatchList({ onLogged }) {
  const [batches,       setBatches]       = useState([])
  const [closedBatches, setClosedBatches] = useState([])
  const [showClosed,    setShowClosed]    = useState(false)
  const [screen,        setScreen]        = useState('list')
  const [selected,      setSelected]      = useState(null)
  const [editing,       setEditing]       = useState(null)
  const [loading,       setLoading]       = useState(true)
  const { user } = useAuth()

  useEffect(() => { loadBatches() }, [user])

  useEffect(() => {
    const onFocus    = () => loadBatches()
    const onVisible  = () => { if (document.visibilityState === 'visible') loadBatches() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user])

  async function loadBatches() {
    if (!user) return
    try {
      const remote = await sbFetchBatches(user.householdId)
      const localRecords = await db.batches.bulkGet(remote.map(b => b.id))
      const toSave = []
      for (let i = 0; i < remote.length; i++) {
        const r     = remote[i]
        const local = localRecords[i]
        if (!local) {
          // Not in local DB — restore it and derive closedAt from updatedAt if missing
          toSave.push({ ...r, closedAt: r.closed ? (r.closedAt || r.updatedAt) : undefined })
          continue
        }
        // Local is newer or same — skip (trust local)
        if (local.updatedAt && r.updatedAt && r.updatedAt <= local.updatedAt) continue
        // Never clobber local ingredients with an empty remote payload
        const localHasIng  = Array.isArray(local.ingredients) && local.ingredients.length > 0
        const remoteHasIng = Array.isArray(r.ingredients)     && r.ingredients.length > 0
        if (localHasIng && !remoteHasIng) continue
        // Remote is newer — apply it (this includes close/reopen state from other members)
        toSave.push({ ...r, closedAt: r.closed ? (r.closedAt || r.updatedAt) : undefined })
      }
      if (toSave.length) await db.batches.bulkPut(toSave)

      // Remove household batches deleted remotely — but never delete dirty (unsynced) batches,
      // they may not be in Supabase yet (e.g. just created, sbSaveBatch still in flight)
      if (user.householdId) {
        const remoteIds = new Set(remote.map(b => b.id))
        const localHousehold = await db.batches.toArray()
        const toRemove = localHousehold
          .filter(b => b.householdId === user.householdId && !remoteIds.has(b.id) && !b.dirty)
          .map(b => b.id)
        if (toRemove.length) await db.batches.bulkDelete(toRemove)
      }

      const sort = arr => arr.sort((a, b) => {
        if (a.shared && !b.shared) return -1
        if (!a.shared && b.shared) return 1
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const allRaw = await db.batches.toArray()
      // Only show household batches + own personal batches (not other users' personal batches)
      const hid = user.householdId
      const all = hid
        ? allRaw.filter(b =>
            b.householdId === hid ||
            (!b.shared && !b.householdId && (b.userId === user.id || b.createdBy === user.email))
          )
        : allRaw.filter(b => b.userId === user.id || b.createdBy === user.email || !b.userId)
      const open   = all.filter(b => !b.closed)
      const closed = all.filter(b => b.closed && (!b.closedAt || b.closedAt >= cutoff))
      setBatches(sort(open))
      setClosedBatches(sort(closed))
    } catch {
      const cutoff  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const allRaw  = await db.batches.toArray()
      const hid     = user?.householdId
      const all     = hid
        ? allRaw.filter(b => b.householdId === hid || (!b.shared && !b.householdId && (b.userId === user?.id || b.createdBy === user?.email)))
        : allRaw.filter(b => b.userId === user?.id || b.createdBy === user?.email || !b.userId)
      setBatches(all.filter(b => !b.closed))
      setClosedBatches(all.filter(b => b.closed && (b.closedAt || b.updatedAt || '') >= cutoff))
    }
    setLoading(false)
  }

  async function handleEdit(batch) {
    // Always load from local IndexedDB — it has ingredients even when Supabase doesn't
    const local = await db.batches.get(batch.id).catch(() => null)
    const richBatch = (local && Array.isArray(local.ingredients) && local.ingredients.length > 0) ? local : batch
    setEditing(richBatch)
    setScreen('edit')
  }

  async function handleClose(batchId) {
    const now = new Date().toISOString()
    await sbCloseBatch(batchId).catch(e => console.warn('Supabase:', e))
    await db.batches.update(batchId, { closed: 1, closedAt: now, dirty: 1, updatedAt: now })
    loadBatches()
  }

  async function handleReopen(batchId) {
    await sbReopenBatch(batchId).catch(e => console.warn('Supabase:', e))
    await db.batches.update(batchId, { closed: 0, closedAt: null, dirty: 1, updatedAt: new Date().toISOString() })
    loadBatches()
  }

  if (screen === 'create') {
    return (
      <BatchBuilder
        onSave={() => { setScreen('list'); loadBatches() }}
        onCancel={() => setScreen('list')}
      />
    )
  }

  if (screen === 'edit' && editing) {
    return (
      <BatchBuilder
        existingBatch={editing}
        onSave={() => { setScreen('list'); setEditing(null); loadBatches() }}
        onCancel={() => { setScreen('list'); setEditing(null) }}
      />
    )
  }

  if (screen === 'log' && selected) {
    return (
      <LogPortion
        batch={selected}
        onLogged={() => { setScreen('list'); onLogged?.() }}
        onCancel={() => setScreen('list')}
      />
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Batches</span>
        <button
          style={styles.newBtn}
          onClick={() => setScreen('create')}
        >
          + New Batch
        </button>
      </div>

      {loading && (
        <div style={styles.empty}>Loading…</div>
      )}

      {!loading && batches.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🍲</div>
          <p style={styles.emptyText}>No active batches</p>
          <p style={styles.emptySub}>
            Cook a large batch and log portions throughout the week
          </p>
          <button
            style={styles.createBtn}
            onClick={() => setScreen('create')}
          >
            Create First Batch
          </button>
        </div>
      )}

      {batches.map(batch => (
        <BatchCard
          key={batch.id}
          batch={batch}
          onLog={() => { setSelected(batch); setScreen('log') }}
          onEdit={() => handleEdit(batch)}
          onClose={() => handleClose(batch.id)}
        />
      ))}

      {!loading && (
        <div style={styles.closedSection}>
          <button style={styles.closedToggle} onClick={() => setShowClosed(s => !s)}>
            <span>Closed last 7 days</span>
            <span style={styles.closedMeta}>
              {closedBatches.length > 0 ? closedBatches.length : 'none'}
              {' '}{showClosed ? '▲' : '▼'}
            </span>
          </button>

          {showClosed && (
            closedBatches.length === 0
              ? <div style={styles.noClosed}>No closed batches yet</div>
              : closedBatches.map(batch => (
                  <BatchCard
                    key={batch.id}
                    batch={batch}
                    closed
                    onReopen={() => handleReopen(batch.id)}
                  />
                ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── BatchCard ────────────────────────────────────────────────────────────────

function BatchCard({ batch, onLog, onEdit, onClose, onReopen, closed = false }) {
  const [showClose, setShowClose] = useState(false)
  const daysOld = Math.floor(
    (Date.now() - new Date(batch.createdAt)) / (1000 * 60 * 60 * 24)
  )

  return (
    <div style={{ ...styles.card, ...(closed ? styles.cardClosed : {}) }}>
      <div style={styles.cardTop}>
        <div style={styles.cardLeft}>
          <div style={styles.batchName}>{batch.name}</div>
          <div style={styles.batchMeta}>
            {batch.macrosPer100g?.calories || 0} kcal ·{' '}
            {batch.macrosPer100g?.protein  || 0}g P ·{' '}
            {batch.macrosPer100g?.carbs    || 0}g C per 100g
          </div>
          <div style={styles.batchAge}>
            {daysOld === 0 ? 'Made today' : `Made ${daysOld}d ago`}
            {batch.shared ? (
              <span style={styles.sharedBadge}> · Shared</span>
            ) : (
              <span style={styles.privateBadge}> · Personal</span>
            )}
            {closed && <span style={styles.closedBadge}> · Closed</span>}
          </div>
        </div>

        {!closed && (
          <div style={{ display:'flex', flexDirection:'column', gap:'6px', flexShrink:0 }}>
            <button style={styles.logBtn} onClick={onLog}>Log portion</button>
            <button style={styles.editBtn} onClick={onEdit}>Edit</button>
          </div>
        )}
      </div>

      <div style={styles.cardFooter}>
        {closed ? (
          <button style={styles.reopenLink} onClick={onReopen}>Reopen batch</button>
        ) : !showClose ? (
          <button style={styles.closeLink} onClick={() => setShowClose(true)}>
            Close batch
          </button>
        ) : (
          <div style={styles.confirmRow}>
            <span style={styles.confirmText}>Mark as finished?</span>
            <button style={styles.confirmYes} onClick={onClose}>Yes, close</button>
            <button style={styles.confirmNo}  onClick={() => setShowClose(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── LogPortion ───────────────────────────────────────────────────────────────

function LogPortion({ batch, onLogged, onCancel }) {
  const [grams,  setGrams]  = useState('100')
  const [meal,   setMeal]   = useState(() => {
    const h = new Date().getHours()
    if (h < 10) return 'breakfast'
    if (h < 15) return 'lunch'
    if (h < 19) return 'dinner'
    return 'snack'
  })
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)
  const { user } = useAuth()

  const parsedGrams = parseFloat(grams) || 0
  const macros      = calcPortionMacros(batch, parsedGrams)

  async function handleLog() {
    if (parsedGrams <= 0) { setError('Enter a valid amount'); return }
    if (batch.closed) { setError('This batch is closed'); return }
    setSaving(true)
    try {
      await addFoodLogEntry(user.id, {
        batchId:  batch.id,
        name:     batch.name,
        grams:    parsedGrams,
        meal,
        date:     localDate(),
        ...macros,
        source:   'batch',
      })
      onLogged()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.container}>
      <button style={styles.backBtn} onClick={onCancel}>← Back</button>

      <div style={styles.portionTitle}>{batch.name}</div>
      <div style={styles.portionMeta}>
        {batch.macrosPer100g?.calories} kcal · {batch.macrosPer100g?.protein}g P per 100g
      </div>

      {/* Meal slot */}
      <div style={styles.mealRow}>
        {['breakfast','lunch','dinner','snack'].map(m => (
          <button
            key={m}
            style={{
              ...styles.mealBtn,
              ...(meal === m ? styles.mealBtnActive : {})
            }}
            onClick={() => setMeal(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Gram input */}
      <div style={styles.gramRow}>
        <input
          style={styles.gramInput}
          type="number"
          inputMode="decimal"
          value={grams}
          onChange={e => setGrams(e.target.value)}
          autoFocus
        />
        <span style={styles.gramUnit}>g</span>
      </div>

      {/* Macro preview */}
      <div style={styles.macroPreview}>
        <div style={styles.macroGrid}>
          {[
            { label: 'kcal',    val: macros.calories, color: 'var(--text-primary)'  },
            { label: 'Protein', val: macros.protein,  color: 'var(--macro-protein)' },
            { label: 'Carbs',   val: macros.carbs,    color: 'var(--macro-carbs)'   },
            { label: 'Fat',     val: macros.fat,      color: 'var(--macro-fat)'     },
            { label: 'Fibre',   val: macros.fibre,    color: 'var(--macro-fibre)'   },
          ].map(({ label, val, color }) => (
            <div key={label} style={styles.macroCell}>
              <span style={{ ...styles.macroVal, color }}>{val}</span>
              <span style={styles.macroLabel}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.actions}>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button
          style={{ ...styles.logBtnFull, opacity: saving ? 0.6 : 1 }}
          onClick={handleLog}
          disabled={saving}
        >
          {saving ? 'Logging…' : 'Add to log'}
        </button>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '12px',
    paddingBottom: '8px',
  },
  header: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  title: {
    fontSize:        '18px',
    fontWeight:      '600',
    color:           'var(--text-primary)',
    letterSpacing:   '-0.02em',
  },
  newBtn: {
    padding:         '7px 14px',
    background:      'var(--accent-dim)',
    border:          'none',
    borderRadius:    'var(--r-md)',
    color:           'var(--accent)',
    fontSize:        '13px',
    fontWeight:      '600',
    cursor:          'pointer',
  },
  empty: {
    fontSize:        '14px',
    color:           'var(--text-tertiary)',
    textAlign:       'center',
    padding:         '24px 0',
  },
  emptyState: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    padding:         '32px 16px',
    gap:             '8px',
  },
  emptyIcon: {
    fontSize:        '48px',
    marginBottom:    '8px',
  },
  emptyText: {
    fontSize:        '16px',
    fontWeight:      '600',
    color:           'var(--text-primary)',
    margin:          0,
  },
  emptySub: {
    fontSize:        '14px',
    color:           'var(--text-secondary)',
    textAlign:       'center',
    margin:          0,
  },
  createBtn: {
    marginTop:       '8px',
    padding:         '12px 24px',
    background:'var(--accent)',
    border:          'none',
    borderRadius:    'var(--r-lg)',
    color:           'var(--text-inverse)',
    fontSize:        '15px',
    fontWeight:      '600',
    cursor:          'pointer',
  },
  card: {
    background:      'var(--bg-surface)',
    border:          '0.5px solid var(--border-subtle)',
    borderRadius:    'var(--r-xl)',
    overflow:        'hidden',
  },
  cardTop: {
    display:         'flex',
    alignItems:      'center',
    padding:         '14px 16px',
    gap:             '12px',
  },
  cardLeft: {
    flex:            1,
    display:         'flex',
    flexDirection:   'column',
    gap:             '3px',
  },
  batchName: {
    fontSize:        '16px',
    fontWeight:      '600',
    color:           'var(--text-primary)',
    letterSpacing:   '-0.02em',
    fontStyle:       'italic',
    fontFamily:      'var(--font-serif)',
  },
  batchMeta: {
    fontSize:        '12px',
    color:           'var(--text-secondary)',
  },
  batchAge: {
    fontSize:        '11px',
    color:           'var(--text-tertiary)',
  },
  sharedBadge: {
    color:           'var(--accent)',
    fontWeight:      '600',
  },
  privateBadge: {
    color:           'var(--text-tertiary)',
  },
  logBtn: {
    padding:         '9px 16px',
    background:'var(--accent)',
    border:          'none',
    borderRadius:    'var(--r-md)',
    color:           'var(--text-inverse)',
    fontSize:        '13px',
    fontWeight:      '600',
    cursor:          'pointer',
  },
  editBtn: {
    padding:         '6px 16px',
    background:      'var(--bg-elevated)',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-md)',
    color:           'var(--text-secondary)',
    fontSize:        '12px',
    fontWeight:      '600',
    cursor:          'pointer',
  },
  cardFooter: {
    borderTop:       '0.5px solid var(--border-subtle)',
    padding:         '10px 16px',
  },
  closeLink: {
    background:      'none',
    border:          'none',
    color:           'var(--text-tertiary)',
    fontSize:        '13px',
    cursor:          'pointer',
    padding:         0,
  },
  closedSection: {
    borderTop:       '0.5px solid var(--border-subtle)',
    paddingTop:      '4px',
    display:         'flex',
    flexDirection:   'column',
    gap:             '8px',
  },
  closedToggle: {
    background:      'none',
    border:          'none',
    color:           'var(--text-secondary)',
    fontSize:        '13px',
    fontWeight:      '600',
    cursor:          'pointer',
    padding:         '6px 0',
    textAlign:       'left',
    display:         'flex',
    justifyContent:  'space-between',
    width:           '100%',
  },
  closedMeta: {
    color:           'var(--text-tertiary)',
    fontWeight:      '400',
  },
  noClosed: {
    fontSize:        '13px',
    color:           'var(--text-tertiary)',
    textAlign:       'center',
    padding:         '12px 0',
    fontStyle:       'italic',
  },
  cardClosed: {
    opacity:         0.65,
  },
  closedBadge: {
    color:           'var(--text-tertiary)',
    fontStyle:       'italic',
  },
  reopenLink: {
    background:      'none',
    border:          'none',
    color:           'var(--accent)',
    fontSize:        '13px',
    cursor:          'pointer',
    padding:         0,
    fontWeight:      '500',
  },
  confirmRow: {
    display:         'flex',
    alignItems:      'center',
    gap:             '10px',
  },
  confirmText: {
    fontSize:        '13px',
    color:           'var(--text-secondary)',
    flex:            1,
  },
  confirmYes: {
    padding:         '5px 12px',
    background:      'rgba(200,80,64,0.08)',
    border:          'none',
    borderRadius:    'var(--r-sm)',
    color:           'var(--red)',
    fontSize:        '13px',
    fontWeight:      '600',
    cursor:          'pointer',
  },
  confirmNo: {
    padding:         '5px 12px',
    background:      'var(--bg-elevated)',
    border:          'none',
    borderRadius:    'var(--r-sm)',
    color:           'var(--text-secondary)',
    fontSize:        '13px',
    cursor:          'pointer',
  },
  backBtn: {
    background:      'none',
    border:          'none',
    color:           'var(--accent)',
    fontSize:        '15px',
    cursor:          'pointer',
    padding:         0,
    alignSelf:       'flex-start',
  },
  portionTitle: {
    fontSize:        '20px',
    fontWeight:      '600',
    color:           'var(--text-primary)',
    letterSpacing:   '-0.02em',
    fontStyle:       'italic',
    fontFamily:      'var(--font-serif)',
  },
  portionMeta: {
    fontSize:        '13px',
    color:           'var(--text-secondary)',
    marginTop:       '-6px',
  },
  mealRow: {
    display:         'flex',
    gap:             '6px',
  },
  mealBtn: {
    flex:            1,
    padding:         '8px 4px',
    background:      'var(--bg-elevated)',
    border:          '0.5px solid var(--border-subtle)',
    borderRadius:    'var(--r-md)',
    fontSize:        '12px',
    fontWeight:      '500',
    color:           'var(--text-secondary)',
    cursor:          'pointer',
  },
  mealBtnActive: {
    background:'var(--accent)',
    color:           'var(--text-inverse)',
    border:'0.5px solid var(--accent)',
  },
  gramRow: {
    display:         'flex',
    alignItems:      'center',
    gap:             '10px',
  },
  gramInput: {
    flex:            1,
    fontSize:        '32px',
    fontWeight:      '300',
    letterSpacing:   '-0.03em',
    padding:         '10px 14px',
    background:      'var(--bg-elevated)',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-md)',
    color:           'var(--text-primary)',
    outline:         'none',
  },
  gramUnit: {
    fontSize:        '18px',
    color:           'var(--text-tertiary)',
    fontWeight:      '400',
  },
  macroPreview: {
    background:      'var(--bg-elevated)',
    borderRadius:    'var(--r-lg)',
    padding:         '14px',
  },
  macroGrid: {
    display:         'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
  },
  macroCell: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             '3px',
  },
  macroVal: {
    fontSize:        '16px',
    fontWeight:      '700',
    fontFamily:      'var(--font-mono)',
    letterSpacing:   '-0.02em',
  },
  macroLabel: {
    fontSize:        '10px',
    color:           'var(--text-tertiary)',
    textTransform:   'uppercase',
    letterSpacing:   '0.04em',
  },
  error: {
    fontSize:        '13px',
    color:           'var(--red)',
    margin:          0,
  },
  actions: {
    display:         'flex',
    gap:             '10px',
    marginTop:       '4px',
  },
  cancelBtn: {
    flex:            1,
    padding:         '14px',
    background:      'transparent',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-lg)',
    color:           'var(--text-secondary)',
    fontSize:        '15px',
    fontWeight:      '500',
    cursor:          'pointer',
  },
  logBtnFull: {
    flex:            2,
    padding:         '14px',
    background:'var(--accent)',
    border:          'none',
    borderRadius:    'var(--r-lg)',
    color:           'var(--text-inverse)',
    fontSize:        '15px',
    fontWeight:      '600',
    cursor:          'pointer',
  },
}