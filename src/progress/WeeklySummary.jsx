import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { sumMacros } from '../food/macroCalc.js'

export default function WeeklySummary() {
  const [stats,    setStats]    = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [aiSummary, setAiSummary] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const { user } = useAuth()

  useEffect(() => { loadWeeklyStats() }, [user])

  async function loadWeeklyStats() {
    if (!user) return
    setLoading(true)

    const today = new Date()
    const days  = []

    for (let i = 6; i >= 0; i--) {
      const d    = new Date(today)
      d.setDate(d.getDate() - i)
      const date = d.toISOString().slice(0, 10)

      const logs = await db.foodLogs
        .where('[userId+date]')
        .equals([user.id, date])
        .toArray()

      const workouts = await db.workoutLogs
        .where('[userId+date]')
        .equals([user.id, date])
        .toArray()

      const weight = await db.weightLog
        .where('[userId+date]')
        .equals([user.id, date])
        .first()

      days.push({ date, logs, workouts, weight })
    }

    const goals        = user.macroGoals || {}
    const loggedDays   = days.filter(d => d.logs.length > 0)
    const proteinHit   = loggedDays.filter(d => {
      const totals = sumMacros(d.logs)
      return totals.protein >= (goals.protein || 150)
    }).length

    const fibreHit = loggedDays.filter(d => {
      const totals = sumMacros(d.logs)
      return totals.fibre >= (goals.fibre || 30)
    }).length

    const totalCalories = loggedDays.reduce((sum, d) => {
      return sum + sumMacros(d.logs).calories
    }, 0)

    const avgCalories = loggedDays.length
      ? Math.round(totalCalories / loggedDays.length)
      : 0

    const workoutsCompleted = days.filter(d => d.workouts.length > 0).length

    const weights = days
      .filter(d => d.weight)
      .map(d => d.weight.weightKg)

    const weightChange = weights.length >= 2
      ? Math.round((weights[weights.length - 1] - weights[0]) * 10) / 10
      : null

    setStats({
      days,
      loggedDays: loggedDays.length,
      proteinHit,
      fibreHit,
      avgCalories,
      workoutsCompleted,
      weightChange,
      goals,
    })
    setLoading(false)
  }

  async function handleAskAI() {
    if (!stats || !user) return
    setAiLoading(true)
    setAiSummary('')

    try {
      const summary = `Weekly stats:
- Days logged: ${stats.loggedDays}/7
- Protein target hit: ${stats.proteinHit} days
- Fibre target hit: ${stats.fibreHit} days
- Average calories: ${stats.avgCalories} kcal
- Workouts: ${stats.workoutsCompleted}
- Weight change: ${stats.weightChange !== null ? stats.weightChange + 'kg' : 'not enough data'}
- Goals: ${stats.goals.calories} kcal, ${stats.goals.protein}g protein`

      const res = await fetch('/api/ai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:    user.id,
          type:      'chat',
          model:     'claude-haiku-4-5-20251001',
          maxTokens: 300,
          messages:  [{
            role:    'user',
            content: `Here are my nutrition and workout stats for the past 7 days:\n\n${summary}\n\nGive me a brief, encouraging analysis and 2-3 specific tips to improve next week. Keep it under 150 words.`
          }]
        })
      })

      const data = await res.json()
      setAiSummary(data.content?.[0]?.text || '')
    } catch (e) {
      setAiSummary('Could not load AI summary — check your connection.')
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.loading}>Loading weekly stats…</div>
      </div>
    )
  }

  if (!stats) return null

  const pct = (n, total) => total > 0 ? Math.round((n / total) * 100) : 0

  return (
    <div style={s.container}>
      <h2 style={s.title}>This Week</h2>

      {/* Stat cards */}
      <div style={s.grid}>
        <StatCard
          label="Days Logged"
          value={`${stats.loggedDays}/7`}
          sub={`${pct(stats.loggedDays, 7)}% consistency`}
          color="var(--accent)"
        />
        <StatCard
          label="Protein Target"
          value={`${stats.proteinHit}/7`}
          sub="days hit"
          color="var(--macro-protein)"
        />
        <StatCard
          label="Avg Calories"
          value={stats.avgCalories}
          sub={`goal: ${stats.goals.calories}`}
          color="var(--text-primary)"
        />
        <StatCard
          label="Workouts"
          value={stats.workoutsCompleted}
          sub="sessions this week"
          color="var(--macro-fat)"
        />
        <StatCard
          label="Fibre Target"
          value={`${stats.fibreHit}/7`}
          sub="days hit"
          color="var(--macro-fibre)"
        />
        {stats.weightChange !== null && (
          <StatCard
            label="Weight Change"
            value={`${stats.weightChange > 0 ? '+' : ''}${stats.weightChange} kg`}
            sub="vs 7 days ago"
            color={stats.weightChange <= 0 ? 'var(--accent)' : 'var(--amber)'}
          />
        )}
      </div>

      {/* Day breakdown */}
      <div style={s.card}>
        <div style={s.cardLabel}>Day by Day</div>
        {stats.days.map(day => {
          const totals   = sumMacros(day.logs)
          const hasLogs  = day.logs.length > 0
          const hasWork  = day.workouts.length > 0
          const protHit  = totals.protein >= (stats.goals.protein || 150)
          const label    = new Date(day.date + 'T00:00:00')
            .toLocaleDateString('en-IN', { weekday:'short', day:'numeric' })

          return (
            <div key={day.date} style={s.dayRow}>
              <span style={s.dayLabel}>{label}</span>
              <div style={s.dayDots}>
                <div style={{
                  ...s.dot,
                  background: hasLogs
                    ? protHit ? 'var(--accent)' : 'var(--amber)'
                    : 'var(--bg-elevated)'
                }} title="Food" />
                <div style={{
                  ...s.dot,
                  background: hasWork ? 'var(--macro-fat)' : 'var(--bg-elevated)'
                }} title="Workout" />
              </div>
              {hasLogs && (
                <span style={s.dayCalories}>
                  {Math.round(totals.calories)} kcal
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Ask AI */}
      {!aiSummary && (
        <button
          style={{ ...s.aiBtn, opacity: aiLoading ? 0.6 : 1 }}
          onClick={handleAskAI}
          disabled={aiLoading}
        >
          {aiLoading ? '✨ Analysing your week…' : '✨ Ask AI about this week'}
        </button>
      )}

      {aiSummary && (
        <div style={s.aiCard}>
          <div style={s.aiLabel}>✨ AI Analysis</div>
          <p style={s.aiText}>{aiSummary}</p>
          <button style={s.aiRefresh} onClick={handleAskAI}>
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={s.statCard}>
      <div style={{ ...s.statVal, color }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statSub}>{sub}</div>
    </div>
  )
}

const s = {
  container:  { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'24px' },
  title:      { fontSize:'22px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', margin:0 },
  loading:    { fontSize:'14px', color:'var(--text-tertiary)', textAlign:'center', padding:'32px 0' },
  grid:       { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' },
  statCard:   { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'3px' },
  statVal:    { fontSize:'24px', fontWeight:'300', letterSpacing:'-0.03em', lineHeight:'1' },
  statLabel:  { fontSize:'12px', fontWeight:'600', color:'var(--text-primary)', marginTop:'4px' },
  statSub:    { fontSize:'11px', color:'var(--text-tertiary)' },
  card:       { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'8px' },
  cardLabel:  { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' },
  dayRow:     { display:'flex', alignItems:'center', gap:'10px', padding:'6px 0', borderBottom:'0.5px solid var(--border-subtle)' },
  dayLabel:   { fontSize:'13px', color:'var(--text-primary)', fontWeight:'500', width:'80px', flexShrink:0 },
  dayDots:    { display:'flex', gap:'4px' },
  dot:        { width:'10px', height:'10px', borderRadius:'50%' },
  dayCalories:{ fontSize:'12px', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)', marginLeft:'auto' },
  aiBtn:      { padding:'14px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', color:'var(--text-primary)', fontSize:'15px', fontWeight:'500', cursor:'pointer' },
  aiCard:     { background:'var(--accent-dim)', border:'1px solid var(--accent)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'10px' },
  aiLabel:    { fontSize:'12px', fontWeight:'700', color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.06em' },
  aiText:     { fontSize:'14px', color:'var(--text-primary)', lineHeight:'1.6', margin:0, whiteSpace:'pre-wrap' },
  aiRefresh:  { background:'none', border:'none', color:'var(--accent)', fontSize:'13px', cursor:'pointer', padding:0, alignSelf:'flex-start' },
}