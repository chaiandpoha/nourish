import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { localDate } from '../log/DayLog.jsx'

export default function WeightLog() {
  const [entries,  setEntries]  = useState([])
  const [weight,   setWeight]   = useState('')
  const [note,     setNote]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [unit,     setUnit]     = useState(() => localStorage.getItem('weightUnit') || 'lbs')
  const { user } = useAuth()

  const today = localDate()

  useEffect(() => { loadEntries() }, [user])

  async function loadEntries() {
    if (!user) return
    const all = await db.weightLog
      .where('[userId+date]')
      .between([user.id, '2000-01-01'], [user.id, today], true, true)
      .toArray()

    // Deduplicate by date — keep the most recently updated entry, delete extras
    const byDate = new Map()
    for (const e of all) {
      const existing = byDate.get(e.date)
      if (!existing || (e.updatedAt || '') >= (existing.updatedAt || '')) {
        if (existing) db.weightLog.delete(existing.id)
        byDate.set(e.date, e)
      } else {
        db.weightLog.delete(e.id)
      }
    }
    setEntries([...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)))
  }

  async function handleSave() {
    if (!weight || isNaN(parseFloat(weight))) return
    setSaving(true)
    try {
      const val = parseFloat(weight)
      const weightKg  = unit === 'lbs' ? val * 0.453592 : val
      const weightLbs = unit === 'lbs' ? val : val * 2.20462

      const existing = await db.weightLog.where('[userId+date]').equals([user.id, today]).first()
      const payload = {
        userId:    user.id,
        date:      today,
        weightKg:  Math.round(weightKg * 10) / 10,
        weightLbs: Math.round(weightLbs * 10) / 10,
        note:      note.trim(),
        dirty:     1,
        updatedAt: new Date().toISOString(),
      }
      if (existing) {
        await db.weightLog.update(existing.id, payload)
      } else {
        await db.weightLog.add(payload)
      }
      setWeight('')
      setNote('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      loadEntries()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(date) {
    await db.weightLog
      .where('[userId+date]')
      .equals([user.id, date])
      .delete()
    loadEntries()
  }

  // Last 30 entries for chart
  const chartData = [...entries].reverse().slice(-30)
  const weights   = chartData.map(e => unit === 'lbs' ? e.weightLbs || e.weightKg * 2.20462 : e.weightKg)
  const minW      = Math.min(...weights) - 2
  const maxW      = Math.max(...weights) + 2
  const range     = maxW - minW || 1

  function toY(w) {
    return 100 - ((w - minW) / range) * 100
  }

  const todayEntry = entries.find(e => e.date === today)

  return (
    <div style={s.container}>
      <h2 style={s.title}>Weight Log</h2>

      {/* Unit toggle */}
      <div style={s.unitToggle}>
        <button
          style={{ ...s.unitBtn, ...(unit === 'lbs' ? s.unitBtnActive : {}) }}
          onClick={() => { setUnit('lbs'); localStorage.setItem('weightUnit', 'lbs') }}
        >
          lbs
        </button>
        <button
          style={{ ...s.unitBtn, ...(unit === 'kg' ? s.unitBtnActive : {}) }}
          onClick={() => { setUnit('kg'); localStorage.setItem('weightUnit', 'kg') }}
        >
          kg
        </button>
      </div>

      {/* Today's entry */}
      <div style={s.card}>
        <div style={s.cardLabel}>
          {todayEntry ? 'Today — logged' : "Today's weight"}
        </div>
        {todayEntry ? (
          <div style={s.todayRow}>
            <span style={s.todayVal}>
              {unit === 'lbs'
                ? `${todayEntry.weightLbs || Math.round(todayEntry.weightKg * 2.20462 * 10)/10} lbs`
                : `${todayEntry.weightKg} kg`
              }
            </span>
            <button style={s.deleteBtn} onClick={() => handleDelete(today)}>
              Remove
            </button>
          </div>
        ) : (
          <>
            <div style={s.inputRow}>
              <input
                style={s.weightInput}
                type="text"
                inputMode="decimal"
                placeholder={unit === 'lbs' ? '175' : '80'}
                value={weight}
                onChange={e => setWeight(e.target.value)}
              />
              <span style={s.unitLabel}>{unit}</span>
            </div>
            <input
              style={s.noteInput}
              placeholder="Note (optional)"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <button
              style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saved ? '✓ Saved' : saving ? 'Saving…' : 'Log Weight'}
            </button>
          </>
        )}
      </div>

      {/* Trend chart */}
      {chartData.length > 1 && (
        <div style={s.card}>
          <div style={s.cardLabel}>30-day trend</div>
          <svg
            viewBox="0 0 300 100"
            style={{ width:'100%', height:'80px', overflow:'visible' }}
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map(y => (
              <line key={y} x1="0" y1={y} x2="300" y2={y}
                stroke="var(--border-subtle)" strokeWidth="0.5" />
            ))}

            {/* Line */}
            <polyline
              points={chartData.map((e, i) => {
                const w = unit === 'lbs' ? (e.weightLbs || e.weightKg * 2.20462) : e.weightKg
                const x = (i / (chartData.length - 1)) * 300
                const y = toY(w)
                return `${x},${y}`
              }).join(' ')}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Dots */}
            {chartData.map((e, i) => {
              const w = unit === 'lbs' ? (e.weightLbs || e.weightKg * 2.20462) : e.weightKg
              const x = (i / (chartData.length - 1)) * 300
              const y = toY(w)
              return (
                <circle key={i} cx={x} cy={y} r="3"
                  fill="var(--accent)" />
              )
            })}
          </svg>

          {/* Min / Max labels */}
          <div style={s.chartLabels}>
            <span style={s.chartLabel}>
              Min: {Math.min(...weights).toFixed(1)} {unit}
            </span>
            <span style={s.chartLabel}>
              Max: {Math.max(...weights).toFixed(1)} {unit}
            </span>
          </div>
        </div>
      )}

      {/* History list */}
      {entries.length > 0 && (
        <div style={s.card}>
          <div style={s.cardLabel}>History</div>
          {entries.slice(0, 14).map(entry => (
            <div key={entry.date} style={s.histRow}>
              <div style={s.histLeft}>
                <span style={s.histDate}>
                  {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-IN', {
                    day:'numeric', month:'short', weekday:'short'
                  })}
                </span>
                {entry.note && <span style={s.histNote}>{entry.note}</span>}
              </div>
              <span style={s.histVal}>
                {unit === 'lbs'
                  ? `${entry.weightLbs || Math.round(entry.weightKg * 2.20462 * 10)/10} lbs`
                  : `${entry.weightKg} kg`
                }
              </span>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 && (
        <div style={s.empty}>
          <p style={s.emptyText}>No weight logged yet</p>
          <p style={s.emptySub}>Log your morning fasted weight daily for best results</p>
        </div>
      )}
    </div>
  )
}

