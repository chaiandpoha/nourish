import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'

export default function MoodLog() {
  const [energy,  setEnergy]  = useState(0)
  const [mood,    setMood]    = useState(0)
  const [saved,   setSaved]   = useState(false)
  const [history, setHistory] = useState([])
  const { user } = useAuth()

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => { loadToday(); loadHistory() }, [user])

  async function loadToday() {
    if (!user) return
    const entry = await db.moodLog
      .where('[userId+date]')
      .equals([user.id, today])
      .first()
    if (entry) {
      setEnergy(entry.energy || 0)
      setMood(entry.mood || 0)
      setSaved(true)
    }
  }

  async function loadHistory() {
    if (!user) return
    const all = await db.moodLog
      .where('userId').equals(user.id)
      .toArray()
    setHistory(all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14))
  }

  async function handleSave() {
    if (!user || (!energy && !mood)) return
    const existing = await db.moodLog
      .where('[userId+date]')
      .equals([user.id, today])
      .first()

    if (existing) {
      await db.moodLog.update(existing.id, {
        energy, mood, dirty: 1, updatedAt: new Date().toISOString()
      })
    } else {
      await db.moodLog.add({
        userId: user.id, date: today,
        energy, mood, dirty: 1,
        updatedAt: new Date().toISOString()
      })
    }
    setSaved(true)
    loadHistory()
  }

  const energyLabels = ['', 'Exhausted', 'Low', 'Okay', 'Good', 'Great']
  const moodLabels   = ['', 'Awful', 'Bad', 'Okay', 'Good', 'Amazing']
  const energyEmoji  = ['', '😴', '😓', '😐', '😊', '⚡']
  const moodEmoji    = ['', '😔', '😕', '😐', '🙂', '😁']

  return (
    <div style={s.container}>
      <h2 style={s.title}>Mood & Energy</h2>
      <p style={s.sub}>Optional — no streaks, no pressure</p>

      {/* Energy slider */}
      <div style={s.card}>
        <div style={s.sliderHeader}>
          <span style={s.sliderLabel}>Energy</span>
          <span style={s.sliderVal}>
            {energy > 0 ? `${energyEmoji[energy]} ${energyLabels[energy]}` : '—'}
          </span>
        </div>
        <div style={s.dots}>
          {[1,2,3,4,5].map(v => (
            <button
              key={v}
              style={{
                ...s.dotBtn,
                background: v <= energy ? 'var(--amber)' : 'var(--bg-elevated)',
                border: v <= energy ? 'none' : '1.5px solid var(--border-default)',
              }}
              onClick={() => { setEnergy(v); setSaved(false) }}
            >
              {energyEmoji[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Mood slider */}
      <div style={s.card}>
        <div style={s.sliderHeader}>
          <span style={s.sliderLabel}>Mood</span>
          <span style={s.sliderVal}>
            {mood > 0 ? `${moodEmoji[mood]} ${moodLabels[mood]}` : '—'}
          </span>
        </div>
        <div style={s.dots}>
          {[1,2,3,4,5].map(v => (
            <button
              key={v}
              style={{
                ...s.dotBtn,
                background: v <= mood ? 'var(--macro-protein)' : 'var(--bg-elevated)',
                border: v <= mood ? 'none' : '1.5px solid var(--border-default)',
              }}
              onClick={() => { setMood(v); setSaved(false) }}
            >
              {moodEmoji[v]}
            </button>
          ))}
        </div>
      </div>

      <button
        style={{
          ...s.saveBtn,
          background: saved ? 'var(--accent)' : 'var(--text-primary)',
        }}
        onClick={handleSave}
        disabled={!energy && !mood}
      >
        {saved ? '✓ Logged' : 'Log Today'}
      </button>

      {/* History */}
      {history.length > 0 && (
        <div style={s.card}>
          <div style={s.cardLabel}>Recent</div>
          {history.map(entry => (
            <div key={entry.date} style={s.histRow}>
              <span style={s.histDate}>
                {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-IN', {
                  weekday:'short', day:'numeric', month:'short'
                })}
              </span>
              <div style={s.histEmoji}>
                <span title="Energy">{energyEmoji[entry.energy] || '—'}</span>
                <span title="Mood">{moodEmoji[entry.mood] || '—'}</span>
              </div>
              <div style={s.histBars}>
                <div style={s.histBar}>
                  <div style={{
                    ...s.histBarFill,
                    width: `${(entry.energy / 5) * 100}%`,
                    background: 'var(--amber)',
                  }} />
                </div>
                <div style={s.histBar}>
                  <div style={{
                    ...s.histBarFill,
                    width: `${(entry.mood / 5) * 100}%`,
                    background: 'var(--macro-protein)',
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s = {
  container:   { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'24px' },
  title:       { fontSize:'22px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', margin:0 },
  sub:         { fontSize:'13px', color:'var(--text-tertiary)', margin:0 },
  card:        { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'12px' },
  cardLabel:   { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' },
  sliderHeader:{ display:'flex', alignItems:'center', justifyContent:'space-between' },
  sliderLabel: { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)' },
  sliderVal:   { fontSize:'14px', color:'var(--text-secondary)' },
  dots:        { display:'flex', gap:'8px', justifyContent:'space-between' },
  dotBtn:      { flex:1, height:'48px', borderRadius:'var(--r-lg)', fontSize:'22px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' },
  saveBtn:     { padding:'14px', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'15px', fontWeight:'600', cursor:'pointer', transition:'background 0.2s' },
  histRow:     { display:'flex', alignItems:'center', gap:'10px', padding:'6px 0', borderBottom:'0.5px solid var(--border-subtle)' },
  histDate:    { fontSize:'12px', color:'var(--text-primary)', fontWeight:'500', width:'80px', flexShrink:0 },
  histEmoji:   { display:'flex', gap:'4px', fontSize:'16px', flexShrink:0 },
  histBars:    { flex:1, display:'flex', flexDirection:'column', gap:'3px' },
  histBar:     { height:'4px', background:'var(--bg-elevated)', borderRadius:'99px', overflow:'hidden' },
  histBarFill: { height:'100%', borderRadius:'99px', transition:'width 0.3s' },
}