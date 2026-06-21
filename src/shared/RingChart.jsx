// ─── RingChart ────────────────────────────────────────────────────────────────
// Pure progress ring — used standalone or inside RingWithMacros (showLabel=false)

export default function RingChart({ current, goal, size = 120, showLabel = true }) {
  const radius       = (size / 2) - 10
  const circumference = 2 * Math.PI * radius
  const pct          = goal > 0 ? Math.min(1, current / goal) : 0
  const offset       = circumference - pct * circumference
  const over         = current > goal
  const center       = size / 2
  const strokeWidth  = size > 100 ? 8 : 6

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="var(--bg-elevated)" strokeWidth={strokeWidth}
        />
        <circle
          cx={center} cy={center} r={radius}
          fill="none"
          stroke={over ? 'var(--red)' : 'var(--accent)'}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>

      {showLabel && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '1px',
        }}>
          <span style={{
            fontSize: size > 100 ? '26px' : '20px',
            fontWeight: '300', letterSpacing: '-0.04em',
            color: over ? 'var(--red)' : 'var(--text-primary)',
            fontFamily: 'var(--font-sans)', lineHeight: '1',
          }}>
            {current.toLocaleString()}
          </span>
          <span style={{
            fontSize: '10px', color: 'var(--text-tertiary)',
            fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {over ? 'over' : 'kcal'}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── RingWithMacros ───────────────────────────────────────────────────────────
// Hero dashboard card — Oura-style: big number + progress arc + macro grid

import { MACRO_COLORS } from '../config.js'
import { getExpectedDayPct } from '../food/macroCalc.js'

const PACE_AMBER = '#f59e0b'

export function RingWithMacros({ totals, goals }) {
  const macros = [
    { key: 'protein', label: 'Protein' },
    { key: 'carbs',   label: 'Carbs'   },
    { key: 'fat',     label: 'Fat'     },
    { key: 'fibre',   label: 'Fibre'   },
  ]
  const expectedPct = getExpectedDayPct()

  return (
    <div style={styles.heroCard}>
      {macros.map(({ key, label }) => {
        const current     = Math.round(totals?.[key] || 0)
        const goal        = goals?.[key] || 0
        const pct         = goal > 0 ? Math.min(100, (current / goal) * 100) : 0
        const isOver      = current > goal
        const aheadOfPace = !isOver && pct > expectedPct + 15
        const fillColor   = isOver ? 'var(--red)' : aheadOfPace ? PACE_AMBER : MACRO_COLORS[key]

        return (
          <div key={key} style={styles.macroRow}>
            <div style={{ ...styles.macroDot, background: fillColor }} />
            <span style={styles.macroLabel}>{label}</span>
            <div style={styles.macroTrack}>
              <div style={{ ...styles.macroFill, width: `${pct}%`, background: fillColor }} />
            </div>
            <span style={{ ...styles.macroVal, color: isOver ? 'var(--red)' : 'var(--text-primary)' }}>
              {current}<span style={styles.macroGoal}>/{goal}g</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  heroCard: {
    background:    'var(--bg-surface)',
    boxShadow:     'var(--shadow-md)',
    borderRadius:  'var(--r-2xl)',
    padding:       '22px 20px 20px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '16px',
  },
  topRow: {
    display:        'flex',
    alignItems:     'flex-start',
    justifyContent: 'space-between',
  },
  calBlock: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '3px',
  },
  calNum: {
    fontSize:      '52px',
    fontWeight:    '200',
    letterSpacing: '-0.04em',
    lineHeight:    '1',
    fontFamily:    'var(--font-sans)',
  },
  calUnit: {
    fontSize:      '13px',
    fontWeight:    '500',
    color:         'var(--text-secondary)',
    letterSpacing: '-0.01em',
    marginTop:     '6px',
  },
  calSub: {
    fontSize:      '12px',
    fontWeight:    '400',
  },
  calTrack: {
    height:        '5px',
    background:    'var(--bg-elevated)',
    borderRadius:  '99px',
    overflow:      'hidden',
    position:      'relative',
  },
  calFill: {
    height:        '100%',
    borderRadius:  '99px',
    transition:    'width 0.6s cubic-bezier(0.16,1,0.3,1)',
  },
  macroRows: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },
  macroRow: {
    display:     'flex',
    alignItems:  'center',
    gap:         '10px',
  },
  macroDot: {
    width:        '8px',
    height:       '8px',
    borderRadius: '50%',
    flexShrink:   0,
  },
  macroLabel: {
    fontSize:   '13px',
    fontWeight: '500',
    color:      'var(--text-secondary)',
    width:      '50px',
    flexShrink: 0,
  },
  macroTrack: {
    flex:         1,
    height:       '6px',
    background:   'var(--bg-elevated)',
    borderRadius: '99px',
    overflow:     'hidden',
  },
  macroFill: {
    height:       '100%',
    borderRadius: '99px',
    transition:   'width 0.5s cubic-bezier(0.16,1,0.3,1)',
  },
  macroVal: {
    fontSize:      '13px',
    fontWeight:    '600',
    fontFamily:    'var(--font-mono)',
    width:         '72px',
    textAlign:     'right',
    flexShrink:    0,
    letterSpacing: '-0.01em',
  },
  macroGoal: {
    fontSize:   '11px',
    fontWeight: '400',
    color:      'var(--text-tertiary)',
  },
}
