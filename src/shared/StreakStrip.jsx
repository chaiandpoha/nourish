import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/db.js'
import { localDate } from '../log/DayLog.jsx'

// ─── StreakStrip ──────────────────────────────────────────────────────────────
// 7-day glanceable streak — shows protein target hit, workout logged
// Green dot = protein hit, workout dot = session logged, dash = nothing

export default function StreakStrip({ goals }) {
  const [days,    setDays]    = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    loadWeek()
  }, [user])

  async function loadWeek() {
    const today = new Date()
    const week  = []

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const date = localDate(d)
      const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)

      // Get food logs for this day
      const logs = await db.foodLogs
        .where('[userId+date]')
        .equals([user.id, date])
        .toArray()

      // Get workout logs for this day
      const workouts = await db.workoutLogs
        .where('[userId+date]')
        .equals([user.id, date])
        .toArray()

      // Sum protein
      const protein = logs.reduce((sum, l) => sum + (l.protein || 0), 0)
      const proteinGoal = goals?.protein || user?.macroGoals?.protein || 150

      week.push({
        date,
        label,
        isToday:      i === 0,
        hasLogs:      logs.length > 0,
        proteinHit:   protein >= proteinGoal,
        hasWorkout:   workouts.length > 0,
        protein:      Math.round(protein),
      })
    }

    setDays(week)
    setLoading(false)
  }

  if (loading) return <div style={styles.loading} />

  // Count current streak — consecutive days with logs ending today
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].hasLogs) streak++
    else break
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>This Week</span>
        {streak > 0 && (
          <span style={styles.streakBadge}>
            {streak} day streak
          </span>
        )}
      </div>

      <div style={styles.strip}>
        {days.map((day) => (
          <DayDot key={day.date} day={day} />
        ))}
      </div>
    </div>
  )
}

// ─── DayDot ───────────────────────────────────────────────────────────────────

function DayDot({ day }) {
  const { label, isToday, hasLogs, proteinHit, hasWorkout } = day

  let dotStyle = styles.dotEmpty
  let dotContent = '—'

  if (isToday && !hasLogs) {
    dotStyle  = styles.dotToday
    dotContent = '·'
  } else if (proteinHit) {
    dotStyle  = styles.dotHit
    dotContent = '✓'
  } else if (hasLogs) {
    dotStyle  = styles.dotPartial
    dotContent = '·'
  }

  return (
    <div style={styles.dayCol}>
      <span style={{
        ...styles.dayLabel,
        ...(isToday ? styles.dayLabelToday : {})
      }}>
        {label}
      </span>

      <div style={{ ...styles.dot, ...dotStyle }}>
        {dotContent}
      </div>

      {/* Workout indicator dot */}
      <div style={{
        ...styles.workoutDot,
        background: hasWorkout ? 'var(--accent)' : 'transparent',
      }} />
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },
  header: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingLeft:     '2px',
  },
  label: {
    fontSize:        '10px',
    fontWeight:      '700',
    color:           'var(--text-tertiary)',
    textTransform:   'uppercase',
    letterSpacing:   '0.1em',
  },
  streakBadge: {
    fontSize:        '11px',
    fontWeight:      '600',
    color:           'var(--accent)',
    background:      'var(--accent-dim)',
    padding:         '2px 10px',
    borderRadius:    'var(--r-full)',
  },
  strip: {
    display:         'flex',
    justifyContent:  'space-between',
    alignItems:      'flex-start',
  },
  loading: {
    height:          '60px',
    background:      'var(--bg-elevated)',
    borderRadius:    'var(--r-lg)',
    animation:       'pulse 1.5s ease infinite',
  },
  dayCol: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             '5px',
    flex:            1,
  },
  dayLabel: {
    fontSize:        '10px',
    fontWeight:      '600',
    color:           'var(--text-tertiary)',
    letterSpacing:   '0.04em',
    textTransform:   'uppercase',
  },
  dayLabelToday: {
    color:           'var(--text-primary)',
  },
  dot: {
    width:           '30px',
    height:          '30px',
    borderRadius:    '50%',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontSize:        '13px',
    fontWeight:      '700',
    transition:      'all 0.2s ease',
  },
  dotEmpty: {
    background:      'var(--bg-elevated)',
    color:           'var(--text-tertiary)',
    fontSize:        '10px',
  },
  dotHit: {
    background:      'var(--accent-dim)',
    color:           'var(--accent)',
  },
  dotPartial: {
    background:      'var(--bg-elevated)',
    color:           'var(--amber)',
    border:          '1px solid var(--amber)',
  },
  dotToday: {
    background:      'var(--text-primary)',
    color:           'var(--text-inverse)',
    fontSize:        '18px',
    fontWeight:      '300',
  },
  workoutDot: {
    width:           '4px',
    height:          '4px',
    borderRadius:    '50%',
    transition:      'background 0.2s',
  },
}