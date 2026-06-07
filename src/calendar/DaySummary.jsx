import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { sumMacros } from '../food/macroCalc.js'
import { MACRO_COLORS } from '../config.js'
import DayLog from '../log/DayLog.jsx'
import MealEntry from '../log/MealEntry.jsx'

export default function DaySummary({ date, onBack }) {
  const [extra,   setExtra]   = useState(null)  // workout, weight, supplements, mood
  const [totals,  setTotals]  = useState({ calories:0, protein:0, carbs:0, fat:0, fibre:0 })
  const [refresh, setRefresh] = useState(0)
  const { user } = useAuth()

  const label = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

  useEffect(() => {
    if (!user) return
    Promise.all([
      db.workoutLogs.where('[userId+date]').equals([user.id, date]).toArray(),
      db.weightLog.where('[userId+date]').equals([user.id, date]).first(),
      db.supplementLog.where('[userId+date]').equals([user.id, date]).first(),
      db.moodLog.where('[userId+date]').equals([user.id, date]).first(),
    ]).then(([workoutLogs, weight, suppLog, moodLog]) => {
      setExtra({ workoutLogs, weight, suppLog, moodLog })
    })
  }, [date, user, refresh])

  const { workoutLogs, weight, suppLog, moodLog } = extra || {}
  const supplements = user?.supplements || []
  const goals       = user?.macroGoals  || {}

  async function toggleSupplement(name, currentLog) {
    const done = { ...(currentLog?.done || {}), [name]: !(currentLog?.done?.[name]) }
    if (currentLog) {
      await db.supplementLog.update(currentLog.id, { done, dirty: 1, updatedAt: new Date().toISOString() })
    } else {
      await db.supplementLog.add({ userId: user.id, date, done, dirty: 1, updatedAt: new Date().toISOString() })
    }
    setRefresh(r => r + 1)
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={onBack}>← Calendar</button>
      </div>

      <h2 style={s.title}>{label}</h2>

      {/* Macro summary bar */}
      {totals.calories > 0 && (
        <div style={s.macroCard}>
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
      )}

      {/* Food log (editable tabs — same as home screen) */}
      <DayLog date={date} onTotalsChange={setTotals} reloadTrigger={refresh} />

      {/* Workout */}
      {workoutLogs?.length > 0 && (
        <div style={s.card}>
          <div style={s.cardLabel}>Workout</div>
          {workoutLogs.map((w, i) => (
            <div key={i} style={s.workoutRow}>
              <span style={s.workoutName}>{w.name}</span>
              {w.duration ? <span style={s.workoutMeta}>{Math.round(w.duration / 60)} min</span> : null}
            </div>
          ))}
        </div>
      )}

      {/* Weight */}
      {weight && (
        <div style={s.card}>
          <div style={s.cardLabel}>Weight</div>
          <span style={s.weightVal}>
            {weight.weightLbs ? `${weight.weightLbs} lbs` : `${weight.weightKg} kg`}
          </span>
          {weight.note && <span style={s.weightNote}>{weight.note}</span>}
        </div>
      )}

      {/* Supplements */}
      {supplements.length > 0 && (
        <div style={s.card}>
          <div style={s.cardLabel}>Supplements</div>
          {supplements.map(supp => {
            const taken = suppLog?.done?.[supp] || false
            return (
              <button key={supp} style={s.suppRow} onClick={() => toggleSupplement(supp, suppLog)}>
                <span style={s.suppName}>{supp}</span>
                <span style={{ ...s.suppStatus, color: taken ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                  {taken ? '✓ Taken' : '— Missed'}
                </span>
              </button>
            )
          })}
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

      {/* Add food — at the very bottom, out of the way */}
      <MealEntry
        date={date}
        inline
        onLogged={() => setRefresh(r => r + 1)}
      />

      <div style={{ height:'24px' }} />
    </div>
  )
}

const s = {
  container:   { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'24px' },
  header:      { display:'flex', alignItems:'center', justifyContent:'space-between' },
  backBtn:     { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0 },
  title:       { fontSize:'20px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', margin:0 },

  macroCard:   { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'14px', display:'grid', gridTemplateColumns:'repeat(5,1fr)' },
  macroCell:   { display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' },
  macroVal:    { fontSize:'15px', fontWeight:'700', fontFamily:'var(--font-mono)', letterSpacing:'-0.02em' },
  macroLabel:  { fontSize:'10px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.04em' },

  card:        { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'10px' },
  cardLabel:   { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' },

  workoutRow:  { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0' },
  workoutName: { fontSize:'15px', fontWeight:'500', color:'var(--text-primary)' },
  workoutMeta: { fontSize:'13px', color:'var(--text-tertiary)' },

  weightVal:   { fontSize:'28px', fontWeight:'300', color:'var(--text-primary)', letterSpacing:'-0.03em' },
  weightNote:  { fontSize:'13px', color:'var(--text-tertiary)' },

  suppRow:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'0.5px solid var(--border-subtle)', width:'100%', background:'none', border:'none', cursor:'pointer', textAlign:'left' },
  suppName:    { fontSize:'14px', color:'var(--text-primary)' },
  suppStatus:  { fontSize:'13px', fontWeight:'600' },

  moodRow:     { display:'flex', gap:'24px' },
  moodItem:    { display:'flex', flexDirection:'column', gap:'4px' },
  moodLabel:   { fontSize:'11px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em' },
  moodVal:     { fontSize:'20px' },
}
