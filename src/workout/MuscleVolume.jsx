import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { EXERCISES } from './ExerciseDB.js'

// Build exerciseId → muscle lookup from the exercise list
const EX_MUSCLE = {}
for (const ex of EXERCISES) EX_MUSCLE[ex.id] = ex.muscle

// Main muscle groups to display, in training-split order
const MUSCLE_ORDER = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Core']

// Minimum effective volume targets (sets/week) per muscle group
const MIN_SETS = {
  Chest: 10, Back: 10, Shoulders: 10,
  Biceps: 6, Triceps: 6,
  Quads: 10, Hamstrings: 8, Glutes: 8, Core: 6,
}

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}

export default function MuscleVolume() {
  const { user }                   = useAuth()
  const [thisWeek, setThisWeek]   = useState({})   // muscle → set count
  const [lastWeek, setLastWeek]   = useState({})
  const [lastLog,  setLastLog]    = useState({})   // muscle → last date trained
  const [loading,  setLoading]    = useState(true)

  useEffect(() => { if (user) loadVolume() }, [user?.id])

  async function loadVolume() {
    setLoading(true)
    try {
      const today    = new Date()
      const todayStr = today.toISOString().slice(0, 10)
      const thisMon  = getWeekStart(today)

      const lastMon = new Date(thisMon + 'T00:00:00')
      lastMon.setDate(lastMon.getDate() - 7)
      const lastMonStr = lastMon.toISOString().slice(0, 10)

      const lastSun = new Date(thisMon + 'T00:00:00')
      lastSun.setDate(lastSun.getDate() - 1)
      const lastSunStr = lastSun.toISOString().slice(0, 10)

      const sets = await db.workoutSets
        .where('userId').equals(user.id)
        .toArray()

      const thisW = {}, lastW = {}, lastLogged = {}

      for (const s of sets) {
        if (!s.date || !s.exerciseId) continue
        const muscle = EX_MUSCLE[s.exerciseId]
        if (!muscle) continue

        if (!lastLogged[muscle] || s.date > lastLogged[muscle]) {
          lastLogged[muscle] = s.date
        }

        if (s.date >= thisMon && s.date <= todayStr) {
          thisW[muscle] = (thisW[muscle] || 0) + 1
        } else if (s.date >= lastMonStr && s.date <= lastSunStr) {
          lastW[muscle] = (lastW[muscle] || 0) + 1
        }
      }

      setThisWeek(thisW)
      setLastWeek(lastW)
      setLastLog(lastLogged)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <p style={s.hint}>Loading…</p>

  const onTrack = MUSCLE_ORDER.filter(m => (thisWeek[m] || 0) >= (MIN_SETS[m] || 6)).length

  return (
    <div style={s.container}>
      <div style={s.summary}>
        <span style={s.summaryNum}>{onTrack}</span>
        <span style={s.summaryOf}>/{MUSCLE_ORDER.length}</span>
        <span style={s.summaryLabel}> muscles on track this week</span>
      </div>

      <div style={s.card}>
        {MUSCLE_ORDER.map((muscle, i) => {
          const sets      = thisWeek[muscle] || 0
          const prev      = lastWeek[muscle] || 0
          const min       = MIN_SETS[muscle] || 6
          const pct       = Math.min(1, sets / min)
          const last      = lastLog[muscle]
          const daysAgo   = last
            ? Math.floor((Date.now() - new Date(last + 'T00:00:00').getTime()) / 86400000)
            : null
          const untrained = daysAgo === null || daysAgo >= 7
          const isLast    = i === MUSCLE_ORDER.length - 1

          const barColor = pct >= 1
            ? 'var(--accent)'
            : pct >= 0.5
              ? '#8fc9b3'
              : sets > 0
                ? 'var(--border-strong)'
                : 'transparent'

          return (
            <div key={muscle} style={{ ...s.row, borderBottom: isLast ? 'none' : '0.5px solid var(--border-subtle)' }}>
              <div style={s.rowLeft}>
                <div style={s.nameRow}>
                  <span style={s.muscleName}>{muscle}</span>
                  {untrained && sets === 0 && (
                    <span style={s.alertDot} title="Not trained in 7+ days">!</span>
                  )}
                </div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${pct * 100}%`, background: barColor }} />
                </div>
                <div style={s.metaRow}>
                  {last ? (
                    <span style={{ fontSize:'11px', fontWeight:'500', color: untrained ? 'var(--red)' : 'var(--text-tertiary)' }}>
                      {daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`}
                    </span>
                  ) : (
                    <span style={{ fontSize:'11px', color:'var(--text-tertiary)' }}>Never</span>
                  )}
                  {prev > 0 && (
                    <span style={s.prevSets}>last wk {prev}</span>
                  )}
                </div>
              </div>

              <div style={s.setsCol}>
                <span style={{ ...s.setsNum, color: sets > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {sets}
                </span>
                <span style={s.setsTarget}>/{min}</span>
              </div>
            </div>
          )
        })}
      </div>

      <p style={s.footnote}>Numbers = sets logged · targets based on minimum effective volume</p>
    </div>
  )
}

const s = {
  container:  { display:'flex', flexDirection:'column', gap:'16px', paddingBottom:'32px' },
  hint:       { textAlign:'center', fontSize:'13px', color:'var(--text-tertiary)', margin:0 },
  summary:    { display:'flex', alignItems:'baseline', gap:'2px', padding:'4px 0' },
  summaryNum: { fontSize:'32px', fontWeight:'700', color:'var(--accent)', fontFamily:'var(--font-mono)', letterSpacing:'-0.04em', lineHeight:1 },
  summaryOf:  { fontSize:'20px', fontWeight:'400', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)' },
  summaryLabel:{ fontSize:'14px', color:'var(--text-secondary)', marginLeft:'2px' },
  card:       { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  row:        { display:'grid', gridTemplateColumns:'1fr auto', gap:'12px', padding:'12px 16px', alignItems:'center' },
  rowLeft:    { display:'flex', flexDirection:'column', gap:'5px', minWidth:0 },
  nameRow:    { display:'flex', alignItems:'center', gap:'6px' },
  muscleName: { fontSize:'14px', fontWeight:'600', color:'var(--text-primary)' },
  alertDot:   { width:'16px', height:'16px', borderRadius:'50%', background:'var(--red)', color:'#fff', fontSize:'10px', fontWeight:'700', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  barTrack:   { height:'5px', background:'var(--bg-elevated)', borderRadius:'3px', overflow:'hidden' },
  barFill:    { height:'100%', borderRadius:'3px', transition:'width 0.5s ease' },
  metaRow:    { display:'flex', alignItems:'center', gap:'8px' },
  prevSets:   { fontSize:'11px', color:'var(--text-tertiary)' },
  setsCol:    { display:'flex', alignItems:'baseline', gap:'1px', flexShrink:0 },
  setsNum:    { fontSize:'22px', fontWeight:'600', fontFamily:'var(--font-mono)', letterSpacing:'-0.03em' },
  setsTarget: { fontSize:'12px', color:'var(--text-tertiary)' },
  footnote:   { fontSize:'11px', color:'var(--text-tertiary)', textAlign:'center', margin:0 },
}
