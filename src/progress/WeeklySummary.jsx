import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { AI } from '../config.js'
import { localDate } from '../log/DayLog.jsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(date) {
  return localDate(date)
}

function dateMinusDays(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

// Monday of the week containing `date` (YYYY-MM-DD)
function weekMonday(date = new Date()) {
  const d = new Date(date)
  const dow = d.getDay() // 0=Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function weekGrade(score) {
  if (score === 7) return { label: 'Perfect week',     color: 'var(--accent)' }
  if (score >= 6)  return { label: 'Crushing it',      color: 'var(--accent)' }
  if (score >= 5)  return { label: 'Great week',       color: 'var(--accent)' }
  if (score >= 4)  return { label: 'Good week',        color: '#8fc9b3'       }
  if (score >= 2)  return { label: 'Keep going',       color: 'var(--amber)'  }
  if (score >= 1)  return { label: 'Getting started',  color: 'var(--amber)'  }
  return              { label: 'Log your first day', color: 'var(--text-tertiary)' }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WeeklySummary() {
  const { user } = useAuth()
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [aiText,    setAiText]    = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => { if (user) load() }, [user?.id])

  async function load() {
    setLoading(true)
    try {
      const today    = new Date()
      const todayStr = isoDate(today)

      // Monday 4 weeks back — anchor for the heatmap grid
      const mon4ago  = weekMonday(today)
      mon4ago.setDate(mon4ago.getDate() - 21) // 3 full prior weeks back
      const startStr = isoDate(mon4ago)

      // Monday 12 weeks back — for best-streak calculation
      const mon12ago    = new Date(mon4ago)
      mon12ago.setDate(mon12ago.getDate() - 56) // 8 more weeks
      const farStartStr = isoDate(mon12ago)

      // ── Load food logs ──────────────────────────────────────────────────────
      const allFood = await db.foodLogs
        .where('[userId+date]')
        .between([user.id, farStartStr], [user.id, todayStr], true, true)
        .toArray()

      // ── Load workout logs ───────────────────────────────────────────────────
      const allWork = await db.workoutLogs
        .where('[userId+date]')
        .between([user.id, farStartStr], [user.id, todayStr], true, true)
        .toArray()

      // ── Group by date ───────────────────────────────────────────────────────
      const foodByDate = {}, workByDate = {}
      for (const f of allFood) {
        if (!foodByDate[f.date]) foodByDate[f.date] = []
        foodByDate[f.date].push(f)
      }
      for (const w of allWork) workByDate[w.date] = true

      const proteinGoal  = user.macroGoals?.protein  || 150
      const calorieGoal  = user.macroGoals?.calories || 2000

      // ── Build per-day summary from mon12ago → today ─────────────────────────
      const dayMap = {}
      const cur = new Date(mon12ago)
      while (isoDate(cur) <= todayStr) {
        const ds   = isoDate(cur)
        const logs = foodByDate[ds] || []
        const prot = logs.reduce((s, l) => s + (l.protein  || 0), 0)
        const cal  = logs.reduce((s, l) => s + (l.calories || 0), 0)
        dayMap[ds] = {
          date:       ds,
          hasLogs:    logs.length > 0,
          proteinHit: prot >= proteinGoal,
          hasWorkout: !!workByDate[ds],
          calories:   Math.round(cal),
          protein:    Math.round(prot),
        }
        cur.setDate(cur.getDate() + 1)
      }

      // ── This week (Mon–today) ───────────────────────────────────────────────
      const thisMon   = weekMonday(today)
      const thisWeek  = []
      const wc = new Date(thisMon)
      while (isoDate(wc) <= todayStr) {
        const ds = isoDate(wc)
        thisWeek.push(dayMap[ds] || { date: ds, hasLogs: false, proteinHit: false, hasWorkout: false, calories: 0 })
        wc.setDate(wc.getDate() + 1)
      }

      const weekScore        = thisWeek.filter(d => d.hasLogs).length
      const proteinDaysHit   = thisWeek.filter(d => d.proteinHit).length
      const workoutsThisWeek = thisWeek.filter(d => d.hasWorkout).length
      const loggedThisWeek   = thisWeek.filter(d => d.hasLogs)
      const avgCalories      = loggedThisWeek.length
        ? Math.round(loggedThisWeek.reduce((s, d) => s + d.calories, 0) / loggedThisWeek.length)
        : 0

      // ── Current streaks (count back from today) ─────────────────────────────
      const allDates = Object.keys(dayMap).sort()
      let logStreak = 0, protStreak = 0, workStreak = 0
      for (let i = allDates.length - 1; i >= 0; i--) {
        const d = dayMap[allDates[i]]
        if (d.hasLogs) logStreak++; else break
      }
      for (let i = allDates.length - 1; i >= 0; i--) {
        const d = dayMap[allDates[i]]
        if (d.proteinHit) protStreak++; else break
      }
      for (let i = allDates.length - 1; i >= 0; i--) {
        const d = dayMap[allDates[i]]
        if (d.hasWorkout) workStreak++; else break
      }

      // ── Best log streak in the full window ─────────────────────────────────
      let bestStreak = 0, run = 0
      for (const ds of allDates) {
        if (dayMap[ds].hasLogs) { run++; bestStreak = Math.max(bestStreak, run) }
        else run = 0
      }

      // ── 28-day heatmap: 4 weeks × 7 days, Mon–Sun ──────────────────────────
      // Build exactly 4 full Mon–Sun weeks ending this Sunday (or today)
      const heatmapWeeks = []
      const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
      for (let week = 3; week >= 0; week--) {
        const row = []
        const mon = new Date(thisMon)
        mon.setDate(mon.getDate() - week * 7)
        for (let d = 0; d < 7; d++) {
          const ds = isoDate(mon)
          const isFuture = ds > todayStr
          row.push(isFuture ? { date: ds, future: true } : (dayMap[ds] || { date: ds, hasLogs: false, proteinHit: false, hasWorkout: false }))
          mon.setDate(mon.getDate() + 1)
        }
        heatmapWeeks.push(row)
      }

      setData({
        thisWeek, weekScore, proteinDaysHit, workoutsThisWeek, avgCalories,
        logStreak, protStreak, workStreak, bestStreak,
        heatmapWeeks, DAY_LABELS,
        goals: user.macroGoals || {},
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleAskAI() {
    if (!data || !user) return
    setAiLoading(true)
    setAiText('')
    try {
      const ctx = `Weekly stats (last 7 days):
- Days logged: ${data.weekScore}/7
- Protein goal hit: ${data.proteinDaysHit} days
- Avg calories: ${data.avgCalories} kcal (goal: ${data.goals.calories || 2000})
- Workouts: ${data.workoutsThisWeek}
- Current logging streak: ${data.logStreak} days
- Goals: ${data.goals.calories || 2000} kcal, ${data.goals.protein || 150}g protein`

      const system = `You are a supportive nutrition coach inside Nourish, a personal health tracking app.
User: ${user.name || 'User'}. Goals: ${data.goals.calories || 2000} kcal, ${data.goals.protein || 150}g protein per day.
Be warm, direct, and encouraging. Under 120 words. No lists — write in short paragraphs.`

      const res = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:    user.id,
          type:      'chat',
          model:     AI.chatModel,
          maxTokens: 250,
          system,
          messages: [{
            role:    'user',
            content: `${ctx}\n\nBrief, encouraging analysis and 2 specific tips for next week.`
          }]
        })
      })
      const d = await res.json()
      setAiText(d.content?.[0]?.text || '')
    } catch {
      setAiText('Could not load AI summary.')
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) return <div style={s.skeleton} />
  if (!data)   return null

  const grade = weekGrade(data.weekScore)

  return (
    <div style={s.container}>

      {/* ── Week score ───────────────────────────────────────────────────────── */}
      <div style={s.scoreRow}>
        <div style={s.scoreLeft}>
          <div style={s.scoreLabel}>THIS WEEK</div>
          <div style={s.scoreMain}>
            <span style={{ ...s.scoreNum, color: grade.color }}>{data.weekScore}</span>
            <span style={s.scoreOf}>/7</span>
            <span style={s.scoreDays}> days logged</span>
          </div>
          <div style={{ ...s.gradeLabel, color: grade.color }}>{grade.label}</div>
        </div>
        <div style={s.weekMiniStats}>
          <MiniStat label="Avg kcal"  val={data.avgCalories || '—'} />
          <MiniStat label="Protein ✓" val={`${data.proteinDaysHit}/7`} />
          <MiniStat label="Workouts"  val={data.workoutsThisWeek} />
        </div>
      </div>

      {/* ── Streak cards ─────────────────────────────────────────────────────── */}
      <div style={s.streakRow}>
        <StreakCard label="Logging"  count={data.logStreak}  unit="days" best={data.bestStreak} />
        <StreakCard label="Protein"  count={data.protStreak} unit="days" />
        <StreakCard label="Workouts" count={data.workStreak} unit="days" />
      </div>

      {/* ── Heatmap ──────────────────────────────────────────────────────────── */}
      <div style={s.heatmapCard}>
        <div style={s.heatmapHeader}>
          <span style={s.heatmapTitle}>28-DAY ACTIVITY</span>
          <div style={s.heatmapLegend}>
            <span style={s.legendDot({ bg: 'var(--bg-elevated)' })} />
            <span style={s.legendDot({ bg: '#8fc9b3' })} />
            <span style={s.legendDot({ bg: 'var(--accent)' })} />
          </div>
        </div>
        {/* Day-of-week labels */}
        <div style={s.heatmapDayLabels}>
          {data.DAY_LABELS.map((l, i) => (
            <div key={i} style={s.heatmapDayLabel}>{l}</div>
          ))}
        </div>
        {/* Weeks */}
        {data.heatmapWeeks.map((week, wi) => (
          <div key={wi} style={s.heatmapRow}>
            {week.map((day, di) => {
              const bg = day.future
                ? 'transparent'
                : !day.hasLogs
                  ? 'var(--bg-elevated)'
                  : day.proteinHit
                    ? 'var(--accent)'
                    : '#8fc9b3'
              return (
                <div key={di} style={{ ...s.heatCell, background: bg }}>
                  {day.hasWorkout && !day.future && (
                    <div style={s.workoutPip} />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* ── Day-by-day breakdown ─────────────────────────────────────────────── */}
      <div style={s.card}>
        <div style={s.cardLabel}>DAY BY DAY</div>
        {data.thisWeek.map((day, i) => {
          const label = new Date(day.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })
          const isToday = day.date === localDate()
          return (
            <div key={day.date} style={{ ...s.dayRow, borderBottom: i < data.thisWeek.length - 1 ? '0.5px solid var(--border-subtle)' : 'none' }}>
              <span style={{ ...s.dayLabel, fontWeight: isToday ? '700' : '500', color: isToday ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {label}
              </span>
              <div style={s.dayDots}>
                <div style={{ ...s.dot, background: day.hasLogs ? (day.proteinHit ? 'var(--accent)' : '#8fc9b3') : 'var(--bg-elevated)' }} title="Food" />
                <div style={{ ...s.dot, background: day.hasWorkout ? 'var(--macro-fat)' : 'var(--bg-elevated)' }} title="Workout" />
              </div>
              <span style={s.dayMeta}>
                {day.hasLogs ? `${day.calories} kcal · ${day.protein}g P` : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── AI analysis ──────────────────────────────────────────────────────── */}
      {!aiText && (
        <button style={{ ...s.aiBtn, opacity: aiLoading ? 0.6 : 1 }} onClick={handleAskAI} disabled={aiLoading}>
          {aiLoading ? '✨ Analysing…' : '✨ AI weekly review'}
        </button>
      )}
      {aiText && (
        <div style={s.aiCard}>
          <div style={s.aiLabel}>✨ AI Analysis</div>
          <p style={s.aiText}>{aiText}</p>
          <button style={s.aiRefresh} onClick={() => { setAiText(''); handleAskAI() }}>Refresh</button>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StreakCard({ label, count, unit, best }) {
  const fire = count >= 7
  return (
    <div style={s.streakCard}>
      <div style={{ ...s.streakNum, color: count > 0 ? 'var(--accent)' : 'var(--text-tertiary)' }}>
        {count}{fire ? ' 🔥' : ''}
      </div>
      <div style={s.streakLabel}>{label}</div>
      {best != null && (
        <div style={s.streakBest}>best {best}d</div>
      )}
    </div>
  )
}

function MiniStat({ label, val }) {
  return (
    <div style={s.miniStat}>
      <div style={s.miniStatVal}>{val}</div>
      <div style={s.miniStatLabel}>{label}</div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  container:      { display:'flex', flexDirection:'column', gap:'10px', paddingBottom:'8px' },
  skeleton:       { height:'320px', background:'var(--bg-elevated)', borderRadius:'var(--r-xl)', animation:'pulse 1.5s ease infinite' },

  // Score
  scoreRow:       { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px' },
  scoreLeft:      { display:'flex', flexDirection:'column', gap:'4px' },
  scoreLabel:     { fontSize:'10px', fontWeight:'700', color:'var(--text-tertiary)', letterSpacing:'0.1em' },
  scoreMain:      { display:'flex', alignItems:'baseline', gap:'2px' },
  scoreNum:       { fontSize:'44px', fontWeight:'700', fontFamily:'var(--font-mono)', letterSpacing:'-0.04em', lineHeight:1 },
  scoreOf:        { fontSize:'22px', fontWeight:'400', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)' },
  scoreDays:      { fontSize:'13px', color:'var(--text-tertiary)', marginLeft:'2px' },
  gradeLabel:     { fontSize:'13px', fontWeight:'600', letterSpacing:'-0.01em' },
  weekMiniStats:  { display:'flex', flexDirection:'column', gap:'8px', alignItems:'flex-end' },
  miniStat:       { display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'1px' },
  miniStatVal:    { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.02em' },
  miniStatLabel:  { fontSize:'10px', color:'var(--text-tertiary)', fontWeight:'500' },

  // Streaks
  streakRow:      { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' },
  streakCard:     { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'12px 14px', display:'flex', flexDirection:'column', gap:'2px' },
  streakNum:      { fontSize:'28px', fontWeight:'700', fontFamily:'var(--font-mono)', letterSpacing:'-0.04em', lineHeight:1 },
  streakLabel:    { fontSize:'11px', fontWeight:'600', color:'var(--text-secondary)', marginTop:'4px' },
  streakBest:     { fontSize:'10px', color:'var(--text-tertiary)' },

  // Heatmap
  heatmapCard:    { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'5px' },
  heatmapHeader:  { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'2px' },
  heatmapTitle:   { fontSize:'10px', fontWeight:'700', color:'var(--text-tertiary)', letterSpacing:'0.1em' },
  heatmapLegend:  { display:'flex', gap:'4px', alignItems:'center' },
  legendDot:      ({ bg }) => ({ display:'inline-block', width:'10px', height:'10px', borderRadius:'3px', background: bg }),
  heatmapDayLabels:{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'4px', marginBottom:'2px' },
  heatmapDayLabel: { fontSize:'9px', fontWeight:'600', color:'var(--text-tertiary)', textAlign:'center', letterSpacing:'0.04em' },
  heatmapRow:     { display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'4px' },
  heatCell:       { aspectRatio:'1', borderRadius:'4px', position:'relative', display:'flex', alignItems:'flex-end', justifyContent:'flex-end' },
  workoutPip:     { width:'4px', height:'4px', borderRadius:'50%', background:'rgba(255,255,255,0.8)', margin:'2px' },

  // Day breakdown
  card:           { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'0' },
  cardLabel:      { fontSize:'10px', fontWeight:'700', color:'var(--text-tertiary)', letterSpacing:'0.1em', marginBottom:'8px' },
  dayRow:         { display:'flex', alignItems:'center', gap:'10px', paddingTop:'8px', paddingBottom:'8px' },
  dayLabel:       { fontSize:'13px', width:'80px', flexShrink:0 },
  dayDots:        { display:'flex', gap:'4px' },
  dot:            { width:'10px', height:'10px', borderRadius:'50%' },
  dayMeta:        { fontSize:'12px', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)', marginLeft:'auto', letterSpacing:'-0.01em' },

  // AI
  aiBtn:          { padding:'14px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', color:'var(--text-primary)', fontSize:'15px', fontWeight:'500', cursor:'pointer' },
  aiCard:         { background:'var(--accent-dim)', border:'1px solid var(--accent)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'10px' },
  aiLabel:        { fontSize:'11px', fontWeight:'700', color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.07em' },
  aiText:         { fontSize:'14px', color:'var(--text-primary)', lineHeight:'1.6', margin:0, whiteSpace:'pre-wrap' },
  aiRefresh:      { background:'none', border:'none', color:'var(--accent)', fontSize:'13px', cursor:'pointer', padding:0, alignSelf:'flex-start', fontWeight:'500' },
}
