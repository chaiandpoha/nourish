import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/db.js'
import { searchExercises } from './ExerciseDB.js'

export default function WorkoutCharts() {
  const { user }                  = useAuth()
  const [query,    setQuery]      = useState('')
  const [results,  setResults]    = useState([])
  const [exercise, setExercise]   = useState(null)
  const [points,   setPoints]     = useState([])
  const [loading,  setLoading]    = useState(false)
  const unit = localStorage.getItem('workoutUnit') || 'lbs'

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    setResults(searchExercises(query, 8))
  }, [query])

  useEffect(() => {
    if (!exercise || !user) return
    loadChart()
  }, [exercise?.id, user?.id])

  async function loadChart() {
    setLoading(true)
    try {
      const sets = await db.workoutSets
        .where('userId').equals(user.id)
        .and(s => s.exerciseId === exercise.id && !!s.weight && !!s.date)
        .toArray()

      // Group by date — max weight + total volume
      const byDate = {}
      for (const s of sets) {
        const w = parseFloat(s.weight) || 0
        const r = parseInt(s.reps)     || 0
        if (!byDate[s.date]) byDate[s.date] = { maxWeight: 0, volume: 0 }
        if (w > byDate[s.date].maxWeight) byDate[s.date].maxWeight = w
        byDate[s.date].volume += w * r
      }

      // Sort chronologically, mark PRs
      const sorted = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v, pr: false }))

      let best = 0
      for (const p of sorted) {
        if (p.maxWeight > best) { p.pr = true; best = p.maxWeight }
      }

      setPoints(sorted.slice(-52)) // last 52 sessions max
    } finally {
      setLoading(false)
    }
  }

  function selectExercise(ex) {
    setExercise(ex)
    setQuery('')
    setResults([])
    setPoints([])
  }

  return (
    <div style={s.container}>
      <div style={s.searchWrap}>
        <input
          style={s.searchInput}
          placeholder="Search exercise to chart…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <div style={s.dropdown}>
            {results.map(ex => (
              <button key={ex.id} style={s.dropRow} onClick={() => selectExercise(ex)}>
                <span style={s.dropName}>{ex.name}</span>
                <span style={s.dropMeta}>{ex.muscle}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {exercise && (
        <div style={s.exLabel}>{exercise.name} · {exercise.muscle}</div>
      )}

      {loading && <p style={s.hint}>Loading…</p>}

      {!loading && exercise && points.length === 0 && (
        <div style={s.empty}>No sets logged for this exercise yet</div>
      )}

      {!loading && points.length > 0 && <LineChart points={points} unit={unit} />}

      {!exercise && (
        <div style={s.placeholder}>
          <div style={s.placeholderIcon}>📈</div>
          <p style={s.placeholderText}>Search for an exercise to see your progress over time</p>
        </div>
      )}
    </div>
  )
}

// ── SVG line chart ─────────────────────────────────────────────────────────────

function LineChart({ points, unit }) {
  const W = 300, H = 130
  const PAD = { t: 14, r: 14, b: 26, l: 38 }
  const iW  = W - PAD.l - PAD.r
  const iH  = H - PAD.t - PAD.b

  const weights  = points.map(p => p.maxWeight)
  const minW     = Math.min(...weights)
  const maxW     = Math.max(...weights)
  const range    = maxW - minW || 1

  const toX = i  => PAD.l + (i / Math.max(points.length - 1, 1)) * iW
  const toY = w  => PAD.t + iH - ((w - minW) / range) * iH

  const polyPts = points.map((p, i) => `${toX(i).toFixed(1)},${toY(p.maxWeight).toFixed(1)}`).join(' ')

  const yTicks = [minW, minW + range / 2, maxW]
  const xLabelIdxs = points.length <= 3
    ? points.map((_, i) => i)
    : [0, Math.floor((points.length - 1) / 2), points.length - 1]

  const delta = points[points.length - 1].maxWeight - points[0].maxWeight
  const deltaStr = points.length === 1
    ? 'First session'
    : (delta >= 0 ? '+' : '') + delta + ` ${unit}`

  return (
    <div style={s.chartWrap}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto', overflow:'visible', display:'block' }}>
        {/* Gridlines + y-axis labels */}
        {yTicks.map((v, i) => {
          const y = toY(v)
          return (
            <g key={i}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                stroke="var(--border-subtle)" strokeWidth="0.5" strokeDasharray="3 3" />
              <text x={PAD.l - 4} y={y + 3.5} textAnchor="end"
                fontSize="8" fill="var(--text-tertiary)">{Math.round(v)}</text>
            </g>
          )
        })}

        {/* X-axis date labels */}
        {xLabelIdxs.map(i => (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle"
            fontSize="8" fill="var(--text-tertiary)">{fmtDate(points[i].date)}</text>
        ))}

        {/* Line */}
        <polyline points={polyPts}
          fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={toX(i)} cy={toY(p.maxWeight)}
              r={p.pr ? 5 : 3}
              fill={p.pr ? 'var(--accent)' : 'var(--bg-base)'}
              stroke="var(--accent)" strokeWidth="1.5"
            />
            {p.pr && (
              <text x={toX(i)} y={toY(p.maxWeight) - 8} textAnchor="middle"
                fontSize="9" fill="var(--accent)">★</text>
            )}
          </g>
        ))}
      </svg>

      <div style={s.statsRow}>
        <div style={s.stat}>
          <div style={s.statVal}>{maxW} {unit}</div>
          <div style={s.statLbl}>Best</div>
        </div>
        <div style={s.stat}>
          <div style={s.statVal}>{points.length}</div>
          <div style={s.statLbl}>Sessions</div>
        </div>
        <div style={{ ...s.stat, borderRight:'none' }}>
          <div style={{ ...s.statVal, color: delta >= 0 ? 'var(--accent)' : 'var(--red)' }}>{deltaStr}</div>
          <div style={s.statLbl}>Progress</div>
        </div>
      </div>

      {points.filter(p => p.pr).length > 0 && (
        <div style={s.prNote}>★ marks a personal record</div>
      )}
    </div>
  )
}

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const s = {
  container:       { display:'flex', flexDirection:'column', gap:'16px', paddingBottom:'32px' },
  searchWrap:      { position:'relative' },
  searchInput:     { width:'100%', boxSizing:'border-box', padding:'11px 14px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', fontSize:'14px', color:'var(--text-primary)', outline:'none' },
  dropdown:        { position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', zIndex:20, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.08)' },
  dropRow:         { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'10px 14px', background:'none', border:'none', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left' },
  dropName:        { fontSize:'14px', color:'var(--text-primary)' },
  dropMeta:        { fontSize:'12px', color:'var(--text-tertiary)' },
  exLabel:         { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  hint:            { textAlign:'center', fontSize:'13px', color:'var(--text-tertiary)', margin:0 },
  empty:           { padding:'32px 0', textAlign:'center', fontSize:'14px', color:'var(--text-tertiary)' },
  placeholder:     { display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', padding:'48px 0' },
  placeholderIcon: { fontSize:'40px' },
  placeholderText: { fontSize:'14px', color:'var(--text-tertiary)', textAlign:'center', maxWidth:'220px', margin:0 },
  chartWrap:       { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'12px' },
  statsRow:        { display:'grid', gridTemplateColumns:'repeat(3, 1fr)' },
  stat:            { display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', padding:'8px 0', borderRight:'0.5px solid var(--border-subtle)' },
  statVal:         { fontSize:'20px', fontWeight:'600', color:'var(--text-primary)', fontFamily:'var(--font-mono)', letterSpacing:'-0.03em' },
  statLbl:         { fontSize:'10px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em' },
  prNote:          { fontSize:'11px', color:'var(--text-tertiary)', textAlign:'center' },
}
