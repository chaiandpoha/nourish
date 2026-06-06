import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { RingWithMacros } from '../shared/RingChart.jsx'
import StreakStrip from '../shared/StreakStrip.jsx'
import DayLog, { localDate } from '../log/DayLog.jsx'
import { getDayMacros } from '../db/db.js'
import { db } from '../db/indexedDB.js'
import { seedFoodDatabase } from '../food/FoodDB.js'
import MealChat from '../chat/MealChat.jsx'
import { Skeleton, SkeletonCard, SkeletonRow } from '../shared/Skeleton.jsx'
import WaterTracker from '../shared/WaterTracker.jsx'
import SyncStatus from '../shared/SyncStatus.jsx'

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
  const [totals,       setTotals]       = useState({ calories:0, protein:0, carbs:0, fat:0, fibre:0 })
  const [weight,       setWeight]       = useState(null)
  const [supplements,  setSupplements]  = useState([])
  const [suppDone,     setSuppDone]     = useState({})
  const [stepsData,    setStepsData]    = useState(null)
  const [refreshKey,   setRefreshKey]   = useState(0)
  const [showChat,     setShowChat]     = useState(false)
  const [greeting,     setGreeting]     = useState('')
  const [dateLabel,    setDateLabel]    = useState('')
  const [loading,      setLoading]      = useState(true)
  const [editingSteps, setEditingSteps] = useState(false)
  const [stepsInput,   setStepsInput]   = useState('')
  const [calInput,     setCalInput]     = useState('')

  const today = localDate()

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
    try {
      const macros = await getDayMacros(user.id, today)
      setTotals(macros)

      const weights = await db.weightLog
        .where('[userId+date]')
        .between([user.id, '2000-01-01'], [user.id, today], true, true)
        .toArray()
      if (weights.length) {
        const latest = weights.sort((a,b) => b.date.localeCompare(a.date))[0]
        setWeight(latest.weightKg)
      }

      const supps = user.supplements || []
      setSupplements(supps)

      const suppLog = await db.supplementLog
        .where('[userId+date]')
        .equals([user.id, today])
        .first()
      setSuppDone(suppLog?.done || {})

      const steps = await db.stepsLog
        .where('[userId+date]')
        .equals([user.id, today])
        .first()
      setStepsData(steps || null)
    } finally {
      setLoading(false)
    }
  }

  async function toggleSupplement(name) {
    const done = { ...suppDone, [name]: !suppDone[name] }
    setSuppDone(done)
    const existing = await db.supplementLog
      .where('[userId+date]')
      .equals([user.id, today])
      .first()
    if (existing) {
      await db.supplementLog.update(existing.id, { done, dirty:1, updatedAt: new Date().toISOString() })
    } else {
      await db.supplementLog.add({ userId:user.id, date:today, done, dirty:1, updatedAt: new Date().toISOString() })
    }
  }

  function openStepsEdit() {
    setStepsInput(stepsData?.steps ? String(stepsData.steps) : '')
    setCalInput(stepsData?.caloriesBurned ? String(stepsData.caloriesBurned) : '')
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
    return () => window.removeEventListener('nourish:food-logged', handleLogged)
  }, [])

  const suppCount = supplements.filter(s => suppDone[s]).length
  const goals     = user?.macroGoals || {}
  const stepGoal  = user?.stepGoal || 10000
  const stepPct   = stepsData?.steps ? Math.min(1, stepsData.steps / stepGoal) : 0

  if (showChat) return <MealChat onClose={() => setShowChat(false)} />

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
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Weight</div>
          {weight ? (
            <div style={styles.statVal}>{weight}<span style={styles.statUnit}> kg</span></div>
          ) : (
            <div style={styles.statEmpty}>Not logged</div>
          )}
        </div>

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
            <div style={styles.statEmpty}>Tap to add</div>
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

      {/* Water tracker */}
      <WaterTracker />

      {/* Supplements */}
      {supplements.length > 0 && (
        <>
          <SectionHeader
            title="Supplements"
            right={`${suppCount} / ${supplements.length}`}
          />
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
        </>
      )}

      {/* Streak strip */}
      <StreakStrip goals={goals} />

      {/* Day log */}
      <SectionHeader title="Today's Log" />
      <DayLog date={today} onTotalsChange={setTotals} />

      {/* AI Chat button */}
      <button style={styles.chatBtn} onClick={() => setShowChat(true)}>
        <span style={{ fontSize:'22px' }}>✨</span>
        <div style={{ display:'flex', flexDirection:'column', gap:'2px', textAlign:'left' }}>
          <span style={{ fontSize:'15px', fontWeight:'600', color:'var(--text-primary)' }}>Ask AI about your meals</span>
          <span style={{ fontSize:'12px', color:'var(--text-tertiary)' }}>Get suggestions based on remaining macros</span>
        </div>
      </button>

      <div style={{ height:'24px' }} />

      {/* Steps edit sheet */}
      {editingSteps && (
        <div style={styles.sheetOverlay} onClick={() => setEditingSteps(false)}>
          <div style={styles.sheet} onClick={e => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <h3 style={styles.sheetTitle}>Today's Activity</h3>
            <p style={styles.sheetSub}>Enter manually or set up auto-sync via iPhone Shortcuts</p>

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
                  autoFocus
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
  suppGrid: {
    display:   'flex',
    flexWrap:  'wrap',
    gap:       '8px',
  },
  suppChip: {
    padding:    '8px 14px',
    background: 'var(--bg-surface)',
    border:     '1px solid var(--border-default)',
    borderRadius: 'var(--r-full)',
    fontSize:   '13px',
    fontWeight: '500',
    color:      'var(--text-secondary)',
    cursor:     'pointer',
    display:    'flex',
    alignItems: 'center',
    gap:        '5px',
    WebkitTapHighlightColor: 'transparent',
  },
  suppChipDone: {
    background:  'var(--accent-dim)',
    borderColor: 'var(--accent)',
    color:       'var(--accent)',
    fontWeight:  '600',
  },
  suppTick: {
    fontSize:   '11px',
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
