import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.jsx'
import { RingWithMacros } from '../shared/RingChart.jsx'
import StreakStrip from '../shared/StreakStrip.jsx'
import DayLog, { localDate } from '../log/DayLog.jsx'
import { getDayMacros } from '../db/db.js'
import { db } from '../db/indexedDB.js'
import { seedFoodDatabase } from '../food/FoodDB.js'
import { Skeleton, SkeletonCard, SkeletonRow } from '../shared/Skeleton.jsx'
import SyncStatus from '../shared/SyncStatus.jsx'

function normalizeDate(raw) {
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-CA')
}

// ─── Home ─────────────────────────────────────────────────────────────────────

function AvatarMenu({ user, logout }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position:'relative', flexShrink:0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width:'42px', height:'42px', borderRadius:'50%', background:'var(--text-primary)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight:'600', color:'var(--text-inverse)', marginTop:'4px' }}
      >
        {user?.avatarInitials || user?.name?.slice(0,2).toUpperCase()}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:50 }} />
          <div style={{ position:'absolute', right:0, top:'48px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', padding:'8px', zIndex:51, minWidth:'180px', boxShadow:'0 4px 16px rgba(0,0,0,0.1)' }}>
            <div style={{ padding:'8px 12px', fontSize:'13px', color:'var(--text-tertiary)', borderBottom:'0.5px solid var(--border-subtle)', marginBottom:'4px' }}>
              {user?.name}
            </div>
            <button
              style={{ width:'100%', padding:'10px 12px', background:'none', border:'none', textAlign:'left', fontSize:'14px', color:'var(--text-primary)', cursor:'pointer', borderRadius:'var(--r-md)' }}
              onClick={() => { setOpen(false); window.location.hash='#/onboarding' }}
            >
              👤 New Profile
            </button>
            <button
              style={{ width:'100%', padding:'10px 12px', background:'none', border:'none', textAlign:'left', fontSize:'14px', color:'var(--red)', cursor:'pointer', borderRadius:'var(--r-md)' }}
              onClick={() => { setOpen(false); logout() }}
            >
              👋 Log Out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function Home() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [totals,       setTotals]       = useState({ calories:0, protein:0, carbs:0, fat:0, fibre:0 })
  const [weight,       setWeight]       = useState(null)
  const [supplements,  setSupplements]  = useState([])
  const [suppDone,     setSuppDone]     = useState({})
  const [stepsData,    setStepsData]    = useState(null)
  const [refreshKey,   setRefreshKey]   = useState(0)
  const [greeting,     setGreeting]     = useState('')
  const [dateLabel,    setDateLabel]    = useState('')
  const [loading,      setLoading]      = useState(true)
  const [editingSteps,  setEditingSteps]  = useState(false)
  const [stepsInput,    setStepsInput]    = useState('')
  const [calInput,      setCalInput]      = useState('')
  const [syncing,       setSyncing]       = useState(false)
  const [syncMsg,       setSyncMsg]       = useState('')
  const [editingWeight, setEditingWeight] = useState(false)
  const [weightInput,   setWeightInput]   = useState('')
  const [weightUnit,    setWeightUnit]    = useState(() => localStorage.getItem('weightUnit') || 'lbs')

  const [today, setToday] = useState(() => localDate())
  const suppToggleLock = useRef(false)

  useEffect(() => {
    seedFoodDatabase()
    setGreeting(getGreeting())
    setDateLabel(getDateLabel())
  }, [])

  useEffect(() => {
    if (!user) return
    loadDashboard()
  }, [user, refreshKey])

  async function loadDashboard() {
    setLoading(true)
    const freshToday = localDate()
    setToday(freshToday)
    setGreeting(getGreeting())
    setDateLabel(getDateLabel())
    try {
      const macros = await getDayMacros(user.id, freshToday)
      setTotals(macros)

      const weights = await db.weightLog.where('userId').equals(user.id).toArray()
      if (weights.length) {
        // Deduplicate per date — keep newest, delete older duplicates
        const byDate = new Map()
        const toDelete = []
        for (const e of weights) {
          const cur = byDate.get(e.date)
          if (!cur || (e.updatedAt || '') >= (cur.updatedAt || '')) {
            if (cur) toDelete.push(cur.id)
            byDate.set(e.date, e)
          } else {
            toDelete.push(e.id)
          }
        }
        if (toDelete.length) {
          await db.weightLog.bulkDelete(toDelete)
          // Mark surviving records dirty so next sync overwrites the Supabase copy
          // (which still has the duplicates) with the deduplicated set
          const now = new Date().toISOString()
          for (const e of byDate.values()) {
            await db.weightLog.update(e.id, { dirty: 1, updatedAt: now }).catch(() => {})
          }
        }
        const latest = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))[0]
        if (latest) setWeight(latest.weightKg)
      }

      const supps = user.supplements || []
      setSupplements(supps)

      const suppLog = await db.supplementLog
        .where('[userId+date]')
        .equals([user.id, freshToday])
        .first()
      setSuppDone(suppLog?.done || {})

      const steps = await db.stepsLog
        .where('[userId+date]')
        .equals([user.id, freshToday])
        .first()
      setStepsData(steps || null)
    } finally {
      setLoading(false)
    }
  }

  async function toggleSupplement(name) {
    if (suppToggleLock.current) return
    suppToggleLock.current = true
    const done = { ...suppDone, [name]: !suppDone[name] }
    setSuppDone(done)
    try {
      const existing = await db.supplementLog
        .where('[userId+date]')
        .equals([user.id, today])
        .first()
      if (existing) {
        await db.supplementLog.update(existing.id, { done, dirty:1, updatedAt: new Date().toISOString() })
      } else {
        await db.supplementLog.add({ userId:user.id, date:today, done, dirty:1, updatedAt: new Date().toISOString() })
      }
    } finally {
      suppToggleLock.current = false
    }
  }

  function openWeightEdit() {
    if (weight) {
      const display = weightUnit === 'lbs' ? Math.round(weight * 2.20462 * 10) / 10 : weight
      setWeightInput(String(display))
    } else {
      setWeightInput('')
    }
    setEditingWeight(true)
  }

  async function saveWeight() {
    const val = parseFloat(weightInput)
    if (!val || isNaN(val)) return
    const wKg  = weightUnit === 'lbs' ? val * 0.453592 : val
    const wLbs = weightUnit === 'lbs' ? val : val * 2.20462
    const payload = {
      userId:    user.id,
      date:      today,
      weightKg:  Math.round(wKg  * 10) / 10,
      weightLbs: Math.round(wLbs * 10) / 10,
      note:      '',
      dirty:     1,
      updatedAt: new Date().toISOString(),
    }
    const existing = await db.weightLog.where('[userId+date]').equals([user.id, today]).first()
    if (existing) {
      await db.weightLog.update(existing.id, payload)
    } else {
      await db.weightLog.add(payload)
    }
    setWeight(Math.round(wKg * 10) / 10)
    setEditingWeight(false)
  }

  async function syncFromCloud() {
    if (!user?.healthSyncToken) return { ok: false, msg: 'No sync token — visit Settings → iPhone Health Sync first' }
    try {
      const { sbFetchHealthSync } = await import('../db/supabase.js')
      const data = await sbFetchHealthSync(user.healthSyncToken)
      if (!data?.steps || !data?.date) return { ok: false, msg: 'No data in cloud yet — run your shortcut first' }
      const dataDate = normalizeDate(data.date)
      if (!dataDate) return { ok: false, msg: 'Unrecognised date format from shortcut — check your setup' }
      const now = new Date().toISOString()
      const existing = await db.stepsLog.where('[userId+date]').equals([user.id, dataDate]).first()
      if (existing) {
        await db.stepsLog.update(existing.id, { steps: data.steps, caloriesBurned: data.cal || 0, source: 'health', dirty: 1, updatedAt: now })
      } else {
        await db.stepsLog.add({ userId: user.id, date: dataDate, steps: data.steps, caloriesBurned: data.cal || 0, source: 'health', dirty: 1, updatedAt: now })
      }
      // Only update home screen display if data is for today
      if (dataDate === today) {
        const updated = await db.stepsLog.where('[userId+date]').equals([user.id, today]).first()
        if (updated) setStepsData(updated)
        return { ok: true, msg: `Synced — ${Number(data.steps).toLocaleString()} steps` }
      }
      return { ok: false, msg: `Shortcut last ran on ${dataDate} — today's data not yet posted` }
    } catch (e) {
      return { ok: false, msg: `Sync error: ${e.message}` }
    }
  }

  async function syncFromClipboard() {
    setSyncing(true)
    setSyncMsg('')
    const { ok, msg } = await syncFromCloud()
    setSyncMsg(msg)
    if (ok) setTimeout(() => setEditingSteps(false), 1200)
    setSyncing(false)
  }

  function openStepsEdit() {
    setStepsInput(stepsData?.steps ? String(stepsData.steps) : '')
    setCalInput(stepsData?.caloriesBurned ? String(stepsData.caloriesBurned) : '')
    setSyncMsg('')
    setEditingSteps(true)
  }

  async function saveSteps() {
    const steps = parseInt(stepsInput) || 0
    const caloriesBurned = parseInt(calInput) || 0
    const now = new Date().toISOString()
    const existing = await db.stepsLog
      .where('[userId+date]')
      .equals([user.id, today])
      .first()
    if (existing) {
      await db.stepsLog.update(existing.id, { steps, caloriesBurned, dirty:1, updatedAt:now })
      setStepsData({ ...existing, steps, caloriesBurned })
    } else {
      const id = await db.stepsLog.add({ userId:user.id, date:today, steps, caloriesBurned, source:'manual', dirty:1, updatedAt:now })
      setStepsData({ id, userId:user.id, date:today, steps, caloriesBurned })
    }
    setEditingSteps(false)
  }

  function handleLogged() { setRefreshKey(k => k + 1) }

  useEffect(() => {
    window.addEventListener('nourish:food-logged', handleLogged)
    window.addEventListener('nourish:steps-synced', handleLogged)
    return () => {
      window.removeEventListener('nourish:food-logged', handleLogged)
      window.removeEventListener('nourish:steps-synced', handleLogged)
    }
  }, [])

  const suppCount = supplements.filter(s => suppDone[s]).length
  const goals     = user?.macroGoals || {}
  const stepGoal  = user?.stepGoal || 10000
  const stepPct   = stepsData?.steps ? Math.min(1, stepsData.steps / stepGoal) : 0

  if (loading) {
    return (
      <div style={styles.screen}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            <Skeleton width="80px" height="10px" radius="5px" />
            <Skeleton width="180px" height="22px" radius="8px" />
          </div>
          <Skeleton width="42px" height="42px" radius="50%" />
        </div>
        <SkeletonCard style={{ alignItems:'center', padding:'24px 16px' }}>
          <Skeleton width="160px" height="160px" radius="50%" />
          <SkeletonRow items={5} />
        </SkeletonCard>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
          <SkeletonCard style={{ gap:'8px' }}><Skeleton width="50px" height="10px" radius="5px" /><Skeleton width="80px" height="22px" radius="8px" /></SkeletonCard>
          <SkeletonCard style={{ gap:'8px' }}><Skeleton width="60px" height="10px" radius="5px" /><Skeleton width="90px" height="22px" radius="8px" /></SkeletonCard>
          <SkeletonCard style={{ gap:'8px' }}><Skeleton width="50px" height="10px" radius="5px" /><Skeleton width="80px" height="22px" radius="8px" /></SkeletonCard>
          <SkeletonCard style={{ gap:'8px' }}><Skeleton width="60px" height="10px" radius="5px" /><Skeleton width="90px" height="22px" radius="8px" /></SkeletonCard>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.screen}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'4px' }}>
        <div>
          <div style={styles.dateLabel}>{dateLabel}</div>
          <div style={styles.greeting}>{greeting}, <span style={styles.greetingName}>{user?.name}</span></div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
          <SyncStatus />
          <AvatarMenu user={user} logout={logout} />
        </div>
      </div>

      {/* Calorie ring + macros */}
      <RingWithMacros totals={totals} goals={goals} />

      {/* 2×2 Stat grid */}
      <div style={styles.statGrid}>
        <button style={{ ...styles.statCard, ...styles.statCardBtn }} onClick={openWeightEdit}>
          <div style={styles.statLabel}>Weight</div>
          {weight ? (
            <div style={styles.statVal}>
              {weightUnit === 'lbs' ? Math.round(weight * 2.20462 * 10) / 10 : weight}
              <span style={styles.statUnit}> {weightUnit}</span>
            </div>
          ) : (
            <div style={styles.statEmpty}>Tap to log</div>
          )}
        </button>

        <button style={{ ...styles.statCard, ...styles.statCardBtn }} onClick={openStepsEdit}>
          <div style={styles.statLabel}>Steps</div>
          {stepsData?.steps ? (
            <>
              <div style={styles.statVal}>{stepsData.steps.toLocaleString()}</div>
              <div style={styles.progressTrack}>
                <div style={{ ...styles.progressFill, width: `${stepPct * 100}%`, background: stepPct >= 1 ? 'var(--accent)' : '#4ecdc4' }} />
              </div>
              <div style={styles.progressLabel}>
                {stepPct >= 1 ? 'Goal reached!' : `${stepGoal.toLocaleString()} goal`}
              </div>
            </>
          ) : (
            <div style={styles.statEmpty}>Tap to log</div>
          )}
        </button>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Workout</div>
          <WorkoutStat userId={user?.id} date={today} />
        </div>

        <button style={{ ...styles.statCard, ...styles.statCardBtn }} onClick={openStepsEdit}>
          <div style={styles.statLabel}>Cal Burned</div>
          {stepsData?.caloriesBurned ? (
            <div style={styles.statVal}>{stepsData.caloriesBurned}<span style={styles.statUnit}> kcal</span></div>
          ) : (
            <div style={styles.statEmpty}>Tap to add</div>
          )}
        </button>
      </div>


      {/* Supplements */}
      {supplements.length > 0 && (
        <div style={styles.suppCard}>
          <div style={styles.suppCardHeader}>
            <span style={styles.suppCardTitle}>Supplements</span>
            <span style={styles.suppCardCount}>{suppCount} / {supplements.length}</span>
          </div>
          <div style={styles.suppGrid}>
            {supplements.map(supp => (
              <button
                key={supp}
                style={{ ...styles.suppChip, ...(suppDone[supp] ? styles.suppChipDone : {}) }}
                onClick={() => toggleSupplement(supp)}
              >
                {suppDone[supp] && <span style={styles.suppTick}>✓</span>}
                {supp}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Streak strip */}
      <StreakStrip goals={goals} />

      {/* Day log */}
      <SectionHeader title="Today's Log" />
      <DayLog date={today} onTotalsChange={setTotals} />

      {/* AI Chat button */}
      <button style={styles.chatBtn} onClick={() => navigate('/chat')}>
        <span style={{ fontSize:'22px' }}>✨</span>
        <div style={{ display:'flex', flexDirection:'column', gap:'2px', textAlign:'left' }}>
          <span style={{ fontSize:'15px', fontWeight:'600', color:'var(--text-primary)' }}>Ask AI about your meals</span>
          <span style={{ fontSize:'12px', color:'var(--text-tertiary)' }}>Get suggestions based on remaining macros</span>
        </div>
      </button>

      <div style={{ height:'24px' }} />


      {createPortal(
        <>
          {/* Weight sheet */}
          {editingWeight && (
            <div style={styles.sheetOverlay} onClick={() => setEditingWeight(false)}>
              <div style={styles.sheet} onClick={e => e.stopPropagation()}>
                <div style={styles.sheetHandle} />
                <h3 style={styles.sheetTitle}>Log Weight</h3>

                <div style={{ display:'flex', gap:'12px', alignItems:'flex-end' }}>
                  <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
                    <label style={lbl}>Weight</label>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <input
                        style={{ ...styles.input, fontSize:'28px', fontWeight:'300', letterSpacing:'-0.02em' }}
                        type="text"
                        inputMode="decimal"
                        placeholder={weightUnit === 'lbs' ? '175' : '80'}
                        value={weightInput}
                        onChange={e => setWeightInput(e.target.value)}
                        autoFocus
                      />
                      <span style={{ fontSize:'16px', color:'var(--text-tertiary)', fontWeight:'500', flexShrink:0 }}>{weightUnit}</span>
                    </div>
                  </div>
                  <div style={{ display:'flex', background:'var(--bg-elevated)', borderRadius:'var(--r-md)', padding:'3px', gap:'2px', marginBottom:'1px', flexShrink:0 }}>
                    {['lbs','kg'].map(u => (
                      <button
                        key={u}
                        style={{ padding:'6px 12px', background: weightUnit === u ? 'var(--bg-surface)' : 'transparent', border:'none', borderRadius:'9px', fontSize:'13px', fontWeight:'500', color: weightUnit === u ? 'var(--text-primary)' : 'var(--text-secondary)', cursor:'pointer' }}
                        onClick={() => { setWeightUnit(u); localStorage.setItem('weightUnit', u) }}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={styles.sheetActions}>
                  <button style={styles.cancelBtn} onClick={() => setEditingWeight(false)}>Cancel</button>
                  <button style={styles.saveBtn} onClick={saveWeight}>Save</button>
                </div>
              </div>
            </div>
          )}

          {/* Steps sheet */}
          {editingSteps && (
            <div style={styles.sheetOverlay} onClick={() => setEditingSteps(false)}>
              <div style={styles.sheet} onClick={e => e.stopPropagation()}>
                <div style={styles.sheetHandle} />
                <h3 style={styles.sheetTitle}>Today's Activity</h3>

                <button
                  style={{ ...styles.syncBtn, opacity: syncing ? 0.6 : 1 }}
                  onClick={syncFromClipboard}
                  disabled={syncing}
                >
                  {syncing ? 'Checking cloud…' : '⟳  Refresh from cloud'}
                </button>
                {syncMsg ? (
                  <p style={{ fontSize:'13px', color: syncMsg.startsWith('Synced') ? 'var(--accent)' : 'var(--red)', margin:'-4px 0 0', lineHeight:'1.4' }}>{syncMsg}</p>
                ) : (
                  <p style={styles.sheetSub}>Your shortcut sends steps to the cloud automatically. Tap Refresh to pull the latest, or enter manually below.</p>
                )}

                <div style={styles.fieldRow}>
                  <div style={styles.field}>
                    <label style={lbl}>Steps</label>
                    <input
                      style={styles.input}
                      type="number"
                      inputMode="numeric"
                      placeholder="e.g. 8000"
                      value={stepsInput}
                      onChange={e => setStepsInput(e.target.value)}
                    />
                  </div>
                  <div style={styles.field}>
                    <label style={lbl}>Calories Burned</label>
                    <input
                      style={styles.input}
                      type="number"
                      inputMode="numeric"
                      placeholder="e.g. 350"
                      value={calInput}
                      onChange={e => setCalInput(e.target.value)}
                    />
                  </div>
                </div>

                <div style={styles.sheetActions}>
                  <button style={styles.cancelBtn} onClick={() => setEditingSteps(false)}>Cancel</button>
                  <button style={styles.saveBtn} onClick={saveSteps}>Save</button>
                </div>
              </div>
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  )
}

// ─── WorkoutStat ──────────────────────────────────────────────────────────────

function WorkoutStat({ userId, date }) {
  const [workout, setWorkout] = useState(null)

  useEffect(() => {
    if (!userId || !date) return
    db.workoutLogs
      .where('[userId+date]')
      .equals([userId, date])
      .filter(w => w.status === 'complete')
      .first()
      .then(setWorkout)
  }, [userId, date])

  if (!workout) return <div style={styles.statEmpty}>Rest day</div>
  return <div style={styles.statVal}><span style={{ fontSize:'16px' }}>{workout.name || 'Session'}</span></div>
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ title, right }) {
  return (
    <div style={styles.sectionHeader}>
      <span style={styles.sectionTitle}>{title}</span>
      {right && <span style={styles.sectionRight}>{right}</span>}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getDateLabel() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
  })
}

const lbl = { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'6px', display:'block' }

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  screen: {
    padding:       '20px 16px 0',
    display:       'flex',
    flexDirection: 'column',
    gap:           '12px',
    minHeight:     '100%',
    animation:     'pageIn 0.25s var(--ease-out) both',
  },
  dateLabel: {
    fontSize:      '11px',
    fontWeight:    '500',
    color:         'var(--text-tertiary)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom:  '4px',
  },
  greeting: {
    fontSize:   '22px',
    fontWeight: '300',
    color:      'var(--text-secondary)',
    letterSpacing: '-0.02em',
    fontFamily: 'var(--font-serif)',
    fontStyle:  'italic',
  },
  greetingName: {
    color:      'var(--text-primary)',
    fontWeight: '400',
  },
  statGrid: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:                 '8px',
  },
  statCard: {
    background:   'var(--bg-surface)',
    border:       '0.5px solid var(--border-subtle)',
    borderRadius: 'var(--r-xl)',
    padding:      '14px 16px',
  },
  statCardBtn: {
    cursor:      'pointer',
    textAlign:   'left',
    WebkitTapHighlightColor: 'transparent',
  },
  statLabel: {
    fontSize:      '10px',
    fontWeight:    '600',
    color:         'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom:  '8px',
  },
  statVal: {
    fontSize:     '22px',
    fontWeight:   '300',
    color:        'var(--text-primary)',
    letterSpacing:'-0.03em',
    lineHeight:   '1.1',
  },
  statUnit: {
    fontSize:   '13px',
    color:      'var(--text-tertiary)',
    fontWeight: '400',
  },
  statEmpty: {
    fontSize:  '13px',
    color:     'var(--text-tertiary)',
    fontStyle: 'italic',
  },
  progressTrack: {
    height:       '4px',
    background:   'var(--border-subtle)',
    borderRadius: '2px',
    overflow:     'hidden',
    marginTop:    '10px',
  },
  progressFill: {
    height:       '100%',
    borderRadius: '2px',
    transition:   'width 0.4s ease',
  },
  progressLabel: {
    fontSize:   '10px',
    color:      'var(--text-tertiary)',
    marginTop:  '4px',
  },
  sectionHeader: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingLeft:    '2px',
  },
  sectionTitle: {
    fontSize:      '10px',
    fontWeight:    '700',
    color:         'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  sectionRight: {
    fontSize:   '12px',
    color:      'var(--accent)',
    fontWeight: '500',
  },
  suppCard: {
    background:   'var(--bg-surface)',
    border:       '0.5px solid var(--border-subtle)',
    borderRadius: 'var(--r-xl)',
    padding:      '10px 14px 12px',
    display:      'flex',
    flexDirection:'column',
    gap:          '8px',
  },
  suppCardHeader: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  suppCardTitle: {
    fontSize:      '10px',
    fontWeight:    '700',
    color:         'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  suppCardCount: {
    fontSize:   '12px',
    color:      'var(--accent)',
    fontWeight: '500',
  },
  suppGrid: {
    display:  'flex',
    flexWrap: 'wrap',
    gap:      '6px',
  },
  suppChip: {
    padding:      '5px 11px',
    background:   'var(--bg-elevated)',
    border:       '1px solid var(--border-default)',
    borderRadius: 'var(--r-full)',
    fontSize:     '12px',
    fontWeight:   '500',
    color:        'var(--text-secondary)',
    cursor:       'pointer',
    display:      'flex',
    alignItems:   'center',
    gap:          '4px',
    WebkitTapHighlightColor: 'transparent',
  },
  suppChipDone: {
    background:  'var(--accent-dim)',
    borderColor: 'var(--accent)',
    color:       'var(--accent)',
    fontWeight:  '600',
  },
  suppTick: {
    fontSize:   '10px',
    fontWeight: '700',
  },
  chatBtn: {
    display:      'flex',
    alignItems:   'center',
    gap:          '12px',
    width:        '100%',
    padding:      '14px 16px',
    background:   'var(--bg-surface)',
    border:       '0.5px solid var(--border-subtle)',
    borderRadius: 'var(--r-xl)',
    cursor:       'pointer',
  },
  // Steps edit bottom sheet
  sheetOverlay: {
    position:       'fixed',
    inset:          0,
    background:     'rgba(0,0,0,0.45)',
    zIndex:         200,
    display:        'flex',
    alignItems:     'flex-end',
  },
  sheet: {
    width:           '100%',
    background:      'var(--bg-surface)',
    borderRadius:    'var(--r-xl) var(--r-xl) 0 0',
    padding:         '12px 20px 36px',
    display:         'flex',
    flexDirection:   'column',
    gap:             '16px',
  },
  sheetHandle: {
    width:        '36px',
    height:       '4px',
    borderRadius: '2px',
    background:   'var(--border-default)',
    margin:       '0 auto 4px',
  },
  sheetTitle: {
    fontSize:   '18px',
    fontWeight: '600',
    color:      'var(--text-primary)',
    margin:     0,
    letterSpacing:'-0.02em',
  },
  sheetSub: {
    fontSize:   '13px',
    color:      'var(--text-tertiary)',
    margin:     '-8px 0 0',
    lineHeight: '1.4',
  },
  fieldRow: {
    display: 'flex',
    gap:     '12px',
  },
  field: {
    flex:           1,
    display:        'flex',
    flexDirection:  'column',
  },
  input: {
    padding:      '12px 14px',
    background:   'var(--bg-base)',
    border:       '1px solid var(--border-default)',
    borderRadius: 'var(--r-lg)',
    fontSize:     '16px',
    color:        'var(--text-primary)',
    outline:      'none',
    width:        '100%',
    boxSizing:    'border-box',
  },
  syncBtn: {
    padding:      '13px',
    background:   'var(--accent-dim)',
    border:       '1px solid var(--accent)',
    borderRadius: 'var(--r-lg)',
    fontSize:     '15px',
    fontWeight:   '600',
    color:        'var(--accent)',
    cursor:       'pointer',
    width:        '100%',
  },
  sheetActions: {
    display: 'flex',
    gap:     '10px',
  },
  cancelBtn: {
    flex:         1,
    padding:      '14px',
    background:   'var(--bg-base)',
    border:       '1px solid var(--border-default)',
    borderRadius: 'var(--r-lg)',
    fontSize:     '15px',
    fontWeight:   '600',
    color:        'var(--text-secondary)',
    cursor:       'pointer',
  },
  saveBtn: {
    flex:         2,
    padding:      '14px',
    background:   'var(--accent)',
    border:       'none',
    borderRadius: 'var(--r-lg)',
    fontSize:     '15px',
    fontWeight:   '600',
    color:        '#fff',
    cursor:       'pointer',
  },
}
