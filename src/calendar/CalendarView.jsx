import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/db.js'
import { sumMacros } from '../food/macroCalc.js'
import DaySummary from './DaySummary.jsx'
import { localDate } from '../log/DayLog.jsx'

export default function CalendarView() {
  const [year,       setYear]       = useState(new Date().getFullYear())
  const [month,      setMonth]      = useState(new Date().getMonth())
  const [dayData,    setDayData]    = useState({})
  const [selectedDay, setSelectedDay] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const { user } = useAuth()
  const location = useLocation()

  const today     = localDate()
  const monthName = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  // Reset to calendar grid whenever user navigates to /calendar (e.g. taps bottom nav)
  useEffect(() => { setSelectedDay(null) }, [location.key])

  useEffect(() => { loadMonthData() }, [user, year, month])

  async function loadMonthData() {
    if (!user) return
    setLoading(true)

    const firstDay = localDate(new Date(year, month, 1))
    const lastDay  = localDate(new Date(year, month + 1, 0))

    const [foodLogs, workoutLogs, weights] = await Promise.all([
      db.foodLogs.where('[userId+date]').between([user.id, firstDay], [user.id, lastDay], true, true).toArray(),
      db.workoutLogs.where('[userId+date]').between([user.id, firstDay], [user.id, lastDay], true, true).toArray(),
      db.weightLog.where('[userId+date]').between([user.id, firstDay], [user.id, lastDay], true, true).toArray(),
    ])

    const data = {}
    const goals = user.macroGoals || {}

    // Group food logs by date
    for (const log of foodLogs) {
      if (!data[log.date]) data[log.date] = { logs: [], workouts: [], weight: null }
      data[log.date].logs.push(log)
    }

    // Group workout logs by date
    for (const w of workoutLogs) {
      if (!data[w.date]) data[w.date] = { logs: [], workouts: [], weight: null }
      data[w.date].workouts.push(w)
    }

    // Group weight by date
    for (const w of weights) {
      if (!data[w.date]) data[w.date] = { logs: [], workouts: [], weight: null }
      data[w.date].weight = w
    }

    // Calculate indicators for each day
    for (const date of Object.keys(data)) {
      const d      = data[date]
      const totals = sumMacros(d.logs)
      d.calories   = Math.round(totals.calories)
      d.proteinHit = d.logs.length > 0 && totals.protein >= (goals.protein || 150)
      d.hasLogs    = d.logs.length > 0
      d.hasWorkout = d.workouts.length > 0
    }

    setDayData(data)
    setLoading(false)
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  if (selectedDay) {
    return (
      <DaySummary
        key={selectedDay}
        date={selectedDay}
        onBack={() => setSelectedDay(null)}
      />
    )
  }

  // Build calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth     = new Date(year, month + 1, 0).getDate()
  const cells           = []

  // Empty cells before first day
  for (let i = 0; i < firstDayOfMonth; i++) {
    cells.push(null)
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d)
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.navBtn} onClick={prevMonth}>‹</button>
        <span style={s.monthLabel}>{monthName}</span>
        <button style={s.navBtn} onClick={nextMonth}>›</button>
      </div>

      {/* Day labels */}
      <div style={s.weekLabels}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={s.weekLabel}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div style={s.loading}>Loading…</div>
      ) : (
        <div style={s.grid}>
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />

            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const data    = dayData[dateStr]
            const isToday = dateStr === today
            const isFuture = dateStr > today

            return (
              <button
                key={dateStr}
                style={{
                  ...s.dayCell,
                  ...(isToday ? s.dayCellToday : {}),
                  ...(isFuture ? s.dayCellFuture : {}),
                }}
                onClick={() => setSelectedDay(dateStr)}
              >
                <span style={{
                  ...s.dayNum,
                  ...(isToday ? s.dayNumToday : {}),
                }}>
                  {day}
                </span>

                {data && (
                  <div style={s.dots}>
                    {data.hasLogs && (
                      <div style={{
                        ...s.dot,
                        background: data.proteinHit
                          ? 'var(--accent)'
                          : 'var(--amber)',
                      }} />
                    )}
                    {data.hasWorkout && (
                      <div style={{ ...s.dot, background: 'var(--macro-fat)' }} />
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Legend */}
      <div style={s.legend}>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: 'var(--accent)' }} />
          <span style={s.legendLabel}>Protein hit</span>
        </div>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: 'var(--amber)' }} />
          <span style={s.legendLabel}>Logged, missed target</span>
        </div>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: 'var(--macro-fat)' }} />
          <span style={s.legendLabel}>Workout</span>
        </div>
      </div>
    </div>
  )
}

const s = {
  container:     { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'24px' },
  header:        { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' },
  navBtn:        { background:'none', border:'none', fontSize:'24px', color:'var(--text-primary)', cursor:'pointer', padding:'4px 12px', borderRadius:'var(--r-md)' },
  monthLabel:    { fontSize:'18px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  weekLabels:    { display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:'4px' },
  weekLabel:     { textAlign:'center', fontSize:'11px', fontWeight:'600', color:'var(--text-tertiary)', padding:'4px 0', textTransform:'uppercase', letterSpacing:'0.05em' },
  grid:          { display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'4px' },
  loading:       { textAlign:'center', padding:'32px 0', fontSize:'14px', color:'var(--text-tertiary)' },
  dayCell:       { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'6px 2px', minHeight:'48px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-md)', cursor:'pointer', gap:'3px' },
  dayCellToday:  { border:'1.5px solid var(--text-primary)' },
  dayCellFuture: { opacity:0.35, cursor:'default' },
  dayNum:        { fontSize:'14px', fontWeight:'500', color:'var(--text-primary)', lineHeight:'1' },
  dayNumToday:   { fontWeight:'700', color:'var(--text-primary)' },
  dots:          { display:'flex', gap:'2px' },
  dot:           { width:'5px', height:'5px', borderRadius:'50%' },
  legend:        { display:'flex', gap:'16px', flexWrap:'wrap', padding:'8px 0' },
  legendItem:    { display:'flex', alignItems:'center', gap:'6px' },
  legendDot:     { width:'8px', height:'8px', borderRadius:'50%', flexShrink:0 },
  legendLabel:   { fontSize:'12px', color:'var(--text-secondary)' },
}