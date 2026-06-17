import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { generateId } from '../auth/crypto.js'
import { searchExercises, getAlternates, getExerciseById } from './ExerciseDB.js'
import { localDate } from '../log/DayLog.jsx'
import { flushDirtyToSupabase } from '../db/db.js'

const RPE_OPTIONS = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10']
const DEFAULT_REST = 90

const MUSCLE_COLOR = {
  chest:      { bg:'rgba(200,112,80,0.12)', fg:'#c87050' },
  back:       { bg:'rgba(74,124,106,0.12)',  fg:'#4a7c6a' },
  legs:       { bg:'rgba(120,104,184,0.12)', fg:'#7868b8' },
  shoulders:  { bg:'rgba(184,120,48,0.12)',  fg:'#b87830' },
  arms:       { bg:'rgba(200,112,80,0.12)',  fg:'#c87050' },
  core:       { bg:'rgba(72,112,168,0.12)',  fg:'#4870a8' },
  glutes:     { bg:'rgba(120,104,184,0.12)', fg:'#7868b8' },
  hamstrings: { bg:'rgba(120,104,184,0.12)', fg:'#7868b8' },
  quads:      { bg:'rgba(120,104,184,0.12)', fg:'#7868b8' },
  calves:     { bg:'rgba(120,104,184,0.12)', fg:'#7868b8' },
  traps:      { bg:'rgba(74,124,106,0.12)',  fg:'#4a7c6a' },
  lats:       { bg:'rgba(74,124,106,0.12)',  fg:'#4a7c6a' },
}

function muscleStyle(muscle) {
  const key = (muscle || '').toLowerCase().split(/[/ ]/)[0]
  return MUSCLE_COLOR[key] || { bg:'var(--bg-elevated)', fg:'var(--text-tertiary)' }
}

export default function WorkoutLog({ programme, day, onFinish, onCancel }) {
  const { user } = useAuth()

  const [sets,       setSets]       = useState({})
  const [prevData,   setPrevData]   = useState({})
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
  const [rpePicker,  setRpePicker]  = useState(null)
  const [unit,       setUnit]       = useState(() => localStorage.getItem('workoutUnit') || 'lbs')
  const [formSheet,  setFormSheet]  = useState(null)   // exercise object or null

  const startRef     = useRef(Date.now())
  const timerRef     = useRef(null)
  const restRef      = useRef(null)
  const workoutLogId = useRef(generateId())
  const draftSaved   = useRef(false)

  // Merge saved programme exercises with full ExerciseDB data (restores cues, yt, equipment, etc.)
  const exercises   = [...(day?.exercises || []), ...extraEx].map(ex => ({
    ...getExerciseById(ex.id),
    ...ex,
  }))
  const sessionName = day?.name || 'Workout'
  const exKey       = exercises.map(e => e.id).join(',')

  // Running volume across all completed sets
  const runningVolume = useMemo(() =>
    exercises.reduce((tot, ex) =>
      tot + (sets[ex.id] || [])
        .filter(s => s.done)
        .reduce((v, s) => v + (parseFloat(s.weight)||0) * (parseInt(s.reps)||0), 0)
    , 0)
  , [sets, exKey])

  // ── Init set rows ──────────────────────────────────────────────────────────
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

  // ── Load previous session data ─────────────────────────────────────────────
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

      const bySession = {}
      for (const s of pastSets) {
        if (!bySession[s.workoutLogId]) bySession[s.workoutLogId] = []
        bySession[s.workoutLogId].push(s)
      }

      const lastSession = Object.values(bySession)
        .sort((a, b) => (b[0]?.date || '').localeCompare(a[0]?.date || ''))[0]
        ?.sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''))
      if (!lastSession?.length) continue

      const best = lastSession.reduce((b, s) =>
        (parseFloat(s.weight) || 0) > (parseFloat(b?.weight) || 0) ? s : b, lastSession[0])

      // All-time best weight across every session, not just the last one
      const allTimeBest = pastSets.reduce((max, s) =>
        (parseFloat(s.weight) || 0) > max ? (parseFloat(s.weight) || 0) : max, 0)

      result[ex.id] = {
        label:        `${lastSession.length} sets · best ${best.weight} ${localStorage.getItem('workoutUnit') || 'lbs'} × ${best.reps}`,
        weight:       parseFloat(best.weight) || 0,
        allTimeBest,
        reps:         parseInt(best.reps)     || 10,
        allSets:      lastSession,
      }
    }

    setPrevData(result)

    setSets(prev => {
      const next = { ...prev }
      for (const ex of exercises) {
        const pd = result[ex.id]
        if (!pd) continue
        const cur = next[ex.id] || []
        if (cur.some(s => s.done)) continue
        next[ex.id] = pd.allSets.map(s => ({
          weight: String(parseFloat(s.weight) || 0),
          reps:   String(parseInt(s.reps)     || 10),
          rpe:    s.rpe != null && s.rpe !== '' ? String(s.rpe) : '',
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
    const setId = generateId()
    setSets(s => {
      const next = {
        ...s,
        [exId]: s[exId].map((set, i) => i === setIdx ? { ...set, done: true, dbId: setId } : set)
      }
      persistSet(exId, next[exId][setIdx], setId)
      return next
    })
    setRestTimer(DEFAULT_REST)
    setRestTotal(DEFAULT_REST)
    setRestActive(true)
  }

  async function persistSet(exId, set, setId) {
    if (!user) return
    const date = localDate()
    const now  = new Date().toISOString()
    const ex   = exercises.find(e => e.id === exId)
    if (!draftSaved.current) {
      draftSaved.current = true
      await db.workoutLogs.put({
        id:          workoutLogId.current,
        userId:      user.id,
        date,
        name:        sessionName,
        programmeId: programme?.id || null,
        dayName:     day?.name     || null,
        duration:    0,
        prs:         [],
        status:      'draft',
        dirty:       1,
        updatedAt:   now,
      })
    }
    await db.workoutSets.put({
      id:           setId || generateId(),
      userId:       user.id,
      workoutLogId: workoutLogId.current,
      exerciseId:   exId,
      exerciseName: ex?.name || '',
      weight:       parseFloat(set.weight) || 0,
      reps:         parseInt(set.reps)     || 0,
      rpe:          set.rpe ? parseFloat(set.rpe) : null,
      date,
      dirty:        1,
      updatedAt:    now,
    })
  }

  function uncompleteSet(exId, setIdx) {
    setSets(s => {
      const set = s[exId]?.[setIdx]
      if (set?.dbId) db.workoutSets.delete(set.dbId).catch(() => {})
      return {
        ...s,
        [exId]: s[exId].map((cur, i) => i === setIdx ? { ...cur, done: false, dbId: undefined } : cur)
      }
    })
  }

  function toggleUnit() {
    const next = unit === 'kg' ? 'lbs' : 'kg'
    setUnit(next)
    localStorage.setItem('workoutUnit', next)
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
      const date     = localDate()
      const duration = Math.floor((Date.now() - startRef.current) / 1000)
      const prs      = []
      let totalSets = 0, totalVolume = 0
      const now      = new Date().toISOString()

      for (const ex of exercises) {
        const exSets = getSets(ex.id).filter(s => s.done)
        if (!exSets.length) continue
        totalSets  += exSets.length
        const maxW  = Math.max(...exSets.map(s => parseFloat(s.weight) || 0))
        totalVolume += exSets.reduce((sum, s) =>
          sum + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0)
        const pd       = prevData[ex.id]
        const prTarget = pd?.allTimeBest ?? pd?.weight ?? 0
        if (maxW > prTarget) {
          prs.push({ exercise: ex.name, value: maxW, prev: prTarget })
        }
      }

      await db.workoutLogs.put({
        id:          workoutLogId.current,
        userId:      user.id,
        date,
        name:        sessionName,
        programmeId: programme?.id || null,
        dayName:     day?.name     || null,
        duration,
        prs,
        status:      'complete',
        dirty:       1,
        updatedAt:   now,
      })

      if (!draftSaved.current) {
        for (const ex of exercises) {
          for (const set of getSets(ex.id).filter(s => s.done)) {
            await db.workoutSets.put({
              id:           generateId(),
              userId:       user.id,
              workoutLogId: workoutLogId.current,
              exerciseId:   ex.id,
              exerciseName: ex.name,
              weight:  parseFloat(set.weight) || 0,
              reps:    parseInt(set.reps)     || 0,
              rpe:     set.rpe ? parseFloat(set.rpe) : null,
              date, dirty: 1, updatedAt: now,
            })
          }
        }
      }

      setSummary({ duration, totalSets, totalVolume, prs })

      // Push to Supabase immediately — don't wait for the 30s interval
      if (user?.id) flushDirtyToSupabase(user.id).catch(() => {})
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
            { val: fmt(summary.duration),                                lbl: 'Duration'        },
            { val: summary.totalSets,                                    lbl: 'Sets'            },
            { val: `${Math.round(summary.totalVolume).toLocaleString()}`,lbl: `Volume (${unit})` },
          ].map(({ val, lbl }) => (
            <div key={lbl} style={st.summaryStat}>
              <div style={st.summaryVal}>{val}</div>
              <div style={st.summaryLbl}>{lbl}</div>
            </div>
          ))}
        </div>

        {summary.prs.length > 0 && (
          <div style={st.prBox}>
            <div style={st.prBoxTitle}>Personal Records</div>
            {summary.prs.map((pr, i) => (
              <div key={i} style={st.prRow}>
                <span style={st.prName}>{pr.exercise}</span>
                <span style={st.prVal}>{pr.value} {unit} ✕ PR</span>
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
  const totalSetsAll  = exercises.reduce((n, ex) => n + (sets[ex.id]?.length || 0), 0)
  const doneSetsAll   = exercises.reduce((n, ex) => n + (sets[ex.id]?.filter(s => s.done).length || 0), 0)

  return (
    <div style={st.container}>

      {/* ── Header ── */}
      <div style={st.header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={st.sessionName}>{sessionName}</div>
          <div style={st.headerMeta}>
            <span style={st.timerDot} />
            <span style={st.elapsed}>{fmt(elapsed)}</span>
            {runningVolume > 0 && (
              <span style={st.volumePill}>
                {Math.round(runningVolume).toLocaleString()} {unit}
              </span>
            )}
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center', flexShrink: 0 }}>
          <button style={st.unitToggle} onClick={toggleUnit}>{unit.toUpperCase()}</button>
          <button style={{ ...st.finishBtn, opacity: finishing ? 0.6 : 1 }}
            onClick={handleFinish} disabled={finishing}>
            {finishing ? 'Saving…' : 'Finish'}
          </button>
        </div>
      </div>

      {/* ── Overall progress ── */}
      {totalSetsAll > 0 && (
        <div style={st.overallTrack}>
          <div style={{ ...st.overallFill, width: `${(doneSetsAll / totalSetsAll) * 100}%` }} />
        </div>
      )}

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
              <button style={st.restSkip} onClick={() => setRestActive(false)}>Skip</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exercise cards ── */}
      {exercises.map(ex => {
        const exSets  = getSets(ex.id)
        const pd      = prevData[ex.id]
        const doneCnt = exSets.filter(s => s.done).length
        const allDone = exSets.length > 0 && doneCnt === exSets.length
        const mc      = muscleStyle(ex.muscle)

        return (
          <div key={ex.id} style={{ ...st.exCard, ...(allDone ? st.exCardDone : {}) }}>

            {/* Progress bar */}
            <div style={st.exProgress}>
              <div style={{ ...st.exProgressBar, width: `${(doneCnt / Math.max(exSets.length, 1)) * 100}%` }} />
            </div>

            {/* Exercise header */}
            <div style={st.exHeader}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={st.exNameRow}>
                  <span style={st.exName}>{ex.name}</span>
                  {allDone && <span style={st.doneBadge}>Done</span>}
                </div>
                <div style={st.exTagRow}>
                  {ex.muscle && (
                    <span style={{ ...st.muscleTag, background: mc.bg, color: mc.fg }}>
                      {ex.muscle}
                    </span>
                  )}
                  {ex.equipment && (
                    <span style={st.equipTag}>{ex.equipment}</span>
                  )}
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', flexShrink:0, marginTop:'2px' }}>
                {ex.cues?.length > 0 && (
                  <button style={st.formBtn} onClick={() => setFormSheet(ex)}>Form</button>
                )}
                <button style={st.swapBtn} onClick={() => setSwapTarget(ex)}>Swap</button>
              </div>
            </div>

            {/* Previous session chips */}
            {pd ? (
              <div style={st.prevRow}>
                <span style={st.prevLabel}>Last</span>
                {pd.allSets.slice(0, 5).map((s, i) => (
                  <span key={i} style={st.prevChip}>{s.weight}×{s.reps}</span>
                ))}
              </div>
            ) : (
              <div style={st.prevFirstTime}>First time · set a starting weight below</div>
            )}

            {/* Column headers */}
            <div style={st.colHeader}>
              <span style={{ ...st.colLbl, width:'26px' }}>#</span>
              <span style={{ ...st.colLbl, width:'58px' }}>PREV</span>
              <span style={{ ...st.colLbl, flex:1 }}>{unit.toUpperCase()}</span>
              <span style={{ ...st.colLbl, flex:1 }}>REPS</span>
              <span style={{ ...st.colLbl, width:'44px' }}>RPE</span>
              <span style={{ ...st.colLbl, width:'48px' }}></span>
            </div>

            {/* Set rows */}
            {exSets.map((set, i) => {
              const isDone   = set.done
              const ps       = pd?.allSets?.[i]
              const prevHint = ps ? `${ps.weight}×${ps.reps}` : '—'
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
                    <button style={st.checkBtn} onClick={() => completeSet(ex.id, i)}>✓</button>
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

      {/* Empty state for quick start */}
      {exercises.length === 0 && (
        <div style={st.emptySession}>
          <div style={st.emptyIcon}>💪</div>
          <div style={st.emptyText}>Add your first exercise to get started</div>
        </div>
      )}

      <button style={st.addExBtn} onClick={() => setAddingEx(true)}>+ Add Exercise</button>
      <button style={st.cancelBtn} onClick={onCancel}>Cancel Workout</button>

      {/* ── Add exercise overlay ── */}
      {addingEx && (
        <div style={st.fullOverlay}>
          <div style={st.overlayInner}>
            <button style={st.backBtn} onClick={() => { setAddingEx(false); setExQuery('') }}>← Cancel</button>
            <div style={st.overlayTitle}>Add Exercise</div>
            <input
              style={st.searchInput}
              placeholder="Search exercise…"
              value={exQuery}
              autoFocus
              onChange={e => setExQuery(e.target.value)}
            />
            {exResults.map(ex => (
              <button key={ex.id} style={st.listRow} onClick={() => addExercise(ex)}>
                <div>
                  <div style={st.listName}>{ex.name}</div>
                  <div style={st.listMeta}>{ex.muscle} · {ex.equipment}</div>
                </div>
                <span style={st.listAdd}>+</span>
              </button>
            ))}
            {exResults.length === 0 && exQuery.length > 0 && (
              <p style={st.hint}>No results for "{exQuery}"</p>
            )}
            {exResults.length === 0 && exQuery.length === 0 && (
              <p style={st.hint}>Start typing to search 300+ exercises</p>
            )}
          </div>
        </div>
      )}

      {/* ── Form cues sheet ── */}
      {formSheet && (
        <>
          <div style={st.backdrop} onClick={() => setFormSheet(null)} />
          <div style={st.formSheetWrap}>
            <div style={st.rpeHandle} />
            <div style={st.formSheetName}>{formSheet.name}</div>
            <div style={st.cueList}>
              {formSheet.cues.map((cue, i) => (
                <div key={i} style={st.cueRow}>
                  <span style={st.cueDot}>•</span>
                  <span style={st.cueText}>{cue}</span>
                </div>
              ))}
            </div>
            {formSheet.yt && (
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(formSheet.yt)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={st.ytBtn}
                onClick={() => setFormSheet(null)}
              >
                Watch short tutorial on YouTube ↗
              </a>
            )}
          </div>
        </>
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
  container:     { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'40px' },

  // Header
  header:        { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0 6px', gap:'8px' },
  sessionName:   { fontSize:'19px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em', lineHeight:1.2 },
  headerMeta:    { display:'flex', alignItems:'center', gap:'8px', marginTop:'4px' },
  timerDot:      { width:'7px', height:'7px', borderRadius:'50%', background:'var(--accent)', display:'inline-block', flexShrink:0 },
  elapsed:       { fontSize:'13px', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)' },
  volumePill:    { fontSize:'12px', fontWeight:'600', color:'var(--accent)', background:'var(--accent-dim)', padding:'2px 8px', borderRadius:'var(--r-full)' },
  finishBtn:     { padding:'10px 20px', background:'var(--accent)', border:'none', borderRadius:'var(--r-lg)', color:'#fff', fontSize:'15px', fontWeight:'600', cursor:'pointer', letterSpacing:'-0.01em', whiteSpace:'nowrap' },
  unitToggle:    { padding:'9px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'12px', fontWeight:'700', cursor:'pointer', letterSpacing:'0.04em' },

  // Overall progress bar
  overallTrack:  { height:'3px', background:'var(--bg-elevated)', borderRadius:'2px', overflow:'hidden' },
  overallFill:   { height:'100%', background:'var(--accent)', transition:'width 0.4s ease', borderRadius:'2px' },

  // Rest timer
  restBanner:    { borderRadius:'var(--r-xl)', overflow:'hidden', background:'var(--accent-dim)', border:'1px solid var(--accent)' },
  restTrack:     { height:'4px', background:'rgba(74,124,106,0.2)' },
  restFill:      { height:'100%', background:'var(--accent)', transition:'width 1s linear' },
  restContent:   { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px' },
  restLabel:     { fontSize:'11px', fontWeight:'700', color:'var(--accent)', letterSpacing:'0.06em', textTransform:'uppercase' },
  restTime:      { fontSize:'34px', fontWeight:'300', color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.05em', lineHeight:1 },
  restBtns:      { display:'flex', gap:'6px', alignItems:'center' },
  restAdj:       { padding:'9px 12px', background:'rgba(74,124,106,0.15)', border:'1px solid var(--accent)', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  restSkip:      { padding:'9px 16px', background:'var(--accent)', border:'none', borderRadius:'var(--r-md)', color:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer' },

  // Exercise card
  exCard:        { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' },
  exCardDone:    { borderColor:'var(--accent)', borderWidth:'1px' },
  exProgress:    { height:'4px', background:'var(--bg-elevated)' },
  exProgressBar: { height:'100%', background:'var(--accent)', transition:'width 0.4s var(--ease-out)', borderRadius:'0 2px 2px 0' },
  exHeader:      { display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'14px 16px 10px', gap:'12px' },
  exNameRow:     { display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' },
  exName:        { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', lineHeight:1.2 },
  doneBadge:     { fontSize:'10px', fontWeight:'700', color:'var(--accent)', background:'var(--accent-dim)', padding:'2px 7px', borderRadius:'var(--r-full)', textTransform:'uppercase', letterSpacing:'0.04em' },
  exTagRow:      { display:'flex', alignItems:'center', gap:'5px', marginTop:'5px', flexWrap:'wrap' },
  muscleTag:     { fontSize:'11px', fontWeight:'600', padding:'2px 8px', borderRadius:'var(--r-full)', textTransform:'capitalize' },
  equipTag:      { fontSize:'11px', color:'var(--text-tertiary)', background:'var(--bg-elevated)', padding:'2px 8px', borderRadius:'var(--r-full)', textTransform:'capitalize' },
  formBtn:       { padding:'7px 13px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'12px', fontWeight:'600', cursor:'pointer', flexShrink:0 },
  swapBtn:       { padding:'7px 13px', background:'var(--bg-elevated)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'12px', fontWeight:'500', cursor:'pointer', flexShrink:0 },

  // Previous session
  prevRow:       { display:'flex', alignItems:'center', gap:'6px', padding:'6px 16px 10px', flexWrap:'wrap' },
  prevLabel:     { fontSize:'10px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em' },
  prevChip:      { fontSize:'12px', fontWeight:'500', color:'var(--text-secondary)', background:'var(--bg-elevated)', padding:'3px 8px', borderRadius:'var(--r-full)', letterSpacing:'-0.01em' },
  prevFirstTime: { padding:'6px 16px 10px', fontSize:'12px', color:'var(--text-tertiary)', fontStyle:'italic' },

  // Column headers
  colHeader:     { display:'flex', gap:'6px', padding:'6px 12px 4px', alignItems:'center', borderTop:'0.5px solid var(--border-subtle)' },
  colLbl:        { fontSize:'10px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center', flexShrink:0 },

  // Set rows
  setRow:        { display:'flex', gap:'6px', padding:'10px 12px', alignItems:'center', borderTop:'0.5px solid var(--border-subtle)', transition:'background 0.2s ease', minHeight:'56px' },
  setDone:       { background:'rgba(74,124,106,0.06)' },
  setNum:        { width:'26px', fontSize:'13px', color:'var(--text-tertiary)', textAlign:'center', fontFamily:'var(--font-mono)', flexShrink:0, fontWeight:'500' },
  setHint:       { width:'58px', fontSize:'11px', color:'var(--text-tertiary)', textAlign:'center', flexShrink:0, letterSpacing:'-0.01em', lineHeight:1.2 },
  numIn:         { flex:1, padding:'11px 4px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', outline:'none', textAlign:'center', minWidth:0, transition:'border-color 0.15s, background 0.2s' },
  numInDone:     { background:'transparent', border:'1px solid transparent', color:'var(--accent)', fontWeight:'700' },

  // RPE
  rpeBtn:        { width:'44px', flexShrink:0, padding:'10px 2px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'12px', fontWeight:'500', color:'var(--text-tertiary)', cursor:'pointer', textAlign:'center' },
  rpeBtnSet:     { background:'var(--accent-dim)', borderColor:'var(--accent)', color:'var(--accent)', fontWeight:'700' },
  rpeBtnDone:    { background:'transparent', border:'1px solid transparent', cursor:'default' },

  // Check buttons
  checkBtn:      { width:'48px', height:'48px', flexShrink:0, borderRadius:'50%', background:'var(--bg-elevated)', border:'2px solid var(--border-strong)', color:'var(--text-tertiary)', fontSize:'18px', fontWeight:'700', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s var(--ease-out)' },
  checkDone:     { width:'48px', height:'48px', flexShrink:0, borderRadius:'50%', background:'var(--accent)', border:'none', color:'#fff', fontSize:'18px', fontWeight:'700', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(74,124,106,0.4)' },

  // Set actions
  setActions:    { display:'flex', gap:'8px', padding:'10px 12px', borderTop:'0.5px solid var(--border-subtle)' },
  addSetBtn:     { flex:1, padding:'10px', background:'transparent', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'13px', fontWeight:'500', cursor:'pointer' },
  removeSetBtn:  { padding:'10px 14px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--red)', fontSize:'13px', cursor:'pointer' },

  // Empty session
  emptySession:  { display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', padding:'40px 16px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)' },
  emptyIcon:     { fontSize:'40px' },
  emptyText:     { fontSize:'14px', color:'var(--text-tertiary)', textAlign:'center' },

  // Footer
  addExBtn:      { padding:'15px', background:'var(--bg-surface)', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-xl)', color:'var(--text-secondary)', fontSize:'15px', fontWeight:'500', cursor:'pointer', letterSpacing:'-0.01em' },
  cancelBtn:     { padding:'12px', background:'transparent', border:'none', color:'var(--text-tertiary)', fontSize:'13px', cursor:'pointer' },

  // Add exercise overlay
  fullOverlay:   { position:'fixed', inset:0, background:'var(--bg-base)', zIndex:200, overflowY:'auto' },
  overlayInner:  { display:'flex', flexDirection:'column', gap:'0', padding:'16px' },
  overlayTitle:  { fontSize:'20px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em', margin:'12px 0 8px' },

  // Shared list
  backBtn:       { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0, alignSelf:'flex-start' },
  swapTitle:     { fontSize:'18px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em', margin:'8px 0 4px' },
  listRow:       { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'13px 0', background:'transparent', border:'none', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left' },
  listName:      { fontSize:'15px', color:'var(--text-primary)', fontWeight:'500' },
  listMeta:      { fontSize:'12px', color:'var(--text-tertiary)', textTransform:'capitalize', marginTop:'2px' },
  listAdd:       { fontSize:'20px', color:'var(--accent)', fontWeight:'300', flexShrink:0, paddingLeft:'8px' },
  searchInput:   { padding:'13px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', fontSize:'15px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box', marginTop:'8px' },
  hint:          { fontSize:'13px', color:'var(--text-tertiary)', textAlign:'center', padding:'24px 0' },

  // Form cues sheet
  formSheetWrap: { position:'fixed', bottom:0, left:0, right:0, background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', padding:'16px 20px 36px', zIndex:301, display:'flex', flexDirection:'column', gap:'14px' },
  formSheetName: { fontSize:'19px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em' },
  cueList:       { display:'flex', flexDirection:'column', gap:'10px' },
  cueRow:        { display:'flex', alignItems:'flex-start', gap:'10px' },
  cueDot:        { fontSize:'16px', color:'var(--accent)', flexShrink:0, lineHeight:1.4 },
  cueText:       { fontSize:'15px', color:'var(--text-primary)', lineHeight:1.5 },
  ytBtn:         { display:'block', padding:'13px 16px', background:'rgba(255,0,0,0.06)', border:'1px solid rgba(255,0,0,0.15)', borderRadius:'var(--r-lg)', color:'#c00', fontSize:'14px', fontWeight:'600', textDecoration:'none', textAlign:'center' },

  // RPE sheet
  backdrop:      { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300 },
  rpeSheet:      { position:'fixed', bottom:0, left:0, right:0, background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', padding:'16px 20px 40px', zIndex:301, display:'flex', flexDirection:'column', gap:'16px' },
  rpeHandle:     { width:'36px', height:'4px', borderRadius:'2px', background:'var(--border-strong)', alignSelf:'center' },
  rpeTitle:      { fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', textAlign:'center' },
  rpeScale:      { display:'flex', justifyContent:'space-between', fontSize:'12px', color:'var(--text-tertiary)', padding:'0 4px' },
  rpeGrid:       { display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'8px' },
  rpeChip:       { padding:'13px 4px', background:'var(--bg-elevated)', border:'1.5px solid var(--border-default)', borderRadius:'var(--r-lg)', fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', cursor:'pointer', textAlign:'center' },
  rpeChipOn:     { background:'var(--accent)', borderColor:'var(--accent)', color:'#fff' },
  rpeClear:      { padding:'12px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--text-secondary)', fontSize:'14px', cursor:'pointer' },

  // Summary
  summary:       { display:'flex', flexDirection:'column', alignItems:'center', gap:'24px', padding:'32px 0 48px' },
  summaryIcon:   { fontSize:'60px' },
  summaryTitle:  { fontSize:'28px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.04em' },
  summaryStats:  { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'0', width:'100%', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  summaryStat:   { display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', padding:'20px 8px', borderRight:'0.5px solid var(--border-subtle)' },
  summaryVal:    { fontSize:'22px', fontWeight:'700', color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.04em' },
  summaryLbl:    { fontSize:'11px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center' },
  prBox:         { width:'100%', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  prBoxTitle:    { padding:'12px 16px', fontSize:'13px', fontWeight:'700', color:'var(--text-primary)', borderBottom:'0.5px solid var(--border-subtle)', textTransform:'uppercase', letterSpacing:'0.04em' },
  prRow:         { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'13px 16px', borderTop:'0.5px solid var(--border-subtle)' },
  prName:        { fontSize:'14px', color:'var(--text-primary)' },
  prVal:         { fontSize:'14px', fontWeight:'700', color:'var(--accent)', fontFamily:'var(--font-mono)' },
  doneBtn:       { width:'100%', padding:'17px', background:'var(--accent)', border:'none', borderRadius:'var(--r-xl)', color:'#fff', fontSize:'17px', fontWeight:'700', cursor:'pointer', letterSpacing:'-0.02em' },
}
