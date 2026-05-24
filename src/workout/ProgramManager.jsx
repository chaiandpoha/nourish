import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { searchExercises, MUSCLE_GROUPS } from './ExerciseDB.js'
import { generateId } from '../auth/crypto.js'

export default function ProgramManager({ onStartWorkout }) {
  const [programmes, setProgrammes] = useState([])
  const [screen,     setScreen]     = useState('list') // list | create | view
  const [selected,   setSelected]   = useState(null)
  const { user } = useAuth()

  useEffect(() => { loadProgrammes() }, [user])

  async function loadProgrammes() {
    if (!user) return
    const progs = await db.programmes.where('userId').equals(user.id).toArray()
    setProgrammes(progs)
  }

  async function handleSetActive(progId) {
    if (!user) return
    // Deactivate all
    const all = await db.programmes.where('userId').equals(user.id).toArray()
    for (const p of all) {
      await db.programmes.update(p.id, { active: 0, dirty: 1 })
    }
    // Activate selected
    await db.programmes.update(progId, { active: 1, dirty: 1 })
    loadProgrammes()
  }

  async function handleDelete(progId) {
    await db.programmes.delete(progId)
    loadProgrammes()
  }

  if (screen === 'create') {
    return (
      <CreateProgram
        userId={user?.id}
        onSave={() => { setScreen('list'); loadProgrammes() }}
        onCancel={() => setScreen('list')}
      />
    )
  }

  if (screen === 'view' && selected) {
    return (
      <ViewProgram
        programme={selected}
        onStartWorkout={onStartWorkout}
        onBack={() => setScreen('list')}
      />
    )
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>Programmes</span>
        <button style={s.newBtn} onClick={() => setScreen('create')}>+ New</button>
      </div>

      {programmes.length === 0 && (
        <div style={s.empty}>
          <div style={s.emptyIcon}>💪</div>
          <p style={s.emptyText}>No programmes yet</p>
          <p style={s.emptySub}>Create a programme to track your workouts</p>
          <button style={s.createBtn} onClick={() => setScreen('create')}>
            Create Programme
          </button>
        </div>
      )}

      {programmes.map(prog => (
        <div key={prog.id} style={s.card}>
          <button
            style={s.cardMain}
            onClick={() => { setSelected(prog); setScreen('view') }}
          >
            <div style={s.cardTop}>
              <span style={s.progName}>{prog.name}</span>
              {prog.active === 1 && (
                <span style={s.activeBadge}>Active</span>
              )}
            </div>
            <div style={s.progMeta}>
              {prog.days?.length || 0} days ·{' '}
              {prog.days?.reduce((s, d) => s + (d.exercises?.length || 0), 0)} exercises
            </div>
          </button>
          <div style={s.cardActions}>
            {prog.active !== 1 && (
              <button style={s.setActiveBtn} onClick={() => handleSetActive(prog.id)}>
                Set Active
              </button>
            )}
            <button style={s.deleteBtn} onClick={() => handleDelete(prog.id)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── ViewProgram ──────────────────────────────────────────────────────────────

function ViewProgram({ programme, onStartWorkout, onBack }) {
  return (
    <div style={s.container}>
      <button style={s.backBtn} onClick={onBack}>← Back</button>
      <h2 style={s.title}>{programme.name}</h2>

      {programme.days?.map((day, i) => (
        <div key={i} style={s.dayCard}>
          <div style={s.dayHeader}>
            <span style={s.dayName}>{day.name || `Day ${i + 1}`}</span>
            <button
              style={s.startBtn}
              onClick={() => onStartWorkout(programme, day)}
            >
              Start
            </button>
          </div>
          {day.exercises?.map((ex, j) => (
            <div key={j} style={s.exRow}>
              <span style={s.exName}>{ex.name}</span>
              <span style={s.exTarget}>{ex.sets} × {ex.reps} @ {ex.weight}kg</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── CreateProgram ────────────────────────────────────────────────────────────

function CreateProgram({ userId, onSave, onCancel }) {
  const [name,    setName]    = useState('')
  const [days,    setDays]    = useState([{ name: 'Day 1', exercises: [] }])
  const [error,   setError]   = useState('')
  const [saving,  setSaving]  = useState(false)

  function addDay() {
    setDays(d => [...d, { name: `Day ${d.length + 1}`, exercises: [] }])
  }

  function updateDayName(i, name) {
    setDays(d => d.map((day, idx) => idx === i ? { ...day, name } : day))
  }

  function addExercise(dayIndex, exercise) {
    setDays(d => d.map((day, idx) => {
      if (idx !== dayIndex) return day
      return {
        ...day,
        exercises: [...day.exercises, {
          id:     exercise.id,
          name:   exercise.name,
          muscle: exercise.muscle,
          sets:   3,
          reps:   10,
          weight: 0,
        }]
      }
    }))
  }

  function updateExercise(dayIndex, exIndex, field, value) {
    setDays(d => d.map((day, idx) => {
      if (idx !== dayIndex) return day
      return {
        ...day,
        exercises: day.exercises.map((ex, ei) =>
          ei === exIndex ? { ...ex, [field]: value } : ex
        )
      }
    }))
  }

  function removeExercise(dayIndex, exIndex) {
    setDays(d => d.map((day, idx) => {
      if (idx !== dayIndex) return day
      return { ...day, exercises: day.exercises.filter((_, ei) => ei !== exIndex) }
    }))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Give your programme a name'); return }
    if (!days.some(d => d.exercises.length > 0)) {
      setError('Add at least one exercise'); return
    }
    setSaving(true)
    try {
      await db.programmes.put({
        id:        generateId(),
        userId,
        name:      name.trim(),
        days,
        active:    0,
        dirty:     1,
        updatedAt: new Date().toISOString(),
      })
      onSave()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={s.container}>
      <button style={s.backBtn} onClick={onCancel}>← Back</button>
      <h2 style={s.title}>New Programme</h2>

      <input
        style={s.input}
        placeholder="Programme name e.g. Push Pull Legs"
        value={name}
        onChange={e => setName(e.target.value)}
      />

      {days.map((day, dayIndex) => (
        <DayBuilder
          key={dayIndex}
          day={day}
          dayIndex={dayIndex}
          onNameChange={name => updateDayName(dayIndex, name)}
          onAddExercise={ex => addExercise(dayIndex, ex)}
          onUpdateExercise={(exIdx, field, val) => updateExercise(dayIndex, exIdx, field, val)}
          onRemoveExercise={exIdx => removeExercise(dayIndex, exIdx)}
        />
      ))}

      <button style={s.addDayBtn} onClick={addDay}>+ Add Day</button>

      {error && <p style={s.error}>{error}</p>}

      <button
        style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving…' : 'Save Programme'}
      </button>
    </div>
  )
}

// ─── DayBuilder ───────────────────────────────────────────────────────────────

function DayBuilder({ day, dayIndex, onNameChange, onAddExercise, onUpdateExercise, onRemoveExercise }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [open,    setOpen]    = useState(dayIndex === 0)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    setResults(searchExercises(query, 8))
  }, [query])

  return (
    <div style={s.dayCard}>
      <button style={s.dayHeader} onClick={() => setOpen(o => !o)}>
        <input
          style={s.dayNameInput}
          value={day.name}
          onChange={e => { e.stopPropagation(); onNameChange(e.target.value) }}
          onClick={e => e.stopPropagation()}
          placeholder="Day name e.g. Push"
        />
        <span style={s.dayCount}>{day.exercises.length} exercises</span>
        <span style={s.chevron}>{open ? '˄' : '˅'}</span>
      </button>

      {open && (
        <>
          {day.exercises.map((ex, exIndex) => (
            <div key={exIndex} style={s.exRow}>
              <div style={s.exLeft}>
                <div style={s.exName}>{ex.name}</div>
                <div style={s.exControls}>
                  <label style={s.exLabel}>Sets</label>
                  <input
                    style={s.exInput}
                    type="number" inputMode="numeric"
                    value={ex.sets}
                    onChange={e => onUpdateExercise(exIndex, 'sets', parseInt(e.target.value) || 0)}
                  />
                  <label style={s.exLabel}>Reps</label>
                  <input
                    style={s.exInput}
                    type="number" inputMode="numeric"
                    value={ex.reps}
                    onChange={e => onUpdateExercise(exIndex, 'reps', parseInt(e.target.value) || 0)}
                  />
                  <label style={s.exLabel}>kg</label>
                  <input
                    style={s.exInput}
                    type="number" inputMode="decimal"
                    value={ex.weight}
                    onChange={e => onUpdateExercise(exIndex, 'weight', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <button style={s.removeBtn} onClick={() => onRemoveExercise(exIndex)}>✕</button>
            </div>
          ))}

          <input
            style={s.searchInput}
            placeholder="Add exercise…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {results.map(ex => (
            <button
              key={ex.id}
              style={s.resultRow}
              onClick={() => { onAddExercise(ex); setQuery(''); setResults([]) }}
            >
              <span style={s.resultName}>{ex.name}</span>
              <span style={s.resultMeta}>{ex.muscle} · {ex.movement}</span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  container:   { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'24px' },
  header:      { display:'flex', alignItems:'center', justifyContent:'space-between' },
  title:       { fontSize:'20px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  newBtn:      { padding:'7px 14px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  empty:       { display:'flex', flexDirection:'column', alignItems:'center', padding:'48px 16px', gap:'8px' },
  emptyIcon:   { fontSize:'48px', marginBottom:'8px' },
  emptyText:   { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', margin:0 },
  emptySub:    { fontSize:'14px', color:'var(--text-secondary)', textAlign:'center', margin:0 },
  createBtn:   { marginTop:'8px', padding:'12px 24px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'15px', fontWeight:'600', cursor:'pointer' },
  card:        { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  cardMain:    { width:'100%', padding:'14px 16px', background:'transparent', border:'none', textAlign:'left', cursor:'pointer', display:'flex', flexDirection:'column', gap:'4px' },
  cardTop:     { display:'flex', alignItems:'center', justifyContent:'space-between' },
  progName:    { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  activeBadge: { fontSize:'11px', fontWeight:'600', background:'var(--accent-dim)', color:'var(--accent)', padding:'3px 10px', borderRadius:'var(--r-full)', letterSpacing:'0.04em', textTransform:'uppercase' },
  progMeta:    { fontSize:'13px', color:'var(--text-secondary)' },
  cardActions: { display:'flex', gap:'8px', padding:'10px 16px', borderTop:'0.5px solid var(--border-subtle)' },
  setActiveBtn:{ padding:'6px 14px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  deleteBtn:   { padding:'6px 14px', background:'rgba(200,80,64,0.08)', border:'none', borderRadius:'var(--r-md)', color:'var(--red)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  backBtn:     { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0, alignSelf:'flex-start' },
  dayCard:     { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', overflow:'hidden' },
  dayHeader:   { display:'flex', alignItems:'center', gap:'8px', padding:'12px 14px', background:'transparent', border:'none', width:'100%', cursor:'pointer' },
  dayNameInput:{ flex:1, background:'transparent', border:'none', fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', outline:'none', padding:0 },
  dayCount:    { fontSize:'12px', color:'var(--text-tertiary)' },
  chevron:     { fontSize:'14px', color:'var(--text-tertiary)', flexShrink:0 },
  exRow:       { display:'flex', alignItems:'flex-start', gap:'8px', padding:'10px 14px', borderTop:'0.5px solid var(--border-subtle)' },
  exLeft:      { flex:1, display:'flex', flexDirection:'column', gap:'6px' },
  exName:      { fontSize:'14px', fontWeight:'500', color:'var(--text-primary)' },
  exTarget:    { fontSize:'12px', color:'var(--text-secondary)' },
  exControls:  { display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' },
  exLabel:     { fontSize:'11px', color:'var(--text-tertiary)', fontWeight:'500' },
  exInput:     { width:'48px', padding:'5px 6px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'13px', color:'var(--text-primary)', outline:'none', textAlign:'center' },
  removeBtn:   { background:'none', border:'none', color:'var(--text-tertiary)', fontSize:'14px', cursor:'pointer', padding:'4px', flexShrink:0 },
  input:       { padding:'12px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'15px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box' },
  searchInput: { padding:'11px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'14px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box', margin:'8px 0 0' },
  resultRow:   { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'10px 14px', background:'transparent', border:'none', borderTop:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left' },
  resultName:  { fontSize:'14px', color:'var(--text-primary)' },
  resultMeta:  { fontSize:'12px', color:'var(--text-tertiary)', textTransform:'capitalize' },
  addDayBtn:   { padding:'12px', background:'var(--bg-elevated)', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-lg)', color:'var(--text-secondary)', fontSize:'14px', fontWeight:'500', cursor:'pointer' },
  saveBtn:     { width:'100%', padding:'15px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'16px', fontWeight:'600', cursor:'pointer' },
  startBtn:    { padding:'7px 14px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-md)', color:'var(--text-inverse)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  error:       { fontSize:'13px', color:'var(--red)', margin:0 },
}