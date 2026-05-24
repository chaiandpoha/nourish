import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { RingWithMacros } from '../shared/RingChart.jsx'
import StreakStrip from '../shared/StreakStrip.jsx'
import MealEntry from '../log/MealEntry.jsx'
import DayLog from '../log/DayLog.jsx'
import { getDayMacros } from '../db/db.js'
import { db } from '../db/indexedDB.js'
import { seedFoodDatabase } from '../food/FoodDB.js'
import MealChat from '../chat/MealChat.jsx'
import WeeklySummary from '../progress/WeeklySummary.jsx'

// ─── Home ─────────────────────────────────────────────────────────────────────
// Main dashboard screen

export default function Home() {
  const { user, lock, logout } = useAuth()
  const [totals,      setTotals]      = useState({ calories:0, protein:0, carbs:0, fat:0, fibre:0 })
  const [weight,      setWeight]      = useState(null)
  const [supplements, setSupplements] = useState([])
  const [suppDone,    setSuppDone]    = useState({})
  const [batches,     setBatches]     = useState([])
  const [refreshKey,  setRefreshKey]  = useState(0)
  const [showChat,    setShowChat]    = useState(false)
  const [greeting,    setGreeting]    = useState('')
  const [dateLabel,   setDateLabel]   = useState('')

  const today = new Date().toISOString().slice(0, 10)

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
    // Macros
    const macros = await getDayMacros(user.id, today)
    setTotals(macros)

    // Latest weight
    const weights = await db.weightLog
      .where('[userId+date]')
      .between([user.id, '2000-01-01'], [user.id, today], true, true)
      .toArray()
    if (weights.length) {
      const latest = weights.sort((a,b) => b.date.localeCompare(a.date))[0]
      setWeight(latest.weightKg)
    }

    // Supplements
    const supps = user.supplements || []
    setSupplements(supps)

    // Load today's supplement log
    const suppLog = await db.supplementLog
      .where('[userId+date]')
      .equals([user.id, today])
      .first()
    setSuppDone(suppLog?.done || {})

    // Active batches
    const allBatches = await db.batches
      .where('closed').equals(0)
      .toArray()
    setBatches(allBatches.slice(0, 3))
  }

  async function toggleSupplement(name) {
    const done = { ...suppDone, [name]: !suppDone[name] }
    setSuppDone(done)

    // Persist to IndexedDB
    const existing = await db.supplementLog
      .where('[userId+date]')
      .equals([user.id, today])
      .first()

    if (existing) {
      await db.supplementLog.update(existing.id, {
        done,
        dirty:     1,
        updatedAt: new Date().toISOString(),
      })
    } else {
      await db.supplementLog.add({
        userId:    user.id,
        date:      today,
        done,
        dirty:     1,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  function handleLogged() {
    setRefreshKey(k => k + 1)
  }

  const suppCount    = supplements.filter(s => suppDone[s]).length
  const goals        = user?.macroGoals || {}

  if (showChat) return <MealChat onClose={() => setShowChat(false)} />

  return (
    <div style={styles.screen}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'4px' }}>
        <div>
          <div style={styles.dateLabel}>{dateLabel}</div>
          <div style={styles.greeting}>{greeting}, <span style={styles.greetingName}>{user?.name}</span></div>
        </div>
        <button
          onClick={() => { sessionStorage.setItem('nourish_logged_out', 'true'); logout() }}
          style={{ width:'42px', height:'42px', borderRadius:'50%', background:'var(--text-primary)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', fontWeight:'600', color:'var(--text-inverse)', flexShrink:0, marginTop:'4px' }}
        >
          {user?.avatarInitials || user?.name?.slice(0,2).toUpperCase()}
        </button>
      </div>

      {/* Calorie ring + macros */}
      <RingWithMacros totals={totals} goals={goals} />

      {/* Stat cards */}
      <div style={styles.statGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Weight</div>
          {weight ? (
            <>
              <div style={styles.statVal}>
                {weight}
                <span style={styles.statUnit}> kg</span>
              </div>
            </>
          ) : (
            <div style={styles.statEmpty}>Not logged</div>
          )}
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Workout</div>
          <WorkoutStat userId={user?.id} date={today} />
        </div>
      </div>

      {/* Active batches */}
      {batches.length > 0 && (
        <>
          <SectionHeader title="Active Batches" />
          {batches.map(batch => (
            <div key={batch.id} style={styles.batchCard}>
              <div>
                <div style={styles.batchName}>{batch.name}</div>
                <div style={styles.batchMeta}>
                  {batch.macrosPer100g?.calories || 0} kcal ·{' '}
                  {batch.macrosPer100g?.protein  || 0}g P per 100g
                </div>
              </div>
              {batch.shared && (
                <div style={styles.sharedTag}>Shared</div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Supplements */}
      {supplements.length > 0 && (
        <>
          <SectionHeader
            title="Supplements"
            right={`${suppCount} of ${supplements.length} today`}
          />
          <div style={styles.suppCard}>
            {supplements.map((supp, i) => (
              <button
                key={supp}
                style={{
                  ...styles.suppRow,
                  ...(i === supplements.length - 1 ? styles.suppRowLast : {})
                }}
                onClick={() => toggleSupplement(supp)}
              >
                <span style={styles.suppName}>{supp}</span>
                <div style={{
                  ...styles.suppCheck,
                  ...(suppDone[supp] ? styles.suppCheckDone : styles.suppCheckTodo)
                }}>
                  {suppDone[supp] ? '✓' : ''}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Streak strip */}
      <StreakStrip goals={goals} />

      {/* Day log */}
      <SectionHeader title="Today's Log" />
      <DayLog
        date={today}
        onTotalsChange={setTotals}
      />

      {/* Weekly Summary */}
      <WeeklySummary />

      {/* AI Chat button */}
      <button style={styles.chatBtn} onClick={() => setShowChat(true)}>
        <span style={{ fontSize:'22px' }}>✨</span>
        <div style={{ display:'flex', flexDirection:'column', gap:'2px', textAlign:'left' }}>
          <span style={{ fontSize:'15px', fontWeight:'600', color:'var(--text-primary)' }}>Ask AI about your meals</span>
          <span style={{ fontSize:'12px', color:'var(--text-tertiary)' }}>Get suggestions based on remaining macros</span>
        </div>
      </button>

      {/* Bottom padding */}
      <div style={{ height: '24px' }} />

      {/* Floating log button */}
      <MealEntry date={today} onLogged={handleLogged} />
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

  if (!workout) {
    return <div style={styles.statEmpty}>Rest day</div>
  }
  return (
    <div style={styles.statVal} >
      <span style={{ fontSize:'16px' }}>{workout.name || 'Session'}</span>
    </div>
  )
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  screen: {
    padding:       '20px 16px 0',
    display:       'flex',
    flexDirection: 'column',
    gap:           '12px',
    minHeight:     '100%',
  },
  header: {
    display:         'flex',
    alignItems:      'flex-start',
    justifyContent:  'space-between',
    marginBottom:    '4px',
  },
  dateLabel: {
    fontSize:        '11px',
    fontWeight:      '500',
    color:           'var(--text-tertiary)',
    letterSpacing:   '0.06em',
    textTransform:   'uppercase',
    marginBottom:    '4px',
  },
  greeting: {
    fontSize:        '22px',
    fontWeight:      '300',
    color:           'var(--text-secondary)',
    letterSpacing:   '-0.02em',
    fontFamily:      'var(--font-serif)',
    fontStyle:       'italic',
  },
  greetingName: {
    color:           'var(--text-primary)',
    fontWeight:      '400',
  },
  headerRight: {
    display:         'flex',
    alignItems:      'center',
    gap:             '10px',
    marginTop:       '4px',
  },
  avatarBtn: {
    background:  'none',
    border:      'none',
    cursor:      'pointer',
    padding:     0,
    borderRadius:'50%',
  },
  avatar: {
    width:           '38px',
    height:          '38px',
    borderRadius:    '50%',
    background:      'var(--text-primary)',
    color:           'var(--text-inverse)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        '13px',
    fontWeight:      '600',
    letterSpacing:   '0.04em',
    flexShrink:      0,
  },
  statGrid: {
    display:         'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:             '8px',
  },
  statCard: {
    background:      'var(--bg-surface)',
    border:          '0.5px solid var(--border-subtle)',
    borderRadius:    'var(--r-xl)',
    padding:         '14px 16px',
  },
  statLabel: {
    fontSize:        '10px',
    fontWeight:      '600',
    color:           'var(--text-tertiary)',
    textTransform:   'uppercase',
    letterSpacing:   '0.08em',
    marginBottom:    '8px',
  },
  statVal: {
    fontSize:        '22px',
    fontWeight:      '300',
    color:           'var(--text-primary)',
    letterSpacing:   '-0.03em',
    lineHeight:      '1.1',
  },
  statUnit: {
    fontSize:        '13px',
    color:           'var(--text-tertiary)',
    fontWeight:      '400',
  },
  statEmpty: {
    fontSize:        '14px',
    color:           'var(--text-tertiary)',
    fontStyle:       'italic',
  },
  sectionHeader: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingLeft:     '2px',
  },
  sectionTitle: {
    fontSize:        '10px',
    fontWeight:      '700',
    color:           'var(--text-tertiary)',
    textTransform:   'uppercase',
    letterSpacing:   '0.1em',
  },
  sectionRight: {
    fontSize:        '12px',
    color:           'var(--accent)',
    fontWeight:      '500',
  },
  batchCard: {
    background:      'var(--bg-surface)',
    border:          '0.5px solid var(--border-subtle)',
    borderRadius:    'var(--r-lg)',
    padding:         '13px 15px',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  batchName: {
    fontSize:        '15px',
    fontWeight:      '600',
    color:           'var(--text-primary)',
    letterSpacing:   '-0.01em',
    fontStyle:       'italic',
    fontFamily:      'var(--font-serif)',
  },
  batchMeta: {
    fontSize:        '12px',
    color:           'var(--text-tertiary)',
    marginTop:       '2px',
  },
  sharedTag: {
    fontSize:        '10px',
    fontWeight:      '600',
    background:      'var(--accent-dim)',
    color:           'var(--accent)',
    padding:         '3px 10px',
    borderRadius:    'var(--r-full)',
    letterSpacing:   '0.05em',
    textTransform:   'uppercase',
  },
  suppCard: {
    background:      'var(--bg-surface)',
    border:          '0.5px solid var(--border-subtle)',
    borderRadius:    'var(--r-xl)',
    overflow:        'hidden',
  },
  suppRow: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    width:           '100%',
    padding:         '13px 16px',
    background:      'transparent',
    border:          'none',
    borderBottom:    '0.5px solid var(--border-subtle)',
    cursor:          'pointer',
    textAlign:       'left',
  },
  suppRowLast: {
    borderBottom:    'none',
  },
  suppName: {
    fontSize:        '14px',
    color:           'var(--text-primary)',
    fontWeight:      '400',
  },
  suppCheck: {
    width:           '24px',
    height:          '24px',
    borderRadius:    '50%',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        '13px',
    fontWeight:      '700',
    flexShrink:      0,
    transition:      'all 0.15s',
  },
  suppCheckDone: {
    background:      'var(--accent-dim)',
    color:           'var(--accent)',
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
  suppCheckTodo: {
    border:          '1.5px solid var(--border-default)',
    background:      'transparent',
    color:           'transparent',
  },
}