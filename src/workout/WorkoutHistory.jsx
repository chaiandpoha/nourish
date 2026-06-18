import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'

function fmt(s) {
  if (!s && s !== 0) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })
}

export default function WorkoutHistory() {
  const { user } = useAuth()
  const [logs,     setLogs]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)  // workoutLog object
  const [detail,   setDetail]   = useState([])    // sets for selected session
  const unit = localStorage.getItem('workoutUnit') || 'lbs'

  useEffect(() => { if (user) loadLogs() }, [user])

  async function loadLogs() {
    setLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const all = await db.workoutLogs
        .where('userId').equals(user.id)
        .and(l => l.status === 'complete' || (l.status === 'draft' && l.date < today))
        .toArray()
      all.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      setLogs(all)
    } finally {
      setLoading(false)
    }
  }

  async function deleteLog(log) {
    await db.workoutSets.where('workoutLogId').equals(log.id).delete()
    await db.workoutLogs.delete(log.id)
    setSelected(null)
    setDetail([])
    loadLogs()
  }

  async function openDetail(log) {
    const sets = await db.workoutSets
      .where('userId').equals(user.id)
      .and(s => s.workoutLogId === log.id)
      .toArray()

    // Group sets by exercise
    const byEx = {}
    for (const s of sets) {
      const key = s.exerciseName || s.exerciseId
      if (!byEx[key]) byEx[key] = []
      byEx[key].push(s)
    }
    setDetail(Object.entries(byEx).map(([name, exSets]) => ({
      name,
      sets: exSets.slice().sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || '')),
    })))
    setSelected(log)
  }

  if (selected) {
    const volume = detail.reduce((t, ex) =>
      t + ex.sets.reduce((v, s) => v + (parseFloat(s.weight)||0) * (parseInt(s.reps)||0), 0), 0)

    return (
      <div style={s.container}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button style={s.backBtn} onClick={() => { setSelected(null); setDetail([]) }}>← History</button>
          <button
            style={s.deleteBtn}
            onClick={() => { if (window.confirm('Delete this session?')) deleteLog(selected) }}
          >
            Delete
          </button>
        </div>
        <div style={s.detailName}>{selected.name}</div>
        <div style={s.detailDate}>{fmtDate(selected.date)}</div>

        <div style={s.statRow}>
          {[
            { val: fmt(selected.duration), lbl: 'Duration'         },
            { val: detail.reduce((n, ex) => n + ex.sets.length, 0), lbl: 'Sets' },
            { val: `${Math.round(volume).toLocaleString()}`,         lbl: unit   },
          ].map(({ val, lbl }) => (
            <div key={lbl} style={s.stat}>
              <div style={s.statVal}>{val}</div>
              <div style={s.statLbl}>{lbl}</div>
            </div>
          ))}
        </div>

        {selected.prs?.length > 0 && (
          <div style={s.prBanner}>
            {selected.prs.map((pr, i) => (
              <span key={i} style={s.prChip}>🏆 {pr.exercise} · {pr.value} {unit}</span>
            ))}
          </div>
        )}

        {detail.map(ex => (
          <div key={ex.name} style={s.exCard}>
            <div style={s.exName}>{ex.name}</div>
            <div style={s.setList}>
              {ex.sets.map((set, i) => (
                <div key={i} style={s.setChip}>
                  <span style={s.setNum}>{i + 1}</span>
                  <span style={s.setVal}>{set.weight} {unit} × {set.reps}</span>
                  {set.rpe && <span style={s.setRpe}>RPE {set.rpe}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.loading}>Loading history…</div>
      </div>
    )
  }

  if (!logs.length) {
    return (
      <div style={s.container}>
        <div style={s.empty}>
          <div style={s.emptyIcon}>📋</div>
          <div style={s.emptyTitle}>No workouts yet</div>
          <div style={s.emptySub}>Log sets during a session, then tap "Finish Workout" to save it here</div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>History</span>
        <span style={s.count}>{logs.length} sessions</span>
      </div>

      {logs.map(log => (
        <button key={log.id} style={s.card} onClick={() => openDetail(log)}>
          <div style={s.cardLeft}>
            <div style={s.cardDate}>{fmtDate(log.date)}</div>
            <div style={s.cardName}>{log.name || 'Workout'}</div>
            <div style={s.cardMeta}>
              {log.status === 'complete' ? fmt(log.duration) : '—'}
              {log.status !== 'complete' && (
                <span style={s.draftPill}>not finished</span>
              )}
              {log.prs?.length > 0 && (
                <span style={s.prPill}>🏆 {log.prs.length} PR{log.prs.length > 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
          <span style={s.chevron}>›</span>
        </button>
      ))}
    </div>
  )
}

const s = {
  container:  { display:'flex', flexDirection:'column', gap:'10px', paddingBottom:'32px' },
  loading:    { textAlign:'center', color:'var(--text-tertiary)', padding:'48px 0', fontSize:'14px' },
  header:     { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' },
  title:      { fontSize:'20px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em' },
  count:      { fontSize:'13px', color:'var(--text-tertiary)' },

  card:       { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', cursor:'pointer', textAlign:'left', width:'100%' },
  cardLeft:   { flex:1, display:'flex', flexDirection:'column', gap:'2px' },
  cardDate:   { fontSize:'11px', fontWeight:'600', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em' },
  cardName:   { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', marginTop:'2px' },
  cardMeta:   { display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'var(--text-secondary)', marginTop:'4px' },
  prPill:     { fontSize:'11px', fontWeight:'600', color:'var(--accent)', background:'var(--accent-dim)', padding:'2px 8px', borderRadius:'var(--r-full)' },
  draftPill:  { fontSize:'11px', fontWeight:'600', color:'var(--text-tertiary)', background:'var(--bg-elevated)', padding:'2px 8px', borderRadius:'var(--r-full)' },
  chevron:    { fontSize:'20px', color:'var(--text-tertiary)', flexShrink:0, lineHeight:1 },

  empty:      { display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', padding:'56px 16px' },
  emptyIcon:  { fontSize:'48px' },
  emptyTitle: { fontSize:'17px', fontWeight:'600', color:'var(--text-primary)' },
  emptySub:   { fontSize:'14px', color:'var(--text-tertiary)', textAlign:'center' },

  // Detail view
  backBtn:    { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0 },
  deleteBtn:  { background:'none', border:'none', color:'var(--red, #cc3333)', fontSize:'14px', fontWeight:'600', cursor:'pointer', padding:0 },
  detailName: { fontSize:'22px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em', marginTop:'8px' },
  detailDate: { fontSize:'13px', color:'var(--text-tertiary)', marginBottom:'4px' },
  statRow:    { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  stat:       { display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', padding:'16px 8px', borderRight:'0.5px solid var(--border-subtle)' },
  statVal:    { fontSize:'20px', fontWeight:'700', color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.03em' },
  statLbl:    { fontSize:'11px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em' },
  prBanner:   { display:'flex', flexWrap:'wrap', gap:'6px' },
  prChip:     { fontSize:'12px', fontWeight:'600', color:'var(--accent)', background:'var(--accent-dim)', padding:'5px 10px', borderRadius:'var(--r-full)' },
  exCard:     { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' },
  exName:     { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.01em' },
  setList:    { display:'flex', flexDirection:'column', gap:'6px' },
  setChip:    { display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--bg-elevated)', borderRadius:'var(--r-md)' },
  setNum:     { width:'20px', fontSize:'12px', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)', textAlign:'center', flexShrink:0 },
  setVal:     { flex:1, fontSize:'14px', fontWeight:'500', color:'var(--text-primary)', fontFamily:'var(--font-mono)' },
  setRpe:     { fontSize:'11px', color:'var(--text-secondary)', background:'var(--bg-surface)', padding:'2px 7px', borderRadius:'var(--r-full)' },
}
