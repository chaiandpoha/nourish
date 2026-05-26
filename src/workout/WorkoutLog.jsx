import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { generateId } from '../auth/crypto.js'
import { searchExercises, getAlternates } from './ExerciseDB.js'

const RPE_OPTIONS = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10']
const DEFAULT_REST = 90  // seconds

export default function WorkoutLog({ programme, day, onFinish, onCancel }) {
  const { user } = useAuth()

  const [sets,       setSets]       = useState({})    // exId → [{weight,reps,rpe,done}]
  const [prevData,   setPrevData]   = useState({})    // exId → {label, weight, reps, allSets}
  const [elapsed,    setElapsed]    = useState(0)
  const [restTimer,  setRestTimer]  = useState(DEFAULT_REST)
  const [restTotal,  setRestTotal]  = useState(DEFAULT_REST)
  const [restActive, setRestActive] = useState(false)
  const [extraEx,    setExtraEx]    = useState([])
  const [swapTarget, setSwapTarget] = useState(null)
  const [addingEx,   setAddingEx]   = useState(false)
  const [exQuery,    setExQuery]    = useState('')
  const [exResults,  setExResults]  = useState([])
  const [finishing,  setFinishing]  = useState(false)
  const [summary,    setSummary]    = useState(null)
  const [rpePicker,  setRpePicker]  = useState(null)  // {exId, setIdx}

  const startRef = useRef(Date.now())
  const timerRef = useRef(null)
  const restRef  = useRef(null)

  const exercises   = [...(day?.exercises || []), ...extraEx]
  const sessionName = day?.name || 'Ad-hoc Workout'
  const exKey       = exercises.map(e => e.id).join(',')

  // ── Initialize set rows whenever exercises change ──────────────────────────
  useEffect(() => {
    setSets(prev => {
      const next = { ...prev }
      for (const ex of exercises) {
        if (!next[ex.id]) {
          next[ex.id] = Array.from({ length: ex.sets || 3 }, () => ({
            weight: String(ex.weight || 0),
            reps:   String(ex.reps   || 10),
            rpe:    '',
            done:   false,
          }))
        }
      }
      return next
    })
  }, [exKey])

  // ── Load previous session data, pre-fill inputs ────────────────────────────
  useEffect(() => {
    if (!user || !exercises.length) return
    loadPrevious()
  }, [user?.id, exKey])

  async function loadPrevious() {
    const result = {}

    for (const ex of exercises) {
      const pastSets = await db.workoutSets
        .where('userId').equals(user.id)
        .and(s => s.exerciseId === ex.id)
        .toArray()
      if (!pastSets.length) continue

      // Group by session, pick most recent by date
      const bySession = {}
      for (const s of pastSets) {
        if (!bySession[s.workoutLogId]) bySession[s.workoutLogId] = []
        bySession[s.workoutLogId].push(s)
      }

      const lastSession = Object.values(bySession)
        .sort((a, b) => (b[0]?.date || '').localeCompare(a[0]?.date || ''))[0]
        ?.sort((a, b) => (a.id || 0) - (b.id || 0))
      if (!lastSession?.length) continue

      const best = lastSession.reduce((b, s) =>
        (parseFloat(s.weight) || 0) > (parseFloat(b?.weight) || 0) ? s : b, lastSession[0])

      result[ex.id] = {
        label:   `${lastSession.length} sets · best ${best.weight} kg × ${best.reps}`,
        weight:  parseFloat(best.weight) || 0,
        reps:    parseInt(best.reps)     || 10,
        allSets: lastSession,
      }
    }

    setPrevData(result)

    // Pre-fill inputs with previous values — only if no set is done yet
    setSets(prev => {
      const next = { ...prev }
      for (const ex of exercises) {
        const pd = result[ex.id]
        if (!pd) continue
        const cur = next[ex.id] || []
        if (cur.some(s => s.done)) continue   // user already started — don't overwrite
        next[ex.id] = pd.allSets.map(s => ({
          weight: String(parseFloat(s.weight) || 0),
          reps:   String(parseInt(s.reps)     || 10),
          rpe:    '',
          done:   false,
        }))
      }
      return next
    })
  }

  // ── Timers ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() =>
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (!restActive) return
    if (restTimer <= 0) { setRestActive(false); beep(); return }
    restRef.current = setTimeout(() => setRestTimer(t => Math.max(0, t - 1)), 1000)
    return () => clearTimeout(restRef.current)
  }, [restActive, restTimer])

  // ── Exercise search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!exQuery.trim()) { setExResults([]); return }
    setExResults(searchExercises(exQuery, 8))
  }, [exQuery])

  // ── Actions ────────────────────────────────────────────────────────────────
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      osc.connect(ctx.destination)
      osc.frequency.value = 880
      osc.start()
      osc.stop(ctx.currentTime + 0.35)
    } catch {}
  }

  function getSets(exId) { return sets[exId] || [] }

  function addSet(exId) {
    setSets(s => {
      const cur  = s[exId] || []
      const last = cur[cur.length - 1]
      const pd   = prevData[exId]
      return {
        ...s,
        [exId]: [...cur, {
          weight: last?.weight ?? String(pd?.weight ?? 0),
          reps:   last?.reps   ?? String(pd?.reps   ?? 10),
          rpe:    '',
          done:   false,
        }]
      }
    })
  }

  function removeLastSet(exId) {
    setSets(s => ({ ...s, [exId]: s[exId].slice(0, -1) }))
  }

  function update(exId, setIdx, field, value) {
    setSets(s => ({
      ...s,
      [exId]: s[exId].map((set, i) => i === setIdx ? { ...set, [field]: value } : set)
    }))
  }

  function completeSet(exId, setIdx) {
    setSets(s => ({
      ...s,
      [exId]: s[exId].map((set, i) => i === setIdx ? { ...set, done: true } : set)
    }))
    setRestTimer(DEFAULT_REST)
    setRestTotal(DEFAULT_REST)
    setRestActive(true)
  }

  function uncompleteSet(exId, setIdx) {
    setSets(s => ({
      ...s,
      [exId]: s[exId].map((set, i) => i === setIdx ? { ...set, done: false } : set)
    }))
  }

  function swapExercise(oldEx, newEx) {
    setExtraEx(prev => [
      ...prev.filter(e => e.id !== oldEx.id),
      { ...newEx, sets: oldEx.sets, reps: oldEx.reps, weight: oldEx.weight },
    ])
    setSets(s => {
      const c = { ...s }
      c[newEx.id] = c[oldEx.id] || []
      delete c[oldEx.id]
      return c
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
      const duration     = Math.floor((Date.now() - startRef.current) / 1000)
      const prs          = []
      let totalSets = 0, totalVolume = 0

      for (const ex of exercises) {
        const exSets = getSets(ex.id).filter(s => s.done)
        if (!exSets.length) continue
        totalSets  += exSets.length
        const maxW  = Math.max(...exSets.map(s => parseFloat(s.weight) || 0))
        totalVolume += exSets.reduce((sum, s) =>
          sum + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0)
        const pd = prevData[ex.id]
        if (maxW > (pd?.weight || 0)) {
          prs.push({ exercise: ex.name, value: maxW, prev: pd?.weight || 0 })
        }
      }

      await db.workoutLogs.add({
        id: workoutLogId, userId: user.id, date,
        name: sessionName, programmeId: programme?.id || null,
        dayName: day?.name || null, duration, prs,
        dirty: 1, updatedAt: new Date().toISOString(),
      })

      for (const ex of exercises) {
        const exSets = getSets(ex.id).filter(s => s.done)
        for (const set of exSets) {
          await db.workoutSets.add({
            userId: user.id, workoutLogId,
            exerciseId:   ex.id,
            exerciseName: ex.name,
            weight:  parseFloat(set.weight) || 0,
            reps:    parseInt(set.reps)     || 0,
            rpe:     set.rpe ? parseFloat(set.rpe) : null,
            date, dirty: 1, updatedAt: new Date().toISOString(),
          })
        }
      }

      setSummary({ duration, totalSets, totalVolume, prs })
    } catch (e) {
      console.error('Finish error:', e)
    } finally {
      setFinishing(false)
    }
  }

  function fmt(s) {
    const m   = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  if (summary) {
    return (
      <div style={st.summary}>
        <div style={st.summaryIcon}>🏆</div>
        <div style={st.summaryTitle}>Workout Complete</div>
        <div style={st.summaryStats}>
          {[
            { val: fmt(summary.duration),                             lbl: 'Duration' },
            { val: summary.totalSets,                                 lbl: 'Sets'     },
            { val: `${Math.round(summary.totalVolume).toLocaleString()}`, lbl: 'Volume kg' },
          ].map(({ val, lbl }) => (
            <div key={lbl} style={st.summaryStat}>
              <div style={st.summaryVal}>{val}</div>
              <div style={st.summaryLbl}>{lbl}</div>
            </div>
          ))}
        </div>

        {summary.prs.length > 0 && (
          <div style={st.prBox}>
            <div style={st.prBoxTitle}>Personal Records 🎉</div>
            {summary.prs.map((pr, i) => (
              <div key={i} style={st.prRow}>
                <span style={st.prName}>{pr.exercise}</span>
                <span style={st.prVal}>{pr.value} kg</span>
              </div>
            ))}
          </div>
        )}

        <button style={st.doneBtn} onClick={() =>
          onFinish?.({ prs: summary.prs, duration: summary.duration, setsLogged: summary.totalSets })
        }>
          Done
        </button>
      </div>
    )
  }

  // ── Swap screen ────────────────────────────────────────────────────────────
  if (swapTarget) {
    const alternates = getAlternates(swapTarget.id)
    return (
      <div style={st.container}>
        <button style={st.backBtn} onClick={() => { setSwapTarget(null); setExQuery('') }}>← Back</button>
        <div style={st.swapTitle}>Swap: {swapTarget.name}</div>
        {alternates.map(alt => (
          <button key={alt.id} style={st.listRow} onClick={() => swapExercise(swapTarget, alt)}>
            <span style={st.listName}>{alt.name}</span>
            <span style={st.listMeta}>{alt.equipment}</span>
          </button>
        ))}
        {!alternates.length && <p style={st.hint}>No built-in alternates — search below</p>}
        <input style={st.searchInput} placeholder="Or search any exercise…"
          value={exQuery} onChange={e => setExQuery(e.target.value)} />
        {exResults.map(ex => (
          <button key={ex.id} style={st.listRow} onClick={() => swapExercise(swapTarget, ex)}>
            <span style={st.listName}>{ex.name}</span>
            <span style={st.listMeta}>{ex.muscle} · {ex.equipment}</span>
          </button>
        ))}
      </div>
    )
  }

  // ── Main log screen ────────────────────────────────────────────────────────
  return (
    <div style={st.container}>

      {/* ── Header ── */}
      <div style={st.header}>
        <div>
          <div style={st.sessionName}>{sessionName}</div>
          <div style={st.elapsed}>{fmt(elapsed)}</div>
        </div>
        <button style={{ ...st.finishBtn, opacity: finishing ? 0.6 : 1 }}
          onClick={handleFinish} disabled={finishing}>
          {finishing ? 'Saving…' : 'Finish'}
        </button>
      </div>

      {/* ── Rest timer ── */}
      {restActive && (
        <div style={st.restBanner}>
          <div style={st.restTrack}>
            <div style={{ ...st.restFill, width: `${(restTimer / restTotal) * 100}%` }} />
          </div>
          <div style={st.restContent}>
            <div style={{ display:'flex', flexDirection:'column', gap:'1px' }}>
              <div style={st.restLabel}>Rest</div>
              <div style={st.restTime}>{fmt(restTimer)}</div>
            </div>
            <div style={st.restBtns}>
              <button style={st.restAdj} onClick={() => setRestTimer(t => Math.max(0, t - 15))}>−15s</button>
              <button style={st.restAdj} onClick={() => setRestTimer(t => t + 15)}>+15s</button>
              <button style={st.restSkip} onClick={() => setRestActive(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exercise cards ── */}
      {exercises.map(ex => {
        const exSets  = getSets(ex.id)
        const pd      = prevData[ex.id]
        const doneCnt = exSets.filter(s => s.done).length

        return (
          <div key={ex.id} style={st.exCard}>

            {/* Exercise header */}
            <div style={st.exHeader}>
              <div>
                <div style={st.exName}>{ex.name}</div>
                <div style={st.exMeta}>{ex.muscle} · {ex.equipment || ex.movement}</div>
              </div>
              <button style={st.swapBtn} onClick={() => setSwapTarget(ex)}>Swap</button>
            </div>

            {/* Previous session hint */}
            {pd ? (
              <div style={st.prevHint}>Last session: {pd.label}</div>
            ) : (
              <div style={st.prevHint}>First time — set your starting weight</div>
            )}

            {/* Progress within this exercise */}
            <div style={st.exProgress}>
              <div style={{ ...st.exProgressBar, width: `${(doneCnt / exSets.length) * 100}%` }} />
            </div>

            {/* Column headers */}
            <div style={st.colHeader}>
              <span style={{ ...st.colLbl, width:'26px' }}>SET</span>
              <span style={{ ...st.colLbl, width:'56px' }}>PREV</span>
              <span style={{ ...st.colLbl, flex:1 }}>KG</span>
              <span style={{ ...st.colLbl, flex:1 }}>REPS</span>
              <span style={{ ...st.colLbl, width:'42px' }}>RPE</span>
              <span style={{ ...st.colLbl, width:'34px' }}></span>
            </div>

            {/* Set rows */}
            {exSets.map((set, i) => {
              const ps       = pd?.allSets?.[i]
              const prevHint = ps ? `${ps.weight}×${ps.reps}` : '—'
              const isDone   = set.done

              return (
                <div key={i} style={{ ...st.setRow, ...(isDone ? st.setDone : {}) }}>
                  <span style={st.setNum}>{i + 1}</span>
                  <span style={st.setHint}>{prevHint}</span>
                  <input
                    style={{ ...st.numIn, ...(isDone ? st.numInDone : {}) }}
                    type="number" inputMode="decimal"
                    value={set.weight}
                    onChange={e => update(ex.id, i, 'weight', e.target.value)}
                    disabled={isDone}
                  />
                  <input
                    style={{ ...st.numIn, ...(isDone ? st.numInDone : {}) }}
                    type="number" inputMode="numeric"
                    value={set.reps}
                    onChange={e => update(ex.id, i, 'reps', e.target.value)}
                    disabled={isDone}
                  />
                  <button
                    style={{ ...st.rpeBtn, ...(set.rpe ? st.rpeBtnSet : {}), ...(isDone ? st.rpeBtnDone : {}) }}
                    onClick={() => !isDone && setRpePicker({ exId: ex.id, setIdx: i })}
                    disabled={isDone}
                  >
                    {set.rpe || '—'}
                  </button>
                  {isDone ? (
                    <button style={st.checkDone} onClick={() => uncompleteSet(ex.id, i)}>✓</button>
                  ) : (
                    <button style={st.checkBtn}  onClick={() => completeSet(ex.id, i)}>✓</button>
                  )}
                </div>
              )
            })}

            {/* Add / Remove set */}
            <div style={st.setActions}>
              <button style={st.addSetBtn} onClick={() => addSet(ex.id)}>+ Add Set</button>
              {exSets.length > 1 && (
                <button style={st.removeSetBtn} onClick={() => removeLastSet(ex.id)}>− Remove</button>
              )}
            </div>
          </div>
        )
      })}

      <button style={st.addExBtn} onClick={() => setAddingEx(true)}>+ Add Exercise</button>
      <button style={st.cancelBtn} onClick={onCancel}>Cancel Workout</button>

      {/* ── Add exercise overlay ── */}
      {addingEx && (
        <div style={st.fullOverlay}>
          <div style={st.overlayInner}>
            <button style={st.backBtn} onClick={() => { setAddingEx(false); setExQuery('') }}>← Cancel</button>
            <input
              style={{ ...st.searchInput, marginTop:'12px' }}
              placeholder="Search exercise…"
              value={exQuery}
              autoFocus
              onChange={e => setExQuery(e.target.value)}
            />
            {exResults.map(ex => (
              <button key={ex.id} style={st.listRow} onClick={() => addExercise(ex)}>
                <span style={st.listName}>{ex.name}</span>
                <span style={st.listMeta}>{ex.muscle} · {ex.equipment}</span>
              </button>
            ))}
            {exResults.length === 0 && exQuery.length > 0 && (
              <p style={st.hint}>No results for "{exQuery}"</p>
            )}
          </div>
        </div>
      )}

      {/* ── RPE bottom sheet ── */}
      {rpePicker && (
        <>
          <div style={st.backdrop} onClick={() => setRpePicker(null)} />
          <div style={st.rpeSheet}>
            <div style={st.rpeHandle} />
            <div style={st.rpeTitle}>Rate of Perceived Exertion</div>
            <div style={st.rpeScale}>
              <span>6 · Easy</span>
              <span>8 · Hard</span>
              <span>10 · Max</span>
            </div>
            <div style={st.rpeGrid}>
              {RPE_OPTIONS.map(v => {
                const active = sets[rpePicker.exId]?.[rpePicker.setIdx]?.rpe === v
                return (
                  <button
                    key={v}
                    style={{ ...st.rpeChip, ...(active ? st.rpeChipOn : {}) }}
                    onClick={() => {
                      update(rpePicker.exId, rpePicker.setIdx, 'rpe', v)
                      setRpePicker(null)
                    }}
                  >
                    {v}
                  </button>
                )
              })}
            </div>
            <button style={st.rpeClear}
              onClick={() => { update(rpePicker.exId, rpePicker.setIdx, 'rpe', ''); setRpePicker(null) }}>
              Clear RPE
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const st = {
  // Layout
  container:    { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'40px' },

  // Header
  header:       { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0 8px' },
  sessionName:  { fontSize:'18px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em' },
  elapsed:      { fontSize:'13px', color:'var(--text-tertiary)', marginTop:'2px', fontFamily:'var(--font-mono)' },
  finishBtn:    { padding:'10px 22px', background:'var(--accent)', border:'none', borderRadius:'var(--r-lg)', color:'#fff', fontSize:'15px', fontWeight:'600', cursor:'pointer', letterSpacing:'-0.01em' },

  // Rest timer banner
  restBanner:   { borderRadius:'var(--r-xl)', overflow:'hidden', background:'var(--accent-dim)', border:'1px solid var(--accent)' },
  restTrack:    { height:'3px', background:'rgba(74,124,106,0.2)' },
  restFill:     { height:'100%', background:'var(--accent)', transition:'width 1s linear' },
  restContent:  { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px' },
  restLabel:    { fontSize:'11px', fontWeight:'600', color:'var(--accent)', letterSpacing:'0.04em' },
  restTime:     { fontSize:'32px', fontWeight:'300', color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.05em', lineHeight:1 },
  restBtns:     { display:'flex', gap:'6px', alignItems:'center' },
  restAdj:      { padding:'8px 11px', background:'rgba(74,124,106,0.15)', border:'1px solid var(--accent)', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'12px', fontWeight:'600', cursor:'pointer' },
  restSkip:     { padding:'8px 14px', background:'var(--accent)', border:'none', borderRadius:'var(--r-md)', color:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer' },

  // Exercise card
  exCard:       { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' },
  exHeader:     { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px 12px', borderBottom:'0.5px solid var(--border-subtle)' },
  exName:       { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.01em' },
  exMeta:       { fontSize:'12px', color:'var(--text-tertiary)', textTransform:'capitalize', marginTop:'3px' },
  swapBtn:      { padding:'6px 12px', background:'var(--bg-elevated)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'12px', fontWeight:'500', cursor:'pointer', flexShrink:0 },
  prevHint:     { padding:'8px 16px', fontSize:'12px', color:'var(--text-tertiary)', background:'var(--bg-elevated)', borderBottom:'0.5px solid var(--border-subtle)', fontStyle:'italic' },
  exProgress:   { height:'3px', background:'var(--bg-elevated)' },
  exProgressBar:{ height:'100%', background:'var(--accent)', transition:'width 0.4s var(--ease-out)', borderRadius:'0 2px 2px 0' },

  // Column headers
  colHeader:    { display:'flex', gap:'4px', padding:'8px 12px 4px', alignItems:'center' },
  colLbl:       { fontSize:'10px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center', flexShrink:0 },

  // Set rows
  setRow:       { display:'flex', gap:'6px', padding:'9px 12px', alignItems:'center', borderTop:'0.5px solid var(--border-subtle)', transition:'background 0.2s ease' },
  setDone:      { background:'rgba(74,124,106,0.08)' },
  setNum:       { width:'24px', fontSize:'12px', color:'var(--text-tertiary)', textAlign:'center', fontFamily:'var(--font-mono)', flexShrink:0 },
  setHint:      { width:'52px', fontSize:'11px', color:'var(--text-tertiary)', textAlign:'center', flexShrink:0, letterSpacing:'-0.01em' },
  numIn:        { flex:1, padding:'10px 4px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'16px', fontWeight:'500', color:'var(--text-primary)', outline:'none', textAlign:'center', minWidth:0, transition:'border-color 0.15s, background 0.2s' },
  numInDone:    { background:'transparent', border:'1px solid transparent', color:'var(--accent)', fontWeight:'700' },

  // RPE button (in set row)
  rpeBtn:       { width:'42px', flexShrink:0, padding:'8px 2px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'12px', fontWeight:'500', color:'var(--text-tertiary)', cursor:'pointer', textAlign:'center' },
  rpeBtnSet:    { background:'var(--accent-dim)', borderColor:'var(--accent)', color:'var(--accent)', fontWeight:'700' },
  rpeBtnDone:   { background:'transparent', border:'1px solid transparent', cursor:'default' },

  // Check buttons (in set row)
  checkBtn:     { width:'36px', height:'36px', flexShrink:0, borderRadius:'50%', background:'var(--bg-elevated)', border:'1.5px solid var(--border-strong)', color:'var(--text-tertiary)', fontSize:'16px', fontWeight:'700', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s var(--ease-out)' },
  checkDone:    { width:'36px', height:'36px', flexShrink:0, borderRadius:'50%', background:'var(--accent)', border:'none', color:'#fff', fontSize:'16px', fontWeight:'700', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },

  // Set actions row
  setActions:   { display:'flex', gap:'8px', padding:'10px 12px', borderTop:'0.5px solid var(--border-subtle)' },
  addSetBtn:    { flex:1, padding:'9px', background:'transparent', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'13px', fontWeight:'500', cursor:'pointer' },
  removeSetBtn: { padding:'9px 14px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--red)', fontSize:'13px', cursor:'pointer' },

  // Footer buttons
  addExBtn:     { padding:'14px', background:'var(--bg-surface)', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-xl)', color:'var(--text-secondary)', fontSize:'14px', fontWeight:'500', cursor:'pointer' },
  cancelBtn:    { padding:'12px', background:'transparent', border:'none', color:'var(--text-tertiary)', fontSize:'13px', cursor:'pointer' },

  // Add exercise overlay
  fullOverlay:  { position:'fixed', inset:0, background:'var(--bg-base)', zIndex:200, overflowY:'auto' },
  overlayInner: { display:'flex', flexDirection:'column', gap:'0', padding:'16px' },

  // Shared list styles (swap + search results)
  backBtn:      { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0, alignSelf:'flex-start' },
  swapTitle:    { fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', margin:'8px 0 4px' },
  listRow:      { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'12px 0', background:'transparent', border:'none', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left' },
  listName:     { fontSize:'14px', color:'var(--text-primary)', fontWeight:'500' },
  listMeta:     { fontSize:'12px', color:'var(--text-tertiary)', textTransform:'capitalize' },
  searchInput:  { padding:'12px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', fontSize:'14px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box' },
  hint:         { fontSize:'13px', color:'var(--text-tertiary)', textAlign:'center', padding:'24px 0' },
  sectionTitle: { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)' },

  // RPE bottom sheet
  backdrop:     { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300 },
  rpeSheet:     { position:'fixed', bottom:0, left:0, right:0, background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', padding:'16px 20px 40px', zIndex:301, display:'flex', flexDirection:'column', gap:'16px' },
  rpeHandle:    { width:'36px', height:'4px', borderRadius:'2px', background:'var(--border-strong)', alignSelf:'center' },
  rpeTitle:     { fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', textAlign:'center' },
  rpeScale:     { display:'flex', justifyContent:'space-between', fontSize:'12px', color:'var(--text-tertiary)', padding:'0 4px' },
  rpeGrid:      { display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'8px' },
  rpeChip:      { padding:'12px 4px', background:'var(--bg-elevated)', border:'1.5px solid var(--border-default)', borderRadius:'var(--r-lg)', fontSize:'14px', fontWeight:'600', color:'var(--text-primary)', cursor:'pointer', textAlign:'center' },
  rpeChipOn:    { background:'var(--accent)', borderColor:'var(--accent)', color:'#fff' },
  rpeClear:     { padding:'12px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--text-secondary)', fontSize:'14px', cursor:'pointer' },

  // Workout summary
  summary:      { display:'flex', flexDirection:'column', alignItems:'center', gap:'24px', padding:'32px 0 48px' },
  summaryIcon:  { fontSize:'56px' },
  summaryTitle: { fontSize:'26px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.04em' },
  summaryStats: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'0', width:'100%', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  summaryStat:  { display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', padding:'20px 8px', borderRight:'0.5px solid var(--border-subtle)' },
  summaryVal:   { fontSize:'22px', fontWeight:'700', color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.04em' },
  summaryLbl:   { fontSize:'11px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em' },
  prBox:        { width:'100%', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden', padding:'0' },
  prBoxTitle:   { padding:'12px 16px', fontSize:'13px', fontWeight:'600', color:'var(--text-primary)', borderBottom:'0.5px solid var(--border-subtle)' },
  prRow:        { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderTop:'0.5px solid var(--border-subtle)' },
  prName:       { fontSize:'14px', color:'var(--text-primary)' },
  prVal:        { fontSize:'15px', fontWeight:'700', color:'var(--accent)', fontFamily:'var(--font-mono)' },
  doneBtn:      { width:'100%', padding:'16px', background:'var(--accent)', border:'none', borderRadius:'var(--r-xl)', color:'#fff', fontSize:'17px', fontWeight:'700', cursor:'pointer', letterSpacing:'-0.02em' },
}
