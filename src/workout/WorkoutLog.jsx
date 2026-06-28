import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/db.js'
import { generateId } from '../auth/crypto.js'
import { searchExercises, getAlternates, getExerciseById } from './ExerciseDB.js'
import ExerciseVideo from './ExerciseVideo.jsx'
import { localDate } from '../log/DayLog.jsx'
import { flushDirtyToSupabase, queueResync } from '../db/db.js'

const RPE_OPTIONS = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10']
const DEFAULT_REST = 90
const SET_TYPES    = ['N', 'W', 'D', 'F']

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

function muscleWikiUrl(name) {
  return 'https://musclewiki.com/media/uploads/videos/branded/' +
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-male.gif'
}

function ExThumb({ exercise }) {
  const [err, setErr] = useState(false)
  const mc = muscleStyle(exercise.muscle)
  const size = { width: 52, height: 52, borderRadius: 10, flexShrink: 0 }
  if (err) {
    return (
      <div style={{ ...size, background: mc.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: mc.fg, letterSpacing: '0.04em' }}>
          {(exercise.muscle || '').slice(0, 3).toUpperCase()}
        </span>
      </div>
    )
  }
  return (
    <div style={{ ...size, overflow:'hidden', background: mc.bg }}>
      <img
        src={muscleWikiUrl(exercise.name)}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        style={{ width:'100%', height:'100%', objectFit:'cover' }}
        onError={() => setErr(true)}
      />
    </div>
  )
}

// Plate calculator helper
function calcPlates(targetWeight, unit) {
  const barWeight    = unit === 'kg' ? 20 : 45
  const plateOptions = unit === 'kg'
    ? [25, 20, 15, 10, 5, 2.5, 1.25]
    : [45, 35, 25, 10, 5, 2.5]
  let remaining = Math.max(0, (targetWeight - barWeight) / 2)
  const plates = []
  for (const plate of plateOptions) {
    while (remaining >= plate - 0.001) {
      plates.push(plate)
      remaining = Math.round((remaining - plate) * 1000) / 1000
    }
  }
  return { barWeight, plates }
}