const s = {
  container:    { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'24px' },
  title:        { fontSize:'22px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', margin:0 },
  unitToggle:   { display:'flex', background:'var(--bg-elevated)', borderRadius:'var(--r-md)', padding:'3px', gap:'2px', alignSelf:'flex-start' },
  unitBtn:      { padding:'6px 16px', background:'transparent', border:'none', borderRadius:'9px', fontSize:'13px', fontWeight:'500', color:'var(--text-secondary)', cursor:'pointer' },
  unitBtnActive:{ background:'var(--bg-surface)', color:'var(--text-primary)', boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  card:         { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'10px' },
  cardLabel:    { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' },
  todayRow:     { display:'flex', alignItems:'center', justifyContent:'space-between' },
  todayVal:     { fontSize:'32px', fontWeight:'300', color:'var(--text-primary)', letterSpacing:'-0.03em', fontFamily:'var(--font-sans)' },
  deleteBtn:    { padding:'6px 12px', background:'rgba(200,80,64,0.08)', border:'none', borderRadius:'var(--r-md)', color:'var(--red)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  inputRow:     { display:'flex', alignItems:'center', gap:'8px' },
  weightInput:  { flex:1, padding:'12px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'28px', fontWeight:'300', letterSpacing:'-0.02em', color:'var(--text-primary)', outline:'none' },
  unitLabel:    { fontSize:'16px', color:'var(--text-tertiary)', fontWeight:'500' },
  noteInput:    { padding:'10px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'14px', color:'var(--text-primary)', outline:'none' },
  saveBtn:      { padding:'13px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'15px', fontWeight:'600', cursor:'pointer' },
  chartLabels:  { display:'flex', justifyContent:'space-between' },
  chartLabel:   { fontSize:'11px', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)' },
  histRow:      { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'0.5px solid var(--border-subtle)' },
  histLeft:     { display:'flex', flexDirection:'column', gap:'2px' },
  histDate:     { fontSize:'13px', color:'var(--text-primary)', fontWeight:'500' },
  histNote:     { fontSize:'11px', color:'var(--text-tertiary)' },
  histVal:      { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', fontFamily:'var(--font-mono)' },
  empty:        { display:'flex', flexDirection:'column', alignItems:'center', padding:'32px 0', gap:'6px' },
  emptyText:    { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', margin:0 },
  emptySub:     { fontSize:'13px', color:'var(--text-secondary)', textAlign:'center', margin:0 },
}