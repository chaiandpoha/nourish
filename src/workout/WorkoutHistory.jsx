import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/db.js'
import { generateId } from '../auth/crypto.js'
import { searchExercises } from './ExerciseDB.js'

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
  const [logs,       setLogs]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(null)
  const [detail,     setDetail]     = useState([])
  const [editing,    setEditing]    = useState(false)
  const [editDetail, setEditDetail] = useState([])
  const [saving,     setSaving]     = useState(false)
  const [addingEx,   setAddingEx]   = useState(false)
  const [exQuery,    setExQuery]    = useState('')
  const [exResults,  setExResults]  = useState([])
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
    const byEx = {}
    for (const s of sets) {
      const key = s.exerciseName || s.exerciseId
      if (!byEx[key]) byEx[key] = []
      byEx[key].push(s)
    }
    const grouped = Object.entries(byEx).map(([name, exSets]) => ({
      name,
      sets: exSets.slice().sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || '')),
    }))
    setDetail(grouped)
    setSelected(log)
    setEditing(false)
    setEditDetail([])
  }

  function startEdit() {
    setEditDetail(detail.map(ex => ({
      ...ex,
      sets: ex.sets.map(set => ({ ...set })),
    })))
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditDetail([])
  }

  function updateSet(ei, si, field, value) {
    setEditDetail(prev => prev.map((ex, eidx) => {
      if (eidx !== ei) return ex
      return { ...ex, sets: ex.sets.map((set, sidx) => sidx !== si ? set : { ...set, [field]: value }) }
    }))
  }

  function removeSet(ei, si) {
    setEditDetail(prev => prev.map((ex, eidx) => {
      if (eidx !== ei) return ex
      return { ...ex, sets: ex.sets.filter((_, sidx) => sidx !== si) }
    }))
  }

  function removeExercise(ei) {
    setEditDetail(prev => prev.filter((_, idx) => idx !== ei))
  }

  function addExercise(ex) {
    if (editDetail.some(e => e.exerciseId === ex.id)) { setAddingEx(false); setExQuery(''); setExResults([]); return }
    setEditDetail(prev => [...prev, {
      name: ex.name,
      exerciseId: ex.id,
      sets: [],
    }])
    setAddingEx(false)
    setExQuery('')
    setExResults([])
  }

  function searchEx(q) {
    setExQuery(q)
    setExResults(q.trim() ? searchExercises(q, 8) : [])
  }

  function addSet(ei) {
    setEditDetail(prev => prev.map((ex, eidx) => {
      if (eidx !== ei) return ex
      const last = ex.sets[ex.sets.length - 1] || {}
      return {
        ...ex,
        sets: [...ex.sets, {
          _new: true,
          id: generateId(),
          userId: user.id,
          workoutLogId: selected.id,
          exerciseId: last.exerciseId || ex.exerciseId || null,
          exerciseName: ex.name,
          weight: last.weight ?? '',
          reps: last.reps ?? '',
          rpe: last.rpe ?? '',
          done: true,
          updatedAt: new Date().toISOString(),
        }],
      }
    }))
  }

  async function saveEdits() {
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const originalIds = new Set(detail.flatMap(ex => ex.sets.map(s => s.id)))
      const keptIds     = new Set(editDetail.flatMap(ex => ex.sets.filter(s => !s._new).map(s => s.id)))

      // Delete removed sets
      for (const id of originalIds) {
        if (!keptIds.has(id)) await db.workoutSets.delete(id)
      }

      // Upsert all current sets
      for (const ex of editDetail) {
        for (const set of ex.sets) {
          const { _new, ...data } = set
          await db.workoutSets.put({ ...data, updatedAt: now })
        }
      }

      await db.workoutLogs.update(selected.id, { updatedAt: now })
      await openDetail(selected)
    } finally {
      setSaving(false)
    }
  }

  // ── Detail / Edit view ──────────────────────────────────────────────────────
  if (selected) {
    const displayDetail = editing ? editDetail : detail
    const volume = displayDetail.reduce((t, ex) =>
      t + ex.sets.reduce((v, set) => v + (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0), 0), 0)

    return (
      <div style={s.container}>
        {/* Header row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <button style={s.backBtn} onClick={() => { setSelected(null); setDetail([]) }}>← History</button>
          <div style={{ display:'flex', gap:'14px', alignItems:'center' }}>
            {!editing && (
              <button style={s.editBtn} onClick={startEdit}>Edit</button>
            )}
            {editing && (
              <>
                <button style={s.cancelBtn} onClick={cancelEdit}>Cancel</button>
                <button style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }} onClick={saveEdits} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
            {!editing && (
              <button style={s.deleteBtn} onClick={() => { if (window.confirm('Delete this session?')) deleteLog(selected) }}>
                Delete
              </button>
            )}
          </div>
        </div>

        <div style={s.detailName}>{selected.name}</div>
        <div style={s.detailDate}>{fmtDate(selected.date)}</div>

        <div style={s.statRow}>
          {[
            { val: fmt(selected.duration), lbl: 'Duration' },
            { val: displayDetail.reduce((n, ex) => n + ex.sets.length, 0), lbl: 'Sets' },
            { val: Math.round(volume).toLocaleString(), lbl: unit },
          ].map(({ val, lbl }) => (
            <div key={lbl} style={s.stat}>
              <div style={s.statVal}>{val}</div>
              <div style={s.statLbl}>{lbl}</div>
            </div>
          ))}
        </div>

        {!editing && selected.prs?.length > 0 && (
          <div style={s.prBanner}>
            {selected.prs.map((pr, i) => (
              <span key={i} style={s.prChip}>🏆 {pr.exercise} · {pr.value} {unit}</span>
            ))}
          </div>
        )}

        {displayDetail.map((ex, ei) => (
          <div key={ex.name + ei} style={s.exCard}>
            <div style={s.exNameRow}>
              <span style={s.exName}>{ex.name}</span>
              {editing && (
                <button style={s.removeExBtn} onClick={() => removeExercise(ei)}>Remove</button>
              )}
            </div>
            <div style={s.setList}>
              {ex.sets.map((set, si) =>
                editing ? (
                  <div key={set.id || si} style={s.editRow}>
                    <span style={s.setNum}>{si + 1}</span>
                    <input
                      style={s.editInput}
                      type="number"
                      inputMode="decimal"
                      value={set.weight}
                      onChange={e => updateSet(ei, si, 'weight', e.target.value)}
                      placeholder="wt"
                    />
                    <span style={s.editSep}>×</span>
                    <input
                      style={s.editInput}
                      type="number"
                      inputMode="numeric"
                      value={set.reps}
                      onChange={e => updateSet(ei, si, 'reps', e.target.value)}
                      placeholder="reps"
                    />
                    <input
                      style={{ ...s.editInput, width: '46px' }}
                      type="number"
                      inputMode="decimal"
                      value={set.rpe || ''}
                      onChange={e => updateSet(ei, si, 'rpe', e.target.value)}
                      placeholder="RPE"
                    />
                    <button style={s.removeSetBtn} onClick={() => removeSet(ei, si)}>×</button>
                  </div>
                ) : (
                  <div key={set.id || si} style={{ ...s.setChip, ...(set.type === 'W' ? s.setChipWarmup : {}) }}>
                    <span style={{ ...s.setNum, ...(set.type && set.type !== 'N' ? setTypeBadgeStyle(set.type) : {}) }}>
                      {set.type && set.type !== 'N' ? set.type : si + 1}
                    </span>
                    <span style={s.setVal}>{set.weight} {unit} × {set.reps}</span>
                    {set.rpe && <span style={s.setRpe}>RPE {set.rpe}</span>}
                  </div>
                )
              )}
              {editing && (
                <button style={s.addSetBtn} onClick={() => addSet(ei)}>+ Add set</button>
              )}
            </div>
          </div>
        ))}

        {editing && (
          <button style={s.addExerciseBtn} onClick={() => setAddingEx(true)}>+ Add Exercise</button>
        )}

        {addingEx && (
          <div style={s.exOverlay}>
            <div style={s.exOverlayInner}>
              <div style={s.exOverlayHeader}>
                <button style={s.backBtn} onClick={() => { setAddingEx(false); setExQuery(''); setExResults([]) }}>← Cancel</button>
                <span style={s.exOverlayTitle}>Add Exercise</span>
              </div>
              <input
                style={s.exSearch}
                placeholder="Search exercise…"
                value={exQuery}
                autoFocus
                onChange={e => searchEx(e.target.value)}
              />
              {exResults.map(ex => (
                <button key={ex.id} style={s.exRow} onClick={() => addExercise(ex)}>
                  <div style={s.exRowName}>{ex.name}</div>
                  <div style={s.exRowMeta}>{ex.muscle} · {ex.equipment}</div>
                </button>
              ))}
              {exResults.length === 0 && exQuery.length > 0 && (
                <p style={s.exHint}>No results for "{exQuery}"</p>
              )}
              {exResults.length === 0 && exQuery.length === 0 && (
                <p style={s.exHint}>Start typing to search exercises</p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── List view ───────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={s.container}><div style={s.loading}>Loading history…</div></div>
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
              {log.status !== 'complete' && <span style={s.draftPill}>not finished</span>}
              {log.prs?.length > 0 && <span style={s.prPill}>🏆 {log.prs.length} PR{log.prs.length > 1 ? 's' : ''}</span>}
            </div>
          </div>
          <span style={s.chevron}>›</span>
        </button>
      ))}
    </div>
  )
}

function setTypeBadgeStyle(type) {
  if (type === 'W') return { color:'#b87830', fontWeight:'700' }
  if (type === 'D') return { color:'#4870a8', fontWeight:'700' }
  if (type === 'F') return { color:'#c03c3c', fontWeight:'700' }
  return {}
}

const s = {
  container:    { display:'flex', flexDirection:'column', gap:'10px', paddingBottom:'32px' },
  loading:      { textAlign:'center', color:'var(--text-tertiary)', padding:'48px 0', fontSize:'14px' },
  header:       { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' },
  title:        { fontSize:'20px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em' },
  count:        { fontSize:'13px', color:'var(--text-tertiary)' },

  card:         { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', cursor:'pointer', textAlign:'left', width:'100%' },
  cardLeft:     { flex:1, display:'flex', flexDirection:'column', gap:'2px' },
  cardDate:     { fontSize:'11px', fontWeight:'600', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em' },
  cardName:     { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', marginTop:'2px' },
  cardMeta:     { display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'var(--text-secondary)', marginTop:'4px' },
  prPill:       { fontSize:'11px', fontWeight:'600', color:'var(--accent)', background:'var(--accent-dim)', padding:'2px 8px', borderRadius:'var(--r-full)' },
  draftPill:    { fontSize:'11px', fontWeight:'600', color:'var(--text-tertiary)', background:'var(--bg-elevated)', padding:'2px 8px', borderRadius:'var(--r-full)' },
  chevron:      { fontSize:'20px', color:'var(--text-tertiary)', flexShrink:0, lineHeight:1 },

  empty:        { display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', padding:'56px 16px' },
  emptyIcon:    { fontSize:'48px' },
  emptyTitle:   { fontSize:'17px', fontWeight:'600', color:'var(--text-primary)' },
  emptySub:     { fontSize:'14px', color:'var(--text-tertiary)', textAlign:'center' },

  // Detail / edit header
  backBtn:      { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0 },
  editBtn:      { background:'none', border:'none', color:'var(--accent)', fontSize:'14px', fontWeight:'600', cursor:'pointer', padding:0 },
  cancelBtn:    { background:'none', border:'none', color:'var(--text-secondary)', fontSize:'14px', cursor:'pointer', padding:0 },
  saveBtn:      { background:'var(--accent)', border:'none', color:'#fff', fontSize:'14px', fontWeight:'600', cursor:'pointer', padding:'6px 14px', borderRadius:'var(--r-lg)' },
  deleteBtn:    { background:'none', border:'none', color:'var(--red, #cc3333)', fontSize:'14px', fontWeight:'600', cursor:'pointer', padding:0 },

  detailName:   { fontSize:'22px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em', marginTop:'8px' },
  detailDate:   { fontSize:'13px', color:'var(--text-tertiary)', marginBottom:'4px' },
  statRow:      { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  stat:         { display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', padding:'16px 8px', borderRight:'0.5px solid var(--border-subtle)' },
  statVal:      { fontSize:'20px', fontWeight:'700', color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.03em' },
  statLbl:      { fontSize:'11px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em' },
  prBanner:     { display:'flex', flexWrap:'wrap', gap:'6px' },
  prChip:       { fontSize:'12px', fontWeight:'600', color:'var(--accent)', background:'var(--accent-dim)', padding:'5px 10px', borderRadius:'var(--r-full)' },

  exCard:       { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' },
  exNameRow:    { display:'flex', alignItems:'center', justifyContent:'space-between' },
  exName:       { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.01em' },
  removeExBtn:  { background:'none', border:'none', color:'var(--red, #cc3333)', fontSize:'12px', fontWeight:'600', cursor:'pointer', padding:'2px 0' },
  addExerciseBtn: { padding:'13px', background:'var(--bg-surface)', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-xl)', color:'var(--accent)', fontSize:'14px', fontWeight:'600', cursor:'pointer' },
  exOverlay:    { position:'fixed', inset:0, background:'var(--bg-base)', zIndex:200, overflowY:'auto' },
  exOverlayInner: { display:'flex', flexDirection:'column', gap:'0', padding:'16px' },
  exOverlayHeader: { display:'flex', alignItems:'center', gap:'12px', marginBottom:'8px' },
  exOverlayTitle: { fontSize:'18px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  exSearch:     { padding:'12px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', fontSize:'15px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box', marginBottom:'8px' },
  exRow:        { display:'flex', flexDirection:'column', gap:'2px', padding:'12px 0', background:'transparent', border:'none', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left', width:'100%' },
  exRowName:    { fontSize:'15px', color:'var(--text-primary)', fontWeight:'500' },
  exRowMeta:    { fontSize:'12px', color:'var(--text-tertiary)', textTransform:'capitalize' },
  exHint:       { fontSize:'13px', color:'var(--text-tertiary)', textAlign:'center', padding:'24px 0' },
  setList:      { display:'flex', flexDirection:'column', gap:'6px' },

  // Read-only set chip
  setChip:      { display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'var(--bg-elevated)', borderRadius:'var(--r-md)' },
  setNum:       { width:'20px', fontSize:'12px', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)', textAlign:'center', flexShrink:0 },
  setVal:       { flex:1, fontSize:'14px', fontWeight:'500', color:'var(--text-primary)', fontFamily:'var(--font-mono)' },
  setRpe:       { fontSize:'11px', color:'var(--text-secondary)', background:'var(--bg-surface)', padding:'2px 7px', borderRadius:'var(--r-full)' },

  // Set type in history
  setChipWarmup: { opacity: 0.75 },

  // Edit mode rows
  editRow:      { display:'flex', alignItems:'center', gap:'6px', padding:'4px 0' },
  editInput:    { width:'60px', padding:'7px 8px', background:'var(--bg-elevated)', border:'0.5px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--text-primary)', fontSize:'14px', fontFamily:'var(--font-mono)', textAlign:'center', outline:'none' },
  editSep:      { fontSize:'13px', color:'var(--text-tertiary)', flexShrink:0 },
  removeSetBtn: { background:'none', border:'none', color:'var(--text-tertiary)', fontSize:'18px', cursor:'pointer', padding:'0 4px', lineHeight:1, marginLeft:'auto' },
  addSetBtn:    { background:'none', border:'none', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer', padding:'6px 0', textAlign:'left' },
}