export default function WorkoutLog({ programme, day, draftLogId, onFinish, onCancel }) {
  const { user } = useAuth()

  const [sets,       setSets]       = useState({})
  const [prevData,   setPrevData]   = useState({})
  const [elapsed,    setElapsed]    = useState(0)
  const [restTimer,  setRestTimer]  = useState(DEFAULT_REST)
  const [restTotal,  setRestTotal]  = useState(DEFAULT_REST)
  const [restActive, setRestActive] = useState(false)
  const [extraEx,    setExtraEx]    = useState([])
  const [swapped,    setSwapped]    = useState(new Map())
  const [swapTarget, setSwapTarget] = useState(null)
  const [addingEx,   setAddingEx]   = useState(false)
  const [exQuery,    setExQuery]    = useState('')
  const [exResults,  setExResults]  = useState([])
  const [finishing,       setFinishing]       = useState(false)
  const [summary,         setSummary]         = useState(null)
  const [rpePicker,       setRpePicker]       = useState(null)
  const [unit,            setUnit]            = useState(() => localStorage.getItem('workoutUnit') || 'lbs')
  const [formExpanded,    setFormExpanded]    = useState(new Set())
  const [inactivityAlert, setInactivityAlert] = useState(false)
  // New Strong-parity state
  const [exNotes,      setExNotes]      = useState({})
  const [plateCalc,    setPlateCalc]    = useState(null)   // { exId, weight } | null
  const [restDuration, setRestDuration] = useState(
    () => parseInt(localStorage.getItem('workoutRestTime')) || DEFAULT_REST
  )

  const startRef        = useRef(Date.now())
  const lastActivityRef = useRef(Date.now())
  const timerRef        = useRef(null)
  const restRef         = useRef(null)
  const inactivityRef   = useRef(null)
  const workoutLogId    = useRef(draftLogId || generateId())
  const draftSaved      = useRef(!!draftLogId)

  const swappedValues = new Set([...swapped.values()].map(v => v.id))
  const exercises = [
    ...(day?.exercises || []).map(ex => swapped.has(ex.id) ? swapped.get(ex.id) : ex),
    ...extraEx.filter(ex => !swappedValues.has(ex.id)),
  ].map(ex => ({
    ...getExerciseById(ex.id),
    ...ex,
  }))
  const sessionName = day?.name || 'Workout'
  const exKey       = exercises.map(e => e.id).join(',')

  // Volume excludes warmup sets
  const runningVolume = useMemo(() =>
    exercises.reduce((tot, ex) =>
      tot + (sets[ex.id] || [])
        .filter(s => s.done && s.type !== 'W')
        .reduce((v, s) => v + (parseFloat(s.weight)||0) * (parseInt(s.reps)||0), 0)
    , 0)
  , [sets, exKey])

  // Real-time PR tracking — which exercises have a PR this session
  const sessionPRs = useMemo(() => {
    const prs = new Set()
    for (const ex of exercises) {
      const pd = prevData[ex.id]
      if (!pd) continue
      const maxW = (sets[ex.id] || [])
        .filter(s => s.done && s.type !== 'W')
        .reduce((m, s) => Math.max(m, parseFloat(s.weight) || 0), 0)
      if (maxW > (pd.allTimeBest || 0)) prs.add(ex.id)
    }
    return prs
  }, [sets, prevData, exKey])

  // ── Resume: load existing sets from a draft log ────────────────────────────
  useEffect(() => {
    if (!draftLogId || !user) return
    db.workoutSets
      .where('workoutLogId').equals(draftLogId)
      .and(s => s.userId === user.id)
      .toArray()
      .then(existing => {
        if (!existing.length) return
        const byEx = {}
        for (const s of existing) {
          if (!byEx[s.exerciseId]) byEx[s.exerciseId] = []
          byEx[s.exerciseId].push({
            id:     s.id,
            weight: String(s.weight ?? ''),
            reps:   String(s.reps ?? ''),
            rpe:    s.rpe || '',
            done:   s.done !== false,
            type:   s.type || 'N',
          })
        }
        setSets(byEx)
      })
  }, [draftLogId, user?.id])

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
            type:   'N',
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

      const allTimeBest = pastSets
        .filter(s => s.type !== 'W')
        .reduce((max, s) => Math.max(max, parseFloat(s.weight) || 0), 0)

      result[ex.id] = {
        label:      `${lastSession.length} sets · best ${best.weight} ${localStorage.getItem('workoutUnit') || 'lbs'} × ${best.reps}`,
        weight:     parseFloat(best.weight) || 0,
        allTimeBest,
        reps:       parseInt(best.reps) || 10,
        allSets:    lastSession,
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
          weight:     '',
          reps:       '',
          rpe:        '',
          done:       false,
          type:       s.type || 'N',
          weightHint: String(parseFloat(s.weight) || 0),
          repsHint:   String(parseInt(s.reps)     || 10),
          rpeHint:    s.rpe != null && s.rpe !== '' ? String(s.rpe) : '',
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

  useEffect(() => {
    inactivityRef.current = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current
      if (idleMs >= 90 * 60 * 1000) setInactivityAlert(true)
    }, 60_000)
    return () => clearInterval(inactivityRef.current)
  }, [])

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
          type:   'N',
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

  function cycleSetType(exId, setIdx) {
    setSets(s => {
      const cur     = s[exId][setIdx]
      const curType = cur.type || 'N'
      const next    = SET_TYPES[(SET_TYPES.indexOf(curType) + 1) % SET_TYPES.length]
      return { ...s, [exId]: s[exId].map((set, i) => i === setIdx ? { ...set, type: next } : set) }
    })
  }

  function changeRestDuration(delta) {
    const next = Math.max(15, restDuration + delta)
    localStorage.setItem('workoutRestTime', String(next))
    setRestDuration(next)
    if (restActive) setRestTimer(t => Math.min(t, next))
  }

  function completeSet(exId, setIdx) {
    const setId = generateId()
    lastActivityRef.current = Date.now()
    setInactivityAlert(false)
    setSets(s => {
      const cur = s[exId][setIdx]
      const resolved = {
        ...cur,
        weight: cur.weight !== '' ? cur.weight : (cur.weightHint ?? '0'),
        reps:   cur.reps   !== '' ? cur.reps   : (cur.repsHint  ?? '0'),
        rpe:    cur.rpe    !== '' ? cur.rpe    : (cur.rpeHint   ?? ''),
      }
      const next = {
        ...s,
        [exId]: s[exId].map((set, i) => i === setIdx ? { ...resolved, done: true, dbId: setId } : set)
      }
      persistSet(exId, next[exId][setIdx], setId)
      return next
    })
    setRestTimer(restDuration)
    setRestTotal(restDuration)
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
      type:         set.type || 'N',
      date,
      dirty:        1,
      updatedAt:    now,
    })
  }

  function uncompleteSet(exId, setIdx) {
    setSets(s => {
      const set = s[exId]?.[setIdx]
      if (set?.dbId) {
        db.workoutSets.delete(set.dbId).catch(() => {})
        if (user?.id) queueResync('workoutSets', user.id, localDate().slice(0, 7))
      }
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
    const replacement = { ...newEx, sets: oldEx.sets, reps: oldEx.reps, weight: oldEx.weight }
    const isProgrammeEx = (day?.exercises || []).some(e => e.id === oldEx.id)

    if (isProgrammeEx) {
      setSwapped(prev => { const m = new Map(prev); m.set(oldEx.id, replacement); return m })
    } else {
      const swapEntry = [...swapped.entries()].find(([, v]) => v.id === oldEx.id)
      if (swapEntry) {
        setSwapped(prev => { const m = new Map(prev); m.set(swapEntry[0], replacement); return m })
      } else {
        setExtraEx(prev => [
          ...prev.filter(e => e.id !== oldEx.id),
          replacement,
        ])
      }
    }
    setSets(s => {
      const c = { ...s }
      c[newEx.id] = c[oldEx.id] || []
      delete c[oldEx.id]
      return c
    })
    setSwapTarget(null)
  }

  function addExercise(ex) {
    if (exercises.some(e => e.id === ex.id)) { setAddingEx(false); setExQuery(''); return }
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
        // Exclude warmup sets from all finish-time calculations
        const workingSets = getSets(ex.id).filter(s => s.done && s.type !== 'W')
        if (!workingSets.length) continue
        totalSets  += workingSets.length
        const maxW  = Math.max(...workingSets.map(s => parseFloat(s.weight) || 0))
        totalVolume += workingSets.reduce((sum, s) =>
          sum + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0), 0)
        const pd       = prevData[ex.id]
        const prTarget = pd?.allTimeBest ?? pd?.weight ?? 0
        if (maxW > prTarget) {
          prs.push({ exercise: ex.name, value: maxW, prev: prTarget })
        }
      }

      await db.workoutLogs.put({
        id:             workoutLogId.current,
        userId:         user.id,
        date,
        name:           sessionName,
        programmeId:    programme?.id || null,
        dayName:        day?.name     || null,
        duration,
        totalSets,
        totalVolume,
        prs,
        exerciseNotes:  exNotes,
        status:         'complete',
        dirty:          1,
        updatedAt:      now,
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
              weight:       parseFloat(set.weight) || 0,
              reps:         parseInt(set.reps)     || 0,
              rpe:          set.rpe ? parseFloat(set.rpe) : null,
              type:         set.type || 'N',
              date, dirty: 1, updatedAt: now,
            })
          }
        }
      }

      setSummary({ duration, totalSets, totalVolume, prs })

      if (user?.id) flushDirtyToSupabase(user.id).catch(() => {})
    } catch (e) {
      console.error('Finish error:', e)
    } finally {
      setFinishing(false)
    }
  }

  async function handleCancel() {
    if (draftSaved.current && user?.id) {
      const month = localDate().slice(0, 7)
      await db.workoutSets.where('workoutLogId').equals(workoutLogId.current).delete().catch(() => {})
      await db.workoutLogs.delete(workoutLogId.current).catch(() => {})
      queueResync('workoutSets', user.id, month)
      queueResync('workoutLogs', user.id, month)
      flushDirtyToSupabase(user.id).catch(() => {})
    }
    onCancel?.()
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
            { val: fmt(summary.duration),                                 lbl: 'Duration'         },
            { val: summary.totalSets,                                     lbl: 'Sets'             },
            { val: `${Math.round(summary.totalVolume).toLocaleString()}`, lbl: `Volume (${unit})` },
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
                <span style={st.prVal}>{pr.value} {unit} · PR</span>
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
          <button key={'alt-' + alt.id} style={st.listRow} onClick={() => swapExercise(swapTarget, alt)}>
            <ExThumb exercise={alt} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={st.listName}>{alt.name}</div>
              <div style={st.listMeta}>{alt.muscle} · {alt.equipment}</div>
            </div>
          </button>
        ))}
        {!alternates.length && <p style={st.hint}>No built-in alternates — search below</p>}
        <input style={st.searchInput} placeholder="Or search any exercise…"
          value={exQuery} onChange={e => setExQuery(e.target.value)} />
        {exResults.map(ex => (
          <button key={'search-' + ex.id} style={st.listRow} onClick={() => swapExercise(swapTarget, ex)}>
            <ExThumb exercise={ex} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={st.listName}>{ex.name}</div>
              <div style={st.listMeta}>{ex.muscle} · {ex.equipment}</div>
            </div>
          </button>
        ))}
      </div>
    )
  }

  // ── Main log screen ────────────────────────────────────────────────────────
  const totalSetsAll = exercises.reduce((n, ex) => n + (sets[ex.id]?.length || 0), 0)
  const doneSetsAll  = exercises.reduce((n, ex) => n + (sets[ex.id]?.filter(s => s.done).length || 0), 0)

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
          <div style={st.startedAt}>
            {new Date(startRef.current).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
            {' · Started '}
            {new Date(startRef.current).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}
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

      {/* ── Inactivity alert ── */}
      {inactivityAlert && (
        <div style={st.inactivityBanner}>
          <div style={st.inactivityText}>
            Still going? No sets logged in 90+ min.
          </div>
          <div style={st.inactivityBtns}>
            <button style={st.inactivityFinish} onClick={handleFinish}>
              Finish Workout
            </button>
            <button style={st.inactivityDismiss} onClick={() => {
              lastActivityRef.current = Date.now()
              setInactivityAlert(false)
            }}>
              Still going
            </button>
          </div>
        </div>
      )}

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
            <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
              <div style={st.restLabel}>Rest</div>
              <div style={st.restTime}>{fmt(restTimer)}</div>
              <div style={st.restDurationRow}>
                <button style={st.restDurBtn} onClick={() => changeRestDuration(-15)}>−15s</button>
                <span style={st.restDurLabel}>{fmt(restDuration)}</span>
                <button style={st.restDurBtn} onClick={() => changeRestDuration(+15)}>+15s</button>
              </div>
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
        const hasPR   = sessionPRs.has(ex.id)

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
                  {hasPR && <span style={st.prBadgeInline}>PR</span>}
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
                  <button
                    style={{ ...st.formBtn, ...(formExpanded.has(ex.id) ? st.formBtnActive : {}) }}
                    onClick={() => setFormExpanded(prev => {
                      const next = new Set(prev)
                      next.has(ex.id) ? next.delete(ex.id) : next.add(ex.id)
                      return next
                    })}
                  >
                    {formExpanded.has(ex.id) ? 'Hide' : 'Cues'}
                  </button>
                )}
                <button style={st.swapBtn} onClick={() => setSwapTarget(ex)}>Swap</button>
              </div>
            </div>

            {/* Inline form panel */}
            {formExpanded.has(ex.id) && (
              <div style={st.formPanel}>
                <ExerciseVideo exerciseId={ex.id} exerciseName={ex.name} />
                {ex.feel && (
                  <div style={st.feelCard}>
                    <div style={st.feelLabel}>Where to feel it</div>
                    <div style={st.feelText}>{ex.feel}</div>
                  </div>
                )}
                <div style={st.cueCard}>
                  <div style={st.cuePanelHeader}>Key cues</div>
                  {(ex.cues || []).map((cue, ci) => (
                    <div key={ci} style={{ ...st.cueRow, ...(ci > 0 ? { borderTop:'0.5px solid var(--border-subtle)' } : {}) }}>
                      <span style={st.cueDot}>{ci + 1}</span>
                      <span style={st.cueText}>{cue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Column headers: # | PREV | WEIGHT | REPS | RPE | ✓ */}
            <div style={st.colHeader}>
              <span style={{ ...st.colLbl, width:'32px' }}>#</span>
              <span style={{ ...st.colLbl, width:'58px' }}>PREV</span>
              <span style={{ ...st.colLbl, flex:1.2 }}>{unit.toUpperCase()}</span>
              <span style={{ ...st.colLbl, flex:1 }}>REPS</span>
              <span style={{ ...st.colLbl, width:'36px' }}>RPE</span>
              <span style={{ ...st.colLbl, width:'44px' }}></span>
            </div>

            {/* Set rows */}
            {exSets.map((set, i) => {
              const isDone = set.done
              const ps     = pd?.allSets?.[i]
              const prevDisplay = ps
                ? `${parseFloat(ps.weight) || 0}×${parseInt(ps.reps) || 0}`
                : '—'
              const wPlaceholder = set.weightHint ?? (ps ? String(ps.weight) : '0')
              const rPlaceholder = set.repsHint   ?? (ps ? String(ps.reps)   : '10')
              const rpeHint      = set.rpeHint    ?? (ps?.rpe ? String(ps.rpe) : '')
              const setType      = set.type || 'N'
              const isWarmup     = setType === 'W'

              // Per-set PR: this set's resolved weight > allTimeBest
              const resolvedW = parseFloat(set.weight !== '' ? set.weight : (set.weightHint ?? '0')) || 0
              const isSetPR   = isDone && !isWarmup && pd && resolvedW > 0 && resolvedW > (pd.allTimeBest || 0)

              return (
                <div key={i} style={{
                  ...st.setRow,
                  ...(isDone ? st.setDone : {}),
                  ...(isWarmup ? st.setWarmup : {}),
                }}>
                  {/* Set type button — tap cycles N→W→D→F */}
                  <button
                    style={{ ...st.setTypeBtn, ...setTypeBtnStyle(setType) }}
                    onClick={() => !isDone && cycleSetType(ex.id, i)}
                    title={`Set type: ${setType} — tap to change`}
                  >
                    {setType === 'N' ? i + 1 : setType}
                  </button>

                  {/* Previous session for this set index */}
                  <span style={st.prevCell}>{prevDisplay}</span>

                  {/* Weight */}
                  <div style={{ flex:1.2, position:'relative', minWidth:0 }}>
                    <input
                      className="workout-num-input"
                      style={{ ...st.numIn, ...(isDone ? st.numInDone : {}), width:'100%', boxSizing:'border-box' }}
                      type="text" inputMode="decimal"
                      placeholder={wPlaceholder}
                      value={set.weight}
                      onChange={e => update(ex.id, i, 'weight', e.target.value)}
                      disabled={isDone}
                    />
                    {!isDone && (
                      <button
                        style={st.plateIcon}
                        onClick={() => setPlateCalc({ exId: ex.id, weight: parseFloat(set.weight || wPlaceholder) || 0 })}
                        title="Plate calculator"
                      >
                        ⚖
                      </button>
                    )}
                  </div>

                  {/* Reps */}
                  <input
                    className="workout-num-input"
                    style={{ ...st.numIn, ...(isDone ? st.numInDone : {}) }}
                    type="text" inputMode="numeric"
                    placeholder={rPlaceholder}
                    value={set.reps}
                    onChange={e => update(ex.id, i, 'reps', e.target.value)}
                    disabled={isDone}
                  />

                  {/* RPE */}
                  <button
                    style={{ ...st.rpeBtn, ...(set.rpe ? st.rpeBtnSet : {}), ...(isDone ? st.rpeBtnDone : {}), ...((!set.rpe && rpeHint) ? st.rpeBtnHint : {}) }}
                    onClick={() => !isDone && setRpePicker({ exId: ex.id, setIdx: i })}
                    disabled={isDone}
                  >
                    {set.rpe || (rpeHint ? rpeHint : '—')}
                  </button>

                  {/* Done / PR */}
                  {isDone ? (
                    <button style={{ ...st.checkDone, ...(isSetPR ? st.checkPR : {}) }} onClick={() => uncompleteSet(ex.id, i)}>
                      {isSetPR ? '🏆' : '✓'}
                    </button>
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

            {/* Exercise notes */}
            <div style={st.notesRow}>
              <textarea
                style={st.notesInput}
                placeholder="Exercise notes…"
                value={exNotes[ex.id] || ''}
                onChange={e => setExNotes(prev => ({ ...prev, [ex.id]: e.target.value }))}
                rows={1}
              />
            </div>
          </div>
        )
      })}

      {exercises.length === 0 && (
        <div style={st.emptySession}>
          <div style={st.emptyIcon}>💪</div>
          <div style={st.emptyText}>Add your first exercise to get started</div>
        </div>
      )}

      <button style={st.addExBtn} onClick={() => setAddingEx(true)}>+ Add Exercise</button>
      <button
        style={{ ...st.finishBtnBottom, opacity: finishing ? 0.6 : 1 }}
        onClick={handleFinish}
        disabled={finishing}
      >
        {finishing ? 'Saving…' : 'Finish Workout'}
      </button>
      <button style={st.cancelBtn} onClick={handleCancel}>Cancel Workout</button>

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
                <ExThumb exercise={ex} />
                <div style={{ flex: 1, minWidth: 0 }}>
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

      {/* ── Plate calculator bottom sheet ── */}
      {plateCalc && (
        <>
          <div style={st.backdrop} onClick={() => setPlateCalc(null)} />
          <div style={st.rpeSheet}>
            <div style={st.rpeHandle} />
            <div style={st.rpeTitle}>Plate Calculator</div>
            <PlateCalcSheet
              weight={plateCalc.weight}
              unit={unit}
              onClose={() => setPlateCalc(null)}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ── Plate calculator sheet content ────────────────────────────────────────────
function PlateCalcSheet({ weight, unit, onClose }) {
  const [target, setTarget] = useState(String(weight || ''))
  const targetW = parseFloat(target) || 0
  const { barWeight, plates } = calcPlates(targetW, unit)

  const plateCounts = {}
  for (const p of plates) plateCounts[p] = (plateCounts[p] || 0) + 1

  const PLATE_COLORS = {
    45: '#c0392b', 35: '#2980b9', 25: '#27ae60', 10: '#ffffff',
    5:  '#888888', 2.5: '#555555', 1.25: '#999999',
    20: '#c0392b', 15: '#2980b9', 1:   '#aaaaaa',
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
        <input
          style={{ flex:1, padding:'12px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', fontSize:'20px', fontWeight:'600', color:'var(--text-primary)', outline:'none', textAlign:'center', fontFamily:'var(--font-mono)' }}
          type="text" inputMode="decimal"
          value={target}
          onChange={e => setTarget(e.target.value)}
        />
        <span style={{ fontSize:'14px', color:'var(--text-tertiary)', fontWeight:'600' }}>{unit}</span>
      </div>

      {targetW > 0 && targetW >= barWeight && (
        <>
          {/* Visual bar */}
          <div style={{ display:'flex', alignItems:'center', gap:'3px', justifyContent:'center', flexWrap:'wrap', padding:'8px 0' }}>
            <div style={{ width:'60px', height:'14px', background:'#888', borderRadius:'4px', flexShrink:0 }} />
            {plates.map((p, i) => (
              <div key={i} style={{
                width: Math.max(14, p * 1.2) + 'px',
                height: Math.max(28, p * 2.2) + 'px',
                background: PLATE_COLORS[p] || '#666',
                borderRadius:'3px',
                border:'1.5px solid rgba(255,255,255,0.15)',
                flexShrink:0,
              }} />
            ))}
            <div style={{ width:'6px', height:'14px', background:'#888', borderRadius:'2px', flexShrink:0 }} />
          </div>

          {/* Plate list */}
          <div style={{ background:'var(--bg-elevated)', borderRadius:'var(--r-lg)', overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              Per side — {unit === 'kg' ? '20kg' : '45lb'} bar
            </div>
            {Object.entries(plateCounts).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0])).map(([plate, count]) => (
              <div key={plate} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderTop:'0.5px solid var(--border-subtle)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <div style={{ width:'14px', height:'22px', background: PLATE_COLORS[parseFloat(plate)] || '#666', borderRadius:'2px', border:'1px solid rgba(0,0,0,0.2)' }} />
                  <span style={{ fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', fontFamily:'var(--font-mono)' }}>{plate} {unit}</span>
                </div>
                <span style={{ fontSize:'15px', color:'var(--text-secondary)', fontFamily:'var(--font-mono)' }}>× {count}</span>
              </div>
            ))}
            <div style={{ padding:'12px 14px', borderTop:'0.5px solid var(--border-subtle)', display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:'13px', color:'var(--text-tertiary)' }}>Total</span>
              <span style={{ fontSize:'15px', fontWeight:'700', color:'var(--accent)', fontFamily:'var(--font-mono)' }}>
                {barWeight + plates.reduce((s, p) => s + p, 0) * 2} {unit}
              </span>
            </div>
          </div>
        </>
      )}

      {targetW > 0 && targetW < barWeight && (
        <div style={{ textAlign:'center', fontSize:'13px', color:'var(--text-tertiary)', padding:'8px 0' }}>
          Below bar weight ({barWeight} {unit})
        </div>
      )}

      <button style={{ padding:'13px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--text-secondary)', fontSize:'14px', cursor:'pointer' }}
        onClick={onClose}>
        Close
      </button>
    </div>
  )
}

// Set type button style helper
function setTypeBtnStyle(type) {
  if (type === 'W') return { background:'rgba(184,120,48,0.15)', color:'#b87830', border:'1px solid rgba(184,120,48,0.3)', fontWeight:'700' }
  if (type === 'D') return { background:'rgba(72,112,168,0.15)', color:'#4870a8', border:'1px solid rgba(72,112,168,0.3)', fontWeight:'700' }
  if (type === 'F') return { background:'rgba(200,60,60,0.12)',  color:'#c03c3c', border:'1px solid rgba(200,60,60,0.25)',  fontWeight:'700' }
  return {}  // N = default style
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const st = {
  container:     { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'40px' },

  // Header
  header:        { display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'4px 0 6px', gap:'8px' },
  sessionName:   { fontSize:'19px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em', lineHeight:1.2 },
  headerMeta:    { display:'flex', alignItems:'center', gap:'8px', marginTop:'4px' },
  startedAt:     { fontSize:'11px', color:'var(--text-tertiary)', marginTop:'3px', letterSpacing:'0.01em' },
  timerDot:      { width:'7px', height:'7px', borderRadius:'50%', background:'var(--accent)', display:'inline-block', flexShrink:0 },
  elapsed:       { fontSize:'13px', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)' },
  volumePill:    { fontSize:'12px', fontWeight:'600', color:'var(--accent)', background:'var(--accent-dim)', padding:'2px 8px', borderRadius:'var(--r-full)' },
  finishBtn:     { padding:'10px 20px', background:'var(--accent)', border:'none', borderRadius:'var(--r-lg)', color:'#fff', fontSize:'15px', fontWeight:'600', cursor:'pointer', letterSpacing:'-0.01em', whiteSpace:'nowrap' },
  finishBtnBottom: { padding:'16px', background:'var(--accent)', border:'none', borderRadius:'var(--r-xl)', color:'#fff', fontSize:'16px', fontWeight:'600', cursor:'pointer', letterSpacing:'-0.01em' },
  unitToggle:    { padding:'9px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'12px', fontWeight:'700', cursor:'pointer', letterSpacing:'0.04em' },

  // Inactivity alert
  inactivityBanner:  { background:'rgba(184,120,48,0.08)', border:'1px solid rgba(184,120,48,0.25)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'12px' },
  inactivityText:    { fontSize:'14px', fontWeight:'600', color:'var(--amber)' },
  inactivityBtns:    { display:'flex', gap:'8px' },
  inactivityFinish:  { flex:1, padding:'11px', background:'var(--accent)', border:'none', borderRadius:'var(--r-lg)', color:'#fff', fontSize:'14px', fontWeight:'600', cursor:'pointer' },
  inactivityDismiss: { flex:1, padding:'11px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--text-secondary)', fontSize:'14px', fontWeight:'500', cursor:'pointer' },

  // Overall progress bar
  overallTrack:  { height:'3px', background:'var(--bg-elevated)', borderRadius:'2px', overflow:'hidden' },
  overallFill:   { height:'100%', background:'var(--accent)', transition:'width 0.4s ease', borderRadius:'2px' },

  // Rest timer
  restBanner:       { borderRadius:'var(--r-xl)', overflow:'hidden', background:'var(--accent-dim)', border:'1px solid var(--accent)' },
  restTrack:        { height:'4px', background:'rgba(74,124,106,0.2)' },
  restFill:         { height:'100%', background:'var(--accent)', transition:'width 1s linear' },
  restContent:      { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px' },
  restLabel:        { fontSize:'11px', fontWeight:'700', color:'var(--accent)', letterSpacing:'0.06em', textTransform:'uppercase' },
  restTime:         { fontSize:'34px', fontWeight:'300', color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.05em', lineHeight:1 },
  restDurationRow:  { display:'flex', alignItems:'center', gap:'5px', marginTop:'4px' },
  restDurBtn:       { padding:'3px 7px', background:'rgba(74,124,106,0.1)', border:'1px solid var(--accent)', borderRadius:'var(--r-sm)', color:'var(--accent)', fontSize:'11px', fontWeight:'600', cursor:'pointer' },
  restDurLabel:     { fontSize:'11px', color:'var(--text-tertiary)', fontFamily:'var(--font-mono)', minWidth:'36px', textAlign:'center' },
  restBtns:         { display:'flex', gap:'6px', alignItems:'center' },
  restAdj:          { padding:'9px 12px', background:'rgba(74,124,106,0.15)', border:'1px solid var(--accent)', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  restSkip:         { padding:'9px 16px', background:'var(--accent)', border:'none', borderRadius:'var(--r-md)', color:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer' },

  // Exercise card
  exCard:        { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' },
  exCardDone:    { border:'1px solid var(--accent)' },
  exProgress:    { height:'4px', background:'var(--bg-elevated)' },
  exProgressBar: { height:'100%', background:'var(--accent)', transition:'width 0.4s var(--ease-out)', borderRadius:'0 2px 2px 0' },
  exHeader:      { display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'14px 16px 10px', gap:'12px' },
  exNameRow:     { display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' },
  exName:        { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', lineHeight:1.2 },
  doneBadge:     { fontSize:'10px', fontWeight:'700', color:'var(--accent)', background:'var(--accent-dim)', padding:'2px 7px', borderRadius:'var(--r-full)', textTransform:'uppercase', letterSpacing:'0.04em' },
  prBadgeInline: { fontSize:'10px', fontWeight:'800', color:'#b87830', background:'rgba(184,120,48,0.15)', padding:'2px 7px', borderRadius:'var(--r-full)', textTransform:'uppercase', letterSpacing:'0.06em' },
  exTagRow:      { display:'flex', alignItems:'center', gap:'5px', marginTop:'5px', flexWrap:'wrap' },
  muscleTag:     { fontSize:'11px', fontWeight:'600', padding:'2px 8px', borderRadius:'var(--r-full)', textTransform:'capitalize' },
  equipTag:      { fontSize:'11px', color:'var(--text-tertiary)', background:'var(--bg-elevated)', padding:'2px 8px', borderRadius:'var(--r-full)', textTransform:'capitalize' },
  formBtn:       { padding:'7px 13px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'12px', fontWeight:'600', cursor:'pointer', flexShrink:0 },
  formBtnActive: { background:'var(--accent)', color:'#fff' },
  swapBtn:       { padding:'7px 13px', background:'var(--bg-elevated)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'12px', fontWeight:'500', cursor:'pointer', flexShrink:0 },

  // Column headers
  colHeader:     { display:'flex', gap:'6px', padding:'6px 12px 4px', alignItems:'center', borderTop:'0.5px solid var(--border-subtle)' },
  colLbl:        { fontSize:'10px', fontWeight:'700', color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center', flexShrink:0 },

  // Set rows
  setRow:        { display:'flex', gap:'5px', padding:'8px 10px', alignItems:'center', borderTop:'0.5px solid var(--border-subtle)', transition:'background 0.2s ease', minHeight:'52px' },
  setDone:       { background:'rgba(74,124,106,0.06)' },
  setWarmup:     { background:'rgba(184,120,48,0.04)' },

  // Set type button (replaces plain set number)
  setTypeBtn:    { width:'32px', height:'32px', flexShrink:0, borderRadius:'var(--r-sm)', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-tertiary)', fontSize:'12px', fontWeight:'600', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-mono)' },

  // Previous column
  prevCell:      { width:'58px', flexShrink:0, fontSize:'11px', color:'var(--text-tertiary)', textAlign:'center', letterSpacing:'-0.01em', lineHeight:1.2, fontFamily:'var(--font-mono)' },

  numIn:         { flex:1, padding:'10px 4px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', outline:'none', textAlign:'center', minWidth:0, transition:'border-color 0.15s, background 0.2s' },
  numInDone:     { background:'transparent', border:'1px solid transparent', color:'var(--accent)', fontWeight:'700' },

  // Plate calculator icon inside weight cell
  plateIcon:     { position:'absolute', top:'2px', right:'2px', width:'14px', height:'14px', background:'none', border:'none', color:'var(--text-tertiary)', fontSize:'10px', cursor:'pointer', padding:0, display:'flex', alignItems:'center', justifyContent:'center', opacity:0.6 },

  // RPE
  rpeBtn:        { width:'36px', flexShrink:0, padding:'10px 2px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'11px', fontWeight:'500', color:'var(--text-tertiary)', cursor:'pointer', textAlign:'center' },
  rpeBtnSet:     { background:'var(--accent-dim)', border:'1px solid var(--accent)', color:'var(--accent)', fontWeight:'700' },
  rpeBtnHint:    { color:'var(--text-tertiary)', fontStyle:'italic' },
  rpeBtnDone:    { background:'transparent', border:'1px solid transparent', cursor:'default' },

  // Check buttons
  checkBtn:      { width:'44px', height:'44px', flexShrink:0, borderRadius:'50%', background:'var(--bg-elevated)', border:'2px solid var(--border-strong)', color:'var(--text-tertiary)', fontSize:'18px', fontWeight:'700', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s var(--ease-out)' },
  checkDone:     { width:'44px', height:'44px', flexShrink:0, borderRadius:'50%', background:'var(--accent)', border:'none', color:'#fff', fontSize:'18px', fontWeight:'700', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(74,124,106,0.4)' },
  checkPR:       { background:'#b87830', boxShadow:'0 2px 10px rgba(184,120,48,0.5)' },

  // Set actions
  setActions:    { display:'flex', gap:'8px', padding:'10px 12px', borderTop:'0.5px solid var(--border-subtle)' },
  addSetBtn:     { flex:1, padding:'10px', background:'transparent', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'13px', fontWeight:'500', cursor:'pointer' },
  removeSetBtn:  { padding:'10px 14px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--red)', fontSize:'13px', cursor:'pointer' },

  // Exercise notes
  notesRow:      { padding:'8px 12px 12px', borderTop:'0.5px solid var(--border-subtle)' },
  notesInput:    { width:'100%', boxSizing:'border-box', padding:'9px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'13px', color:'var(--text-primary)', outline:'none', resize:'none', fontFamily:'inherit', lineHeight:1.5 },

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
  listRow:       { display:'flex', alignItems:'center', gap:'12px', justifyContent:'space-between', width:'100%', padding:'10px 0', background:'transparent', border:'none', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left' },
  listName:      { fontSize:'15px', color:'var(--text-primary)', fontWeight:'500', lineHeight:1.2 },
  listMeta:      { fontSize:'12px', color:'var(--text-tertiary)', textTransform:'capitalize', marginTop:'3px' },
  listAdd:       { fontSize:'20px', color:'var(--accent)', fontWeight:'300', flexShrink:0, paddingLeft:'8px' },
  searchInput:   { padding:'13px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', fontSize:'15px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box', marginTop:'8px' },
  hint:          { fontSize:'13px', color:'var(--text-tertiary)', textAlign:'center', padding:'24px 0' },

  // Inline form panel (inside exercise card)
  formPanel:      { display:'flex', flexDirection:'column', gap:'10px', padding:'12px 12px 4px', borderTop:'0.5px solid var(--border-subtle)' },
  feelCard:       { background:'var(--accent-dim)', borderRadius:'var(--r-lg)', padding:'12px 14px', display:'flex', flexDirection:'column', gap:'4px' },
  feelLabel:      { fontSize:'10px', fontWeight:'700', color:'var(--accent)', letterSpacing:'0.08em', textTransform:'uppercase' },
  feelText:       { fontSize:'14px', color:'var(--text-primary)', lineHeight:1.55, fontWeight:'400' },
  cueCard:        { background:'var(--bg-elevated)', borderRadius:'var(--r-lg)', overflow:'hidden' },
  cuePanelHeader: { fontSize:'10px', fontWeight:'700', color:'var(--text-tertiary)', letterSpacing:'0.08em', textTransform:'uppercase', padding:'11px 14px 5px' },
  cueRow:         { display:'flex', alignItems:'flex-start', gap:'12px', padding:'10px 14px' },
  cueDot:         { width:'22px', height:'22px', borderRadius:'50%', background:'var(--accent)', color:'#fff', fontSize:'11px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:'1px' },
  cueText:        { fontSize:'14px', color:'var(--text-primary)', lineHeight:1.55, fontWeight:'400' },

  // RPE sheet
  backdrop:      { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:300 },
  rpeSheet:      { position:'fixed', bottom:0, left:0, right:0, background:'var(--bg-surface)', borderRadius:'20px 20px 0 0', padding:'16px 20px 40px', zIndex:301, display:'flex', flexDirection:'column', gap:'16px', maxHeight:'80vh', overflowY:'auto' },
  rpeHandle:     { width:'36px', height:'4px', borderRadius:'2px', background:'var(--border-strong)', alignSelf:'center' },
  rpeTitle:      { fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', textAlign:'center' },
  rpeScale:      { display:'flex', justifyContent:'space-between', fontSize:'12px', color:'var(--text-tertiary)', padding:'0 4px' },
  rpeGrid:       { display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'8px' },
  rpeChip:       { padding:'13px 4px', background:'var(--bg-elevated)', border:'1.5px solid var(--border-default)', borderRadius:'var(--r-lg)', fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', cursor:'pointer', textAlign:'center' },
  rpeChipOn:     { background:'var(--accent)', border:'1.5px solid var(--accent)', color:'#fff' },
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
  prVal:         { fontSize:'14px', fontWeight:'700', color:'#b87830', fontFamily:'var(--font-mono)' },
  doneBtn:       { width:'100%', padding:'17px', background:'var(--accent)', border:'none', borderRadius:'var(--r-xl)', color:'#fff', fontSize:'17px', fontWeight:'700', cursor:'pointer', letterSpacing:'-0.02em' },
}
