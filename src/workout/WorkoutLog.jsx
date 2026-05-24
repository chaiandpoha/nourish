import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { generateId } from '../auth/crypto.js'
import { searchExercises, getAlternates } from './ExerciseDB.js'

export default function WorkoutLog({ programme, day, onFinish, onCancel }) {
  const [sets,        setSets]        = useState({}) // exerciseId -> [{ weight, reps, rpe, done }]
  const [elapsed,     setElapsed]     = useState(0)
  const [restTimer,   setRestTimer]   = useState(null) // seconds remaining
  const [restActive,  setRestActive]  = useState(false)
  const [extraEx,     setExtraEx]     = useState([])
  const [swapTarget,  setSwapTarget]  = useState(null)
  const [addingEx,    setAddingEx]    = useState(false)
  const [exQuery,     setExQuery]     = useState('')
  const [exResults,   setExResults]   = useState([])
  const [prs,         setPrs]         = useState([])
  const [finishing,   setFinishing]   = useState(false)
  const startTime  = useRef(Date.now())
  const timerRef   = useRef(null)
  const restRef    = useRef(null)
  const { user }   = useAuth()

  const exercises = [...(day?.exercises || []), ...extraEx]
  const sessionName = day?.name || 'Ad-hoc Workout'

  // Elapsed timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  // Rest timer
  useEffect(() => {
    if (!restActive || restTimer <= 0) return
    restRef.current = setTimeout(() => {
      setRestTimer(t => {
        if (t <= 1) {
          setRestActive(false)
          playBeep()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearTimeout(restRef.current)
  }, [restActive, restTimer])

  // Exercise search
  useEffect(() => {
    if (!exQuery.trim()) { setExResults([]); return }
    setExResults(searchExercises(exQuery, 8))
  }, [exQuery])

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      osc.connect(ctx.destination)
      osc.frequency.value = 880
      osc.start()
      osc.stop(ctx.currentTime + 0.3)
    } catch {}
  }

  function getSets(exId) {
    return sets[exId] || []
  }

  function addSet(exId, targetWeight, targetReps) {
    const prev = getSets(exId)
    const last = prev[prev.length - 1]
    setSets(s => ({
      ...s,
      [exId]: [...prev, {
        weight: last?.weight ?? targetWeight ?? 0,
        reps:   last?.reps   ?? targetReps   ?? 10,
        rpe:    '',
        done:   false,
      }]
    }))
  }

  function updateSet(exId, setIdx, field, value) {
    setSets(s => ({
      ...s,
      [exId]: s[exId].map((set, i) =>
        i === setIdx ? { ...set, [field]: value } : set
      )
    }))
  }

  function completeSet(exId, setIdx) {
    setSets(s => ({
      ...s,
      [exId]: s[exId].map((set, i) =>
        i === setIdx ? { ...set, done: true } : set
      )
    }))
    // Start rest timer
    setRestTimer(90)
    setRestActive(true)
  }

  function removeSet(exId, setIdx) {
    setSets(s => ({
      ...s,
      [exId]: s[exId].filter((_, i) => i !== setIdx)
    }))
  }

  function swapExercise(oldEx, newEx) {
    setExtraEx(prev => [...prev.filter(e => e.id !== oldEx.id), {
      ...newEx,
      sets:   oldEx.sets,
      reps:   oldEx.reps,
      weight: oldEx.weight,
    }])
    // Move sets
    setSets(s => {
      const copy = { ...s }
      copy[newEx.id] = copy[oldEx.id] || []
      delete copy[oldEx.id]
      return copy
    })
    setSwapTarget(null)
  }

  function addExercise(ex) {
    setExtraEx(prev => [...prev, { ...ex, sets: 3, reps: 10, weight: 0 }])
    setAddingEx(false)
    setExQuery('')
  }

  async function handleFinish() {
    setFinishing(true)
    try {
      const workoutLogId = generateId()
      const date         = new Date().toISOString().slice(0, 10)
      const duration     = Math.floor((Date.now() - startTime.current) / 1000)

      // Detect PRs
      const detectedPrs = []
      for (const ex of exercises) {
        const exSets = getSets(ex.id).filter(s => s.done)
        if (!exSets.length) continue

        const maxWeight = Math.max(...exSets.map(s => parseFloat(s.weight) || 0))
        const maxVolume = exSets.reduce((sum, s) =>
          sum + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0
        )

        // Check previous best
        const prevSets = await db.workoutSets
          .where('userId').equals(user.id)
          .and(s => s.exerciseId === ex.id)
          .toArray()

        const prevMaxWeight = prevSets.length
          ? Math.max(...prevSets.map(s => s.weight || 0))
          : 0
        const prevMaxVolume = prevSets.length
          ? prevSets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0)
          : 0

        if (maxWeight > prevMaxWeight) {
          detectedPrs.push({ exercise: ex.name, type: 'weight', value: maxWeight })
        } else if (maxVolume > prevMaxVolume) {
          detectedPrs.push({ exercise: ex.name, type: 'volume', value: maxVolume })
        }
      }
      setPrs(detectedPrs)

      // Save workout log
      await db.workoutLogs.add({
        id:        workoutLogId,
        userId:    user.id,
        date,
        name:      sessionName,
        programmeId: programme?.id || null,
        dayName:   day?.name || null,
        duration,
        prs:       detectedPrs,
        dirty:     1,
        updatedAt: new Date().toISOString(),
      })

      // Save sets
      for (const ex of exercises) {
        const exSets = getSets(ex.id).filter(s => s.done)
        for (const set of exSets) {
          await db.workoutSets.add({
            userId:       user.id,
            workoutLogId,
            exerciseId:   ex.id,
            exerciseName: ex.name,
            weight:       parseFloat(set.weight) || 0,
            reps:         parseInt(set.reps)     || 0,
            rpe:          set.rpe ? parseInt(set.rpe) : null,
            date,
            dirty:        1,
            updatedAt:    new Date().toISOString(),
          })
        }
      }

      onFinish?.({ prs: detectedPrs, duration, setsLogged: Object.values(sets).flat().filter(s => s.done).length })
    } catch (e) {
      console.error('Finish workout error:', e)
    } finally {
      setFinishing(false)
    }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (swapTarget) {
    const alternates = getAlternates(swapTarget.id)
    return (
      <div style={st.container}>
        <button style={st.backBtn} onClick={() => setSwapTarget(null)}>← Back</button>
        <h3 style={st.sectionTitle}>Swap: {swapTarget.name}</h3>
        <p style={st.hint}>Alternates for same muscle group:</p>
        {alternates.map(alt => (
          <button key={alt.id} style={st.swapRow} onClick={() => swapExercise(swapTarget, alt)}>
            <span style={st.swapName}>{alt.name}</span>
            <span style={st.swapMeta}>{alt.equipment}</span>
          </button>
        ))}
        {alternates.length === 0 && (
          <p style={st.hint}>No alternates — use search below</p>
        )}
        <input
          style={st.searchInput}
          placeholder="Search any exercise…"
          value={exQuery}
          onChange={e => setExQuery(e.target.value)}
        />
        {exResults.map(ex => (
          <button key={ex.id} style={st.swapRow} onClick={() => swapExercise(swapTarget, ex)}>
            <span style={st.swapName}>{ex.name}</span>
            <span style={st.swapMeta}>{ex.muscle} · {ex.equipment}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div style={st.container}>
      {/* Header */}
      <div style={st.header}>
        <div>
          <div style={st.sessionName}>{sessionName}</div>
          <div style={st.elapsed}>{formatTime(elapsed)}</div>
        </div>
        <button
          style={{ ...st.finishBtn, opacity: finishing ? 0.6 : 1 }}
          onClick={handleFinish}
          disabled={finishing}
        >
          {finishing ? 'Saving…' : 'Finish'}
        </button>
      </div>

      {/* Rest timer */}
      {restActive && (
        <div style={st.restBanner}>
          <span style={st.restLabel}>Rest</span>
          <span style={st.restTime}>{formatTime(restTimer)}</span>
          <button style={st.restSkip} onClick={() => setRestActive(false)}>Skip</button>
        </div>
      )}

      {/* Exercises */}
      {exercises.map((ex, exIdx) => {
        const exSets     = getSets(ex.id)
        const prevSetsData = [] // could load from db for reference

        return (
          <div key={ex.id} style={st.exCard}>
            <div style={st.exHeader}>
              <div>
                <div style={st.exName}>{ex.name}</div>
                <div style={st.exMeta}>{ex.muscle} · {ex.equipment || ex.movement}</div>
              </div>
              <button style={st.swapBtn} onClick={() => setSwapTarget(ex)}>
                Swap
              </button>
            </div>

            {/* Target from programme */}
            {ex.sets && (
              <div style={st.targetRow}>
                Target: {ex.sets} × {ex.reps} @ {ex.weight}lbs
              </div>
            )}

            {/* Set rows */}
            <div style={st.setHeader}>
              <span style={st.setCol}>Set</span>
              <span style={st.setCol}>lbs</span>
              <span style={st.setCol}>Reps</span>
              <span style={st.setCol}>RPE</span>
              <span style={st.setCol}></span>
            </div>

            {exSets.map((set, setIdx) => (
              <div
                key={setIdx}
                style={{
                  ...st.setRow,
                  ...(set.done ? st.setRowDone : {})
                }}
              >
                <span style={st.setNum}>{setIdx + 1}</span>
                <input
                  style={st.setInput}
                  type="number" inputMode="decimal"
                  value={set.weight}
                  onChange={e => updateSet(ex.id, setIdx, 'weight', e.target.value)}
                  disabled={set.done}
                />
                <input
                  style={st.setInput}
                  type="number" inputMode="numeric"
                  value={set.reps}
                  onChange={e => updateSet(ex.id, setIdx, 'reps', e.target.value)}
                  disabled={set.done}
                />
                <input
                  style={{ ...st.setInput, width:'36px' }}
                  type="number" inputMode="numeric"
                  placeholder="—"
                  value={set.rpe}
                  onChange={e => updateSet(ex.id, setIdx, 'rpe', e.target.value)}
                  disabled={set.done}
                />
                {set.done ? (
                  <span style={st.doneCheck}>✓</span>
                ) : (
                  <button style={st.completeBtn} onClick={() => completeSet(ex.id, setIdx)}>✓</button>
                )}
              </div>
            ))}

            <button
              style={st.addSetBtn}
              onClick={() => addSet(ex.id, ex.weight, ex.reps)}
            >
              + Add Set
            </button>
          </div>
        )
      })}

      {/* Add exercise */}
      {addingEx && (
        <div style={{ position:"fixed", inset:0, background:"var(--bg-base)", zIndex:200, display:"flex", flexDirection:"column" }}>
          <ExercisePicker
            onSelect={ex => { addExercise(ex); setAddingEx(false) }}
            onCancel={() => setAddingEx(false)}
          />
        </div>
      )}
      <button style={st.addExBtn} onClick={() => setAddingEx(true)}>
        + Add Exercise
      </button>

      {/* Cancel */}
      <button style={st.cancelBtn} onClick={onCancel}>Cancel Workout</button>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = {
  container:   { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'32px' },
  header:      { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0' },
  sessionName: { fontSize:'18px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  elapsed:     { fontSize:'13px', color:'var(--text-tertiary)', marginTop:'2px', fontFamily:'var(--font-mono)' },
  finishBtn:   { padding:'10px 20px', background:'var(--accent)', border:'none', borderRadius:'var(--r-lg)', color:'#fff', fontSize:'15px', fontWeight:'600', cursor:'pointer' },
  restBanner:  { display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', background:'var(--accent-dim)', border:'1px solid var(--accent)', borderRadius:'var(--r-lg)' },
  restLabel:   { fontSize:'13px', fontWeight:'600', color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.06em' },
  restTime:    { flex:1, fontSize:'24px', fontWeight:'300', color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.03em' },
  restSkip:    { padding:'6px 12px', background:'transparent', border:'1px solid var(--accent)', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', cursor:'pointer' },
  exCard:      { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  exHeader:    { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:'0.5px solid var(--border-subtle)' },
  exName:      { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.01em' },
  exMeta:      { fontSize:'12px', color:'var(--text-tertiary)', textTransform:'capitalize', marginTop:'2px' },
  swapBtn:     { padding:'6px 12px', background:'var(--bg-elevated)', border:'none', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'12px', fontWeight:'500', cursor:'pointer' },
  targetRow:   { padding:'8px 16px', fontSize:'12px', color:'var(--text-tertiary)', background:'var(--bg-elevated)', borderBottom:'0.5px solid var(--border-subtle)' },
  setHeader:   { display:'grid', gridTemplateColumns:'32px 1fr 1fr 48px 36px', gap:'6px', padding:'8px 16px 4px', alignItems:'center' },
  setCol:      { fontSize:'10px', fontWeight:'600', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center' },
  setRow:      { display:'grid', gridTemplateColumns:'32px 1fr 1fr 48px 36px', gap:'6px', padding:'6px 16px', alignItems:'center', borderTop:'0.5px solid var(--border-subtle)' },
  setRowDone:  { background:'var(--accent-dim)', opacity:0.8 },
  setNum:      { fontSize:'13px', color:'var(--text-tertiary)', textAlign:'center', fontFamily:'var(--font-mono)' },
  setInput:    { padding:'7px 6px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'14px', color:'var(--text-primary)', outline:'none', textAlign:'center', width:'100%' },
  doneCheck:   { color:'var(--accent)', fontSize:'16px', fontWeight:'700', textAlign:'center' },
  completeBtn: { padding:'6px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', color:'var(--text-secondary)', fontSize:'14px', cursor:'pointer', textAlign:'center' },
  addSetBtn:   { margin:'8px 16px', padding:'8px', background:'transparent', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-md)', color:'var(--text-tertiary)', fontSize:'13px', cursor:'pointer' },
  backBtn:     { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0, alignSelf:'flex-start' },
  sectionTitle:{ fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  hint:        { fontSize:'13px', color:'var(--text-tertiary)', margin:0 },
  swapRow:     { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'11px 14px', background:'transparent', border:'none', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left' },
  swapName:    { fontSize:'14px', color:'var(--text-primary)', fontWeight:'500' },
  swapMeta:    { fontSize:'12px', color:'var(--text-tertiary)', textTransform:'capitalize' },
  searchInput: { padding:'11px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'14px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box' },
  addExCard:   { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'14px', display:'flex', flexDirection:'column', gap:'8px' },
  addExBtn:    { padding:'13px', background:'var(--bg-elevated)', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-lg)', color:'var(--text-secondary)', fontSize:'14px', fontWeight:'500', cursor:'pointer' },
  cancelAddBtn:{ padding:'10px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'13px', cursor:'pointer' },
  cancelBtn:   { padding:'13px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--red)', fontSize:'14px', cursor:'pointer' },
}