import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { sumMacros } from '../food/macroCalc.js'
import { MACRO_COLORS } from '../config.js'

export default function DaySummary({ date, onBack }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const label = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  useEffect(() => { loadDay() }, [date, user])

  async function loadDay() {
    if (!user) return
    setLoading(true)

    const [foodLogs, workoutLogs, weight, suppLog, moodLog] = await Promise.all([
      db.foodLogs.where('[userId+date]').equals([user.id, date]).toArray(),
      db.workoutLogs.where('[userId+date]').equals([user.id, date]).toArray(),
      db.weightLog.where('[userId+date]').equals([user.id, date]).first(),
      db.supplementLog.where('[userId+date]').equals([user.id, date]).first(),
      db.moodLog.where('[userId+date]').equals([user.id, date]).first(),
    ])

    const totals = sumMacros(foodLogs)
    const goals  = user.macroGoals || {}

    // Group food by meal
    const byMeal = { breakfast: [], lunch: [], dinner: [], snack: [] }
    for (const log of foodLogs) {
      if (byMeal[log.meal]) byMeal[log.meal].push(log)
    }

    setData({ foodLogs, workoutLogs, weight, suppLog, moodLog, totals, goals, byMeal })
    setLoading(false)
  }

  if (loading) {
    return (
      <div style={s.container}>
        <button style={s.backBtn} onClick={onBack}>← Back</button>
        <div style={s.loading}>Loading…</div>
      </div>
    )
  }

  const { totals, goals, byMeal, workoutLogs, weight, suppLog, moodLog } = data
  const supplements = user?.supplements || []

  return (
    <div style={s.container}>
      <button style={s.backBtn} onClick={onBack}>← Calendar</button>
      <h2 style={s.title}>{label}</h2>

      {/* Macro summary */}
      <div style={s.card}>
        <div style={s.cardLabel}>Nutrition</div>
        {data.foodLogs.length === 0 ? (
          <p style={s.empty}>Nothing logged</p>
        ) : (
          <>
            <div style={s.macroRow}>
              {[
                { key:'calories', label:'kcal',   val: Math.round(totals.calories) },
                { key:'protein',  label:'Protein', val: `${Math.round(totals.protein)}g`  },
                { key:'carbs',    label:'Carbs',   val: `${Math.round(totals.carbs)}g`    },
                { key:'fat',      label:'Fat',     val: `${Math.round(totals.fat)}g`      },
                { key:'fibre',    label:'Fibre',   val: `${Math.round(totals.fibre)}g`    },
              ].map(({ key, label, val }) => (
                <div key={key} style={s.macroCell}>
                  <span style={{ ...s.macroVal, color: MACRO_COLORS[key] }}>{val}</span>
                  <span style={s.macroLabel}>{label}</span>
                </div>
              ))}
            </div>

            {/* Progress bars */}
            {[
              { key:'protein', label:'Protein', color: MACRO_COLORS.protein },
              { key:'carbs',   label:'Carbs',   color: MACRO_COLORS.carbs   },
              { key:'fat',     label:'Fat',     color: MACRO_COLORS.fat     },
              { key:'fibre',   label:'Fibre',   color: MACRO_COLORS.fibre   },
            ].map(({ key, label, color }) => {
              const pct = Math.min(100, ((totals[key] || 0) / (goals[key] || 1)) * 100)
              return (
                <div key={key} style={s.barRow}>
                  <span style={s.barLabel}>{label}</span>
                  <div style={s.barTrack}>
                    <div style={{ ...s.barFill, width:`${pct}%`, background:color }} />
                  </div>
                  <span style={s.barPct}>{Math.round(pct)}%</span>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Meals */}
      {Object.entries(byMeal).map(([meal, logs]) => {
        if (!logs.length) return null
        const mealTotals = sumMacros(logs)
        const icons = { breakfast:'🌅', lunch:'☀️', dinner:'🌙', snack:'🍎' }
        return (
          <div key={meal} style={s.card}>
            <div style={s.mealHeader}>
              <span style={s.mealIcon}>{icons[meal]}</span>
              <span style={s.mealName}>
                {meal.charAt(0).toUpperCase() + meal.slice(1)}
              </span>
              <span style={s.mealCals}>{Math.round(mealTotals.calories)} kcal</span>
            </div>
            {logs.map((log, i) => (
              <div key={i} style={s.logRow}>
                <span style={s.logName}>{log.name}</span>
                <span style={s.logDetail}>
                  {log.grams}g · {log.calories} kcal · {log.protein}g P
                </span>
              </div>
            ))}
          </div>
        )
      })}

      {/* Workout */}
      {workoutLogs.length > 0 && (
        <div style={s.card}>
          <div style={s.cardLabel}>Workout</div>
          {workoutLogs.map((w, i) => (
            <div key={i} style={s.workoutRow}>
              <span style={s.workoutName}>{w.name}</span>
              <span style={s.workoutMeta}>
                {w.duration ? `${Math.round(w.duration / 60)} min` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Weight */}
      {weight && (
        <div style={s.card}>
          <div style={s.cardLabel}>Weight</div>
          <span style={s.weightVal}>
            {weight.weightLbs
              ? `${weight.weightLbs} lbs`
              : `${weight.weightKg} kg`
            }
          </span>
          {weight.note && <span style={s.weightNote}>{weight.note}</span>}
        </div>
      )}

      {/* Supplements */}
      {supplements.length > 0 && suppLog && (
        <div style={s.card}>
          <div style={s.cardLabel}>Supplements</div>
          {supplements.map(supp => (
            <div key={supp} style={s.suppRow}>
              <span style={s.suppName}>{supp}</span>
              <span style={{
                ...s.suppStatus,
                color: suppLog.done?.[supp] ? 'var(--accent)' : 'var(--text-tertiary)'
              }}>
                {suppLog.done?.[supp] ? '✓ Taken' : '— Missed'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Mood */}
      {moodLog && (
        <div style={s.card}>
          <div style={s.cardLabel}>Mood & Energy</div>
          <div style={s.moodRow}>
            <div style={s.moodItem}>
              <span style={s.moodLabel}>Energy</span>
              <span style={s.moodVal}>{'⚡'.repeat(moodLog.energy || 0)}</span>
            </div>
            <div style={s.moodItem}>
              <span style={s.moodLabel}>Mood</span>
              <span style={s.moodVal}>{'😊'.repeat(moodLog.mood || 0)}</span>
            </div>
          </div>
        </div>
      )}

      {data.foodLogs.length === 0 &&
       workoutLogs.length === 0 &&
       !weight && (
        <div style={s.emptyDay}>
          <p style={s.emptyDayText}>Nothing logged on this day</p>
        </div>
      )}
    </div>
  )
}

const s = {
  container:   { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'24px' },
  backBtn:     { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0, alignSelf:'flex-start' },
  title:       { fontSize:'20px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', margin:0 },
  loading:     { textAlign:'center', padding:'32px 0', fontSize:'14px', color:'var(--text-tertiary)' },
  card:        { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'10px' },
  cardLabel:   { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' },
  empty:       { fontSize:'14px', color:'var(--text-tertiary)', margin:0 },
  macroRow:    { display:'grid', gridTemplateColumns:'repeat(5,1fr)' },
  macroCell:   { display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' },
  macroVal:    { fontSize:'15px', fontWeight:'700', fontFamily:'var(--font-mono)', letterSpacing:'-0.02em' },
  macroLabel:  { fontSize:'10px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.04em' },
  barRow:      { display:'flex', alignItems:'center', gap:'8px' },
  barLabel:    { fontSize:'12px', color:'var(--text-secondary)', width:'48px', flexShrink:0 },
  barTrack:    { flex:1, height:'4px', background:'var(--bg-elevated)', borderRadius:'99px', overflow:'hidden' },
  barFill:     { height:'100%', borderRadius:'99px', transition:'width 0.4s' },
  barPct:      { fontSize:'11px', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)', width:'32px', textAlign:'right', flexShrink:0 },
  mealHeader:  { display:'flex', alignItems:'center', gap:'8px' },
  mealIcon:    { fontSize:'16px' },
  mealName:    { fontSize:'14px', fontWeight:'600', color:'var(--text-primary)', flex:1 },
  mealCals:    { fontSize:'13px', color:'var(--text-secondary)', fontFamily:'var(--font-mono)' },
  logRow:      { display:'flex', flexDirection:'column', gap:'2px', padding:'6px 0', borderTop:'0.5px solid var(--border-subtle)' },
  logName:     { fontSize:'14px', color:'var(--text-primary)', fontWeight:'500' },
  logDetail:   { fontSize:'12px', color:'var(--text-tertiary)' },
  workoutRow:  { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0' },
  workoutName: { fontSize:'15px', fontWeight:'500', color:'var(--text-primary)' },
  workoutMeta: { fontSize:'13px', color:'var(--text-tertiary)' },
  weightVal:   { fontSize:'28px', fontWeight:'300', color:'var(--text-primary)', letterSpacing:'-0.03em' },
  weightNote:  { fontSize:'13px', color:'var(--text-tertiary)' },
  suppRow:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'0.5px solid var(--border-subtle)' },
  suppName:    { fontSize:'14px', color:'var(--text-primary)' },
  suppStatus:  { fontSize:'13px', fontWeight:'600' },
  moodRow:     { display:'flex', gap:'24px' },
  moodItem:    { display:'flex', flexDirection:'column', gap:'4px' },
  moodLabel:   { fontSize:'11px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em' },
  moodVal:     { fontSize:'20px' },
  emptyDay:    { textAlign:'center', padding:'32px 0' },
  emptyDayText:{ fontSize:'15px', color:'var(--text-tertiary)', margin:0 },
}