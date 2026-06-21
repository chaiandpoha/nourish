import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/db.js'
import { sumMacros } from '../food/macroCalc.js'
import DaySummary from './DaySummary.jsx'
import { localDate } from '../log/DayLog.jsx'

export default function CalendarView() {
  const [year,        setYear]        = useState(new Date().getFullYear())
  const [month,       setMonth]       = useState(new Date().getMonth())
  const [dayData,     setDayData]     = useState({})
  const [selectedDay, setSelectedDay] = useState(null)
  const [loading,     setLoading]     = useState(true)
  const { user } = useAuth()
  const location = useLocation()

  const today     = localDate()
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const goals     = user?.macroGoals || {}

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
    const g    = user?.macroGoals || {}

    for (const log of foodLogs) {
      if (!data[log.date]) data[log.date] = { logs: [], workouts: [], weight: null }
      data[log.date].logs.push(log)
    }
    for (const w of workoutLogs) {
      if (!data[w.date]) data[w.date] = { logs: [], workouts: [], weight: null }
      data[w.date].workouts.push(w)
    }
    for (const w of weights) {
      if (!data[w.date]) data[w.date] = { logs: [], workouts: [], weight: null }
      data[w.date].weight = w
    }

    for (const date of Object.keys(data)) {
      const d      = data[date]
      const totals = sumMacros(d.logs)
      d.calories   = Math.round(totals.calories)
      d.protein    = Math.round(totals.protein)
      d.hasLogs    = d.logs.length > 0
      d.hasWorkout = d.workouts.some(w => w.status === 'complete')
      d.proteinHit = d.hasLogs && d.protein >= (g.protein || 999)
      d.calPct     = g.calories > 0 ? Math.min(100, (d.calories / g.calories) * 100) : 0
      d.calOk      = g.calories > 0 && d.calories >= g.calories * 0.85 && d.calories <= g.calories * 1.1
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

  // Month summary stats
  const pastDays    = Object.entries(dayData).filter(([d]) => d <= today)
  const loggedDays  = pastDays.filter(([, d]) => d.hasLogs).length
  const proteinDays = pastDays.filter(([, d]) => d.proteinHit).length
  const workoutDays = pastDays.filter(([, d]) => d.hasWorkout).length

  if (selectedDay) {
    return <DaySummary key={selectedDay} date={selectedDay} onBack={() => setSelectedDay(null)} />
  }

  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth     = new Date(year, month + 1, 0).getDate()
  const cells           = []
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div style={s.container}>

      {/* Header */}
      <div style={s.header}>
        <button style={s.navBtn} onClick={prevMonth}>‹</button>
        <span style={s.monthLabel}>{monthName}</span>
        <button style={s.navBtn} onClick={nextMonth}>›</button>
      </div>

      {/* Month summary strip */}
      {!loading && loggedDays > 0 && (
        <div style={s.summaryStrip}>
          {[
            { label: 'Logged',  value: loggedDays,  total: Object.keys(dayData).filter(d => d <= today).length },
            { label: 'Protein', value: proteinDays, total: loggedDays },
            { label: 'Workout', value: workoutDays, total: loggedDays },
          ].map(({ label, value, total }) => (
            <div key={label} style={s.summaryCell}>
              <div style={s.summaryVal}>{value}<span style={s.summaryOf}>/{total}</span></div>
              <div style={s.summaryLabel}>{label}</div>
              <div style={s.summaryTrack}>
                <div style={{ ...s.summaryFill, width: `${total > 0 ? (value/total)*100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Day labels */}
      <div style={s.weekLabels}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={s.weekLabel}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={s.loading}>Loading…</div>
      ) : (
        <div style={s.grid}>
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />

            const dateStr  = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const data     = dayData[dateStr]
            const isToday  = dateStr === today
            const isFuture = dateStr > today
            const isPast   = dateStr < today

            // Background intent
            let cellBg = 'var(--bg-surface)'
            let barColor = 'var(--border-subtle)'
            if (!isFuture && data?.hasLogs) {
              if (data.proteinHit) {
                cellBg   = 'var(--accent-dim)'
                barColor = 'var(--accent)'
              } else {
                cellBg   = 'rgba(184,120,48,0.09)'
                barColor = 'var(--amber)'
              }
            } else if (isPast && !data?.hasLogs) {
              cellBg = 'var(--bg-elevated)'
            }

            return (
              <button
                key={dateStr}
                onClick={() => !isFuture && setSelectedDay(dateStr)}
                style={{
                  ...s.cell,
                  background:  cellBg,
                  border:      isToday ? '2px solid var(--accent)' : '1px solid var(--border-subtle)',
                  opacity:     isFuture ? 0.3 : 1,
                  cursor:      isFuture ? 'default' : 'pointer',
                }}
              >
                {/* Top row: day number + badges */}
                <div style={s.cellTop}>
                  <span style={{
                    ...s.dayNum,
                    color:      isToday ? 'var(--accent)' : 'var(--text-primary)',
                    fontWeight: isToday ? '700' : '600',
                  }}>{day}</span>
                  <div style={s.badges}>
                    {data?.hasWorkout  && <span style={s.badgeW} />}
                    {data?.proteinHit  && <span style={s.badgeP} />}
                    {data?.calOk       && <span style={s.badgeC} />}
                    {data?.weight      && <span style={s.badgeWt} />}
                  </div>
                </div>

                {/* Calories */}
                {data?.hasLogs ? (
                  <div style={s.calNum}>{data.calories >= 1000 ? `${(data.calories/1000).toFixed(1)}k` : data.calories}</div>
                ) : isPast ? (
                  <div style={s.missed}>—</div>
                ) : null}

                {/* Progress bar */}
                <div style={s.barTrack}>
                  <div style={{
                    ...s.barFill,
                    width:      `${data?.calPct || 0}%`,
                    background: barColor,
                  }} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Inline legend */}
      <div style={s.legend}>
        <div style={s.legendItem}><span style={s.badgeW} /><span>Workout</span></div>
        <div style={s.legendItem}><span style={s.badgeP} /><span>Protein</span></div>
        <div style={s.legendItem}><span style={s.badgeC} /><span>Calories</span></div>
        <div style={s.legendItem}><span style={s.badgeWt} /><span>Weight</span></div>
        <div style={s.legendItem}><div style={{ ...s.legendSwatch, background:'var(--accent-dim)', border:'1px solid var(--accent)' }} /><span>On track</span></div>
        <div style={s.legendItem}><div style={{ ...s.legendSwatch, background:'rgba(184,120,48,0.09)', border:'1px solid var(--amber)' }} /><span>Logged</span></div>
      </div>

    </div>
  )
}

const s = {
  container:    { display:'flex', flexDirection:'column', gap:'10px', paddingBottom:'24px' },

  header:       { display:'flex', alignItems:'center', justifyContent:'space-between' },
  navBtn:       { background:'none', border:'none', fontSize:'22px', color:'var(--text-primary)', cursor:'pointer', padding:'4px 10px', borderRadius:'var(--r-md)' },
  monthLabel:   { fontSize:'17px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.02em' },

  summaryStrip: { display:'flex', gap:'8px', background:'var(--bg-surface)', borderRadius:'var(--r-xl)', padding:'12px 14px', boxShadow:'var(--shadow-sm)' },
  summaryCell:  { flex:1, display:'flex', flexDirection:'column', gap:'3px' },
  summaryVal:   { fontSize:'16px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.02em', lineHeight:'1' },
  summaryOf:    { fontSize:'11px', fontWeight:'400', color:'var(--text-tertiary)' },
  summaryLabel: { fontSize:'9px', fontWeight:'600', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em' },
  summaryTrack: { height:'3px', background:'var(--bg-elevated)', borderRadius:'2px', overflow:'hidden', marginTop:'2px' },
  summaryFill:  { height:'100%', background:'var(--accent)', borderRadius:'2px', transition:'width 0.4s ease' },

  weekLabels:   { display:'grid', gridTemplateColumns:'repeat(7,1fr)' },
  weekLabel:    { textAlign:'center', fontSize:'9px', fontWeight:'600', color:'var(--text-tertiary)', padding:'2px 0 4px', textTransform:'uppercase', letterSpacing:'0.05em' },

  grid:         { display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'4px' },
  loading:      { textAlign:'center', padding:'32px 0', fontSize:'14px', color:'var(--text-tertiary)' },

  cell:         { display:'flex', flexDirection:'column', alignItems:'stretch', padding:'5px 5px 0', minHeight:'58px', borderRadius:'var(--r-md)', gap:'2px', overflow:'hidden', WebkitTapHighlightColor:'transparent' },
  cellTop:      { display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'2px' },
  dayNum:       { fontSize:'12px', lineHeight:'1', flexShrink:0 },
  badges:       { display:'flex', flexWrap:'wrap', gap:'3px', justifyContent:'flex-end', flex:1 },
  badgeW:       { display:'inline-block', width:'6px', height:'6px', borderRadius:'50%', background:'var(--accent)', flexShrink:0 },
  badgeP:       { display:'inline-block', width:'6px', height:'6px', borderRadius:'50%', background:'#10b981', flexShrink:0 },
  badgeC:       { display:'inline-block', width:'6px', height:'6px', borderRadius:'50%', background:'#f59e0b', flexShrink:0 },
  badgeWt:      { display:'inline-block', width:'6px', height:'6px', borderRadius:'50%', background:'#6366f1', flexShrink:0 },
  calNum:       { fontSize:'11px', fontWeight:'700', color:'var(--text-secondary)', letterSpacing:'-0.02em', textAlign:'center', flex:1, display:'flex', alignItems:'center', justifyContent:'center' },
  missed:       { fontSize:'11px', color:'var(--text-tertiary)', textAlign:'center', flex:1, display:'flex', alignItems:'center', justifyContent:'center' },

  barTrack:     { height:'3px', background:'var(--border-subtle)', borderRadius:'0 0 4px 4px', overflow:'hidden', marginTop:'auto' },
  barFill:      { height:'100%', borderRadius:'0 0 4px 4px', transition:'width 0.4s ease' },

  legend:       { display:'flex', gap:'14px', flexWrap:'wrap', padding:'4px 2px' },
  legendItem:   { display:'flex', alignItems:'center', gap:'6px', fontSize:'11px', color:'var(--text-secondary)' },
  legendSwatch: { width:'10px', height:'10px', borderRadius:'3px', flexShrink:0 },
}
