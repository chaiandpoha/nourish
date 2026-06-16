import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { searchExercises } from './ExerciseDB.js'
import { generateId } from '../auth/crypto.js'

export default function ProgramManager({ onStartWorkout }) {
  const [programmes,     setProgrammes]     = useState([])
  const [screen,         setScreen]         = useState('list') // list | create | view
  const [selected,       setSelected]       = useState(null)
  const [confirmDelete,  setConfirmDelete]  = useState(null)
  const { user } = useAuth()

  useEffect(() => { loadProgrammes() }, [user])

  async function loadProgrammes() {
    if (!user) return
    const progs = await db.programmes.where('userId').equals(user.id).toArray()
    setProgrammes(progs)
  }

  async function handleSetActive(progId) {
    if (!user) return
    const all = await db.programmes.where('userId').equals(user.id).toArray()
    for (const p of all) {
      await db.programmes.update(p.id, { active: 0, dirty: 1 })
    }
    await db.programmes.update(progId, { active: 1, dirty: 1 })
    loadProgrammes()
  }

  async function handleDelete(progId) {
    if (confirmDelete !== progId) { setConfirmDelete(progId); return }
    setConfirmDelete(null)
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

  const activeProg = programmes.find(p => p.active === 1)

  return (
    <div style={s.container}>

      {/* Quick Start */}
      <div style={s.quickCard}>
        <div style={s.quickLeft}>
          <div style={s.quickTitle}>Quick Start</div>
          <div style={s.quickSub}>Empty session — add exercises as you go</div>
        </div>
        <button
          style={s.quickBtn}
          onClick={() => onStartWorkout(null, { name: 'Quick Workout', exercises: [] })}
        >
          Start
        </button>
      </div>

      {/* Active programme */}
      {activeProg && (
        <div style={s.section}>
          <div style={s.sectionLabel}>Active Programme</div>
          <div style={s.activeCard}>
            <div style={s.activeHeader}>
              <div>
                <div style={s.activeName}>{activeProg.name}</div>
                <div style={s.activeMeta}>
                  {activeProg.days?.length || 0} days ·{' '}
                  {activeProg.days?.reduce((n, d) => n + (d.exercises?.length || 0), 0)} exercises
                </div>
              </div>
              <button style={s.managePill} onClick={() => { setSelected(activeProg); setScreen('view') }}>
                Manage
              </button>
            </div>
            <div style={s.dayGrid}>
              {activeProg.days?.map((day, i) => (
                <button
                  key={i}
                  style={s.dayTile}
                  onClick={() => onStartWorkout(activeProg, day)}
                >
                  <div style={s.dayTileName}>{day.name || `Day ${i + 1}`}</div>
                  <div style={s.dayTileEx}>{day.exercises?.length || 0} exercises</div>
                  <div style={s.dayTileStart}>▶</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* All programmes */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <div style={s.sectionLabel}>Programmes</div>
          <button style={s.newBtn} onClick={() => setScreen('create')}>+ New</button>
        </div>

        {programmes.length === 0 ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}>🗓️</div>
            <div style={s.emptyText}>No programmes yet</div>
            <div style={s.emptySub}>Build a programme to follow a training plan</div>
            <button style={s.createBtn} onClick={() => setScreen('create')}>
              Create Programme
            </button>
          </div>
        ) : (
          programmes.map(prog => (
            <div key={prog.id} style={s.card}>
              <button
                style={s.cardMain}
                onClick={() => { setSelected(prog); setScreen('view') }}
              >
                <div style={s.cardTop}>
                  <span style={s.progName}>{prog.name}</span>
                  {prog.active === 1 && <span style={s.activeBadge}>Active</span>}
                </div>
                <div style={s.progMeta}>
                  {prog.days?.length || 0} days ·{' '}
                  {prog.days?.reduce((n, d) => n + (d.exercises?.length || 0), 0)} exercises
                </div>
              </button>
              <div style={s.cardActions}>
                {prog.active !== 1 && (
                  <button style={s.setActiveBtn} onClick={() => handleSetActive(prog.id)}>
                    Set Active
                  </button>
                )}
                {confirmDelete === prog.id ? (
                  <>
                    <button style={{ ...s.deleteBtn, color: '#fff', background: 'var(--red)', border: 'none' }} onClick={() => handleDelete(prog.id)}>Confirm</button>
                    <button style={s.setActiveBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
                  </>
                ) : (
                  <button style={s.deleteBtn} onClick={() => handleDelete(prog.id)}>Delete</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── ViewProgram ──────────────────────────────────────────────────────────────

function ViewProgram({ programme, onStartWorkout, onBack }) {
  return (
    <div style={s.container}>
      <button style={s.backBtn} onClick={onBack}>← Back</button>
      <div style={s.viewTitle}>{programme.name}</div>

      {programme.days?.map((day, i) => (
        <div key={i} style={s.dayCard}>
          <div style={s.dayHeader}>
            <div>
              <div style={s.dayName}>{day.name || `Day ${i + 1}`}</div>
              <div style={s.dayMeta}>{day.exercises?.length || 0} exercises</div>
            </div>
            <button
              style={s.startBtn}
              onClick={() => onStartWorkout(programme, day)}
            >
              Start ▶
            </button>
          </div>
          <div style={s.exList}>
            {day.exercises?.map((ex, j) => (
              <div key={j} style={s.exRow}>
                <span style={s.exName}>{ex.name}</span>
                <span style={s.exTarget}>{ex.sets} × {ex.reps}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── CreateProgram ────────────────────────────────────────────────────────────

function CreateProgram({ userId, onSave, onCancel }) {
  const [name,   setName]   = useState('')
  const [days,   setDays]   = useState([{ name: 'Day 1', exercises: [] }])
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

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
      <div style={s.viewTitle}>New Programme</div>

      <input
        style={s.input}
        placeholder="Programme name, e.g. Push Pull Legs"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
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
      <button style={s.dayHeaderBtn} onClick={() => setOpen(o => !o)}>
        <input
          style={s.dayNameInput}
          value={day.name}
          onChange={e => { e.stopPropagation(); onNameChange(e.target.value) }}
          onClick={e => e.stopPropagation()}
          placeholder="Day name, e.g. Push"
        />
        <span style={s.dayCount}>{day.exercises.length} ex</span>
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
  container:    { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'24px' },
  backBtn:      { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0, alignSelf:'flex-start' },

  // Quick Start
  quickCard:    { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 18px', background:'var(--accent)', borderRadius:'var(--r-xl)', gap:'12px' },
  quickLeft:    { flex:1, minWidth:0 },
  quickTitle:   { fontSize:'17px', fontWeight:'700', color:'#fff', letterSpacing:'-0.02em' },
  quickSub:     { fontSize:'12px', color:'rgba(255,255,255,0.75)', marginTop:'2px' },
  quickBtn:     { padding:'10px 20px', background:'rgba(255,255,255,0.2)', border:'1.5px solid rgba(255,255,255,0.4)', borderRadius:'var(--r-lg)', color:'#fff', fontSize:'15px', fontWeight:'700', cursor:'pointer', flexShrink:0 },

  // Sections
  section:      { display:'flex', flexDirection:'column', gap:'8px' },
  sectionHeader:{ display:'flex', alignItems:'center', justifyContent:'space-between' },
  sectionLabel: { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.07em' },
  newBtn:       { padding:'6px 14px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },

  // Active programme card
  activeCard:   { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  activeHeader: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px 12px' },
  activeName:   { fontSize:'17px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em' },
  activeMeta:   { fontSize:'13px', color:'var(--text-secondary)', marginTop:'2px' },
  managePill:   { padding:'7px 14px', background:'var(--bg-elevated)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-full)', color:'var(--text-secondary)', fontSize:'13px', fontWeight:'500', cursor:'pointer', flexShrink:0 },
  dayGrid:      { display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'0', borderTop:'0.5px solid var(--border-subtle)' },
  dayTile:      { display:'flex', flexDirection:'column', gap:'2px', padding:'14px 16px', background:'transparent', border:'none', borderRight:'0.5px solid var(--border-subtle)', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left', position:'relative' },
  dayTileName:  { fontSize:'14px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.01em' },
  dayTileEx:    { fontSize:'12px', color:'var(--text-tertiary)' },
  dayTileStart: { position:'absolute', top:'50%', right:'14px', transform:'translateY(-50%)', fontSize:'14px', color:'var(--accent)', fontWeight:'700' },

  // Programme list cards
  card:         { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  cardMain:     { width:'100%', padding:'14px 16px', background:'transparent', border:'none', textAlign:'left', cursor:'pointer', display:'flex', flexDirection:'column', gap:'4px' },
  cardTop:      { display:'flex', alignItems:'center', justifyContent:'space-between' },
  progName:     { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  activeBadge:  { fontSize:'11px', fontWeight:'600', background:'var(--accent-dim)', color:'var(--accent)', padding:'3px 10px', borderRadius:'var(--r-full)', letterSpacing:'0.04em', textTransform:'uppercase' },
  progMeta:     { fontSize:'13px', color:'var(--text-secondary)' },
  cardActions:  { display:'flex', gap:'8px', padding:'10px 16px', borderTop:'0.5px solid var(--border-subtle)' },
  setActiveBtn: { padding:'7px 14px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  deleteBtn:    { padding:'7px 14px', background:'rgba(200,80,64,0.08)', border:'none', borderRadius:'var(--r-md)', color:'var(--red)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },

  // Empty
  empty:        { display:'flex', flexDirection:'column', alignItems:'center', padding:'40px 16px', gap:'8px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)' },
  emptyIcon:    { fontSize:'40px' },
  emptyText:    { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', margin:0 },
  emptySub:     { fontSize:'14px', color:'var(--text-secondary)', textAlign:'center', margin:0 },
  createBtn:    { marginTop:'6px', padding:'12px 24px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'15px', fontWeight:'600', cursor:'pointer' },

  // View programme
  viewTitle:    { fontSize:'22px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em', marginTop:'6px' },
  dayCard:      { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  dayHeader:    { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px' },
  dayHeaderBtn: { display:'flex', alignItems:'center', gap:'8px', padding:'12px 14px', background:'transparent', border:'none', width:'100%', cursor:'pointer', borderBottom:'0.5px solid var(--border-subtle)' },
  dayName:      { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  dayMeta:      { fontSize:'12px', color:'var(--text-tertiary)', marginTop:'2px' },
  dayNameInput: { flex:1, background:'transparent', border:'none', fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', outline:'none', padding:0 },
  dayCount:     { fontSize:'12px', color:'var(--text-tertiary)' },
  chevron:      { fontSize:'14px', color:'var(--text-tertiary)', flexShrink:0 },
  startBtn:     { padding:'9px 18px', background:'var(--accent)', border:'none', borderRadius:'var(--r-lg)', color:'#fff', fontSize:'14px', fontWeight:'600', cursor:'pointer', flexShrink:0 },
  exList:       { display:'flex', flexDirection:'column' },
  exRow:        { display:'flex', alignItems:'flex-start', gap:'8px', padding:'10px 16px', borderTop:'0.5px solid var(--border-subtle)' },
  exLeft:       { flex:1, display:'flex', flexDirection:'column', gap:'5px' },
  exName:       { fontSize:'14px', fontWeight:'500', color:'var(--text-primary)' },
  exTarget:     { fontSize:'12px', color:'var(--text-secondary)' },
  exControls:   { display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' },
  exLabel:      { fontSize:'11px', color:'var(--text-tertiary)', fontWeight:'500' },
  exInput:      { width:'50px', padding:'6px 6px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'14px', color:'var(--text-primary)', outline:'none', textAlign:'center' },
  removeBtn:    { background:'none', border:'none', color:'var(--text-tertiary)', fontSize:'16px', cursor:'pointer', padding:'4px', flexShrink:0 },

  // Create
  input:        { padding:'13px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', fontSize:'15px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box' },
  searchInput:  { padding:'11px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'14px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box', margin:'8px 0 0' },
  resultRow:    { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'10px 14px', background:'transparent', border:'none', borderTop:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left' },
  resultName:   { fontSize:'14px', color:'var(--text-primary)', fontWeight:'500' },
  resultMeta:   { fontSize:'12px', color:'var(--text-tertiary)', textTransform:'capitalize' },
  addDayBtn:    { padding:'13px', background:'var(--bg-elevated)', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-lg)', color:'var(--text-secondary)', fontSize:'14px', fontWeight:'500', cursor:'pointer' },
  saveBtn:      { width:'100%', padding:'16px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-xl)', color:'var(--text-inverse)', fontSize:'16px', fontWeight:'700', cursor:'pointer', letterSpacing:'-0.01em' },
  error:        { fontSize:'13px', color:'var(--red)', margin:0 },
}
