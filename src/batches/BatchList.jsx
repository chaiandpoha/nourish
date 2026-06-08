import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { calcPortionMacros } from './batchCalc.js'
import { addFoodLogEntry } from '../db/db.js'
import { sbFetchBatches, sbCloseBatch } from '../db/supabase.js'
import BatchBuilder from './BatchBuilder.jsx'
import { localDate } from '../log/DayLog.jsx'

export default function BatchList({ onLogged }) {
  const [batches,  setBatches]  = useState([])
  const [screen,   setScreen]   = useState('list')
  const [selected, setSelected] = useState(null)
  const [editing,  setEditing]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const { user } = useAuth()

  useEffect(() => { loadBatches() }, [user])

  useEffect(() => {
    const onFocus = () => loadBatches()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user])

  async function loadBatches() {
    if (!user) return
    try {
      const remote = await sbFetchBatches(user.householdId)
      // Safe merge: don't overwrite local batches that have ingredients when remote doesn't
      const localRecords = await db.batches.bulkGet(remote.map(b => b.id))
      const toSave = remote.filter((r, i) => {
        const local = localRecords[i]
        if (!local) return true
        const localHasIng  = Array.isArray(local.ingredients)  && local.ingredients.length  > 0
        const remoteHasIng = Array.isArray(r.ingredients) && r.ingredients.length > 0
        return !(localHasIng && !remoteHasIng)
      })
      if (toSave.length) await db.batches.bulkPut(toSave)
      // Display from local DB — includes offline-created batches Supabase doesn't have yet
      const localAll = await db.batches.where('closed').equals(0).toArray()
      localAll.sort((a, b) => {
        if (a.shared && !b.shared) return -1
        if (!a.shared && b.shared) return 1
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
      setBatches(localAll)
    } catch {
      // Offline fallback
      const all = await db.batches.where('closed').equals(0).toArray()
      setBatches(all)
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
    await sbCloseBatch(batchId).catch(e => console.warn('Supabase:', e))
    await db.batches.update(batchId, { closed: 1, updatedAt: new Date().toISOString() })
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
    </div>
  )
}

// ─── BatchCard ────────────────────────────────────────────────────────────────

function BatchCard({ batch, onLog, onEdit, onClose }) {
  const [showClose, setShowClose] = useState(false)
  const daysOld = Math.floor(
    (Date.now() - new Date(batch.createdAt)) / (1000 * 60 * 60 * 24)
  )

  return (
    <div style={styles.card}>
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
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:'6px', flexShrink:0 }}>
          <button style={styles.logBtn} onClick={onLog}>Log portion</button>
          <button style={styles.editBtn} onClick={onEdit}>Edit</button>
        </div>
      </div>

      <div style={styles.cardFooter}>
        {!showClose ? (
          <button
            style={styles.closeLink}
            onClick={() => setShowClose(true)}
          >
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
    background:      'var(--text-primary)',
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
    background:      'var(--text-primary)',
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
    background:      'var(--text-primary)',
    color:           'var(--text-inverse)',
    borderColor:     'var(--text-primary)',
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
    background:      'var(--text-primary)',
    border:          'none',
    borderRadius:    'var(--r-lg)',
    color:           'var(--text-inverse)',
    fontSize:        '15px',
    fontWeight:      '600',
    cursor:          'pointer',
  },
}