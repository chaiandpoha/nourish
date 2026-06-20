// ─── RingChart ────────────────────────────────────────────────────────────────
// Circular calorie ring — hero element on the dashboard
// Shows calories consumed vs goal with animated fill

export default function RingChart({ current, goal, size = 120 }) {
  const radius      = (size / 2) - 10
  const circumference = 2 * Math.PI * radius
  const pct         = goal > 0 ? Math.min(1, current / goal) : 0
  const offset      = circumference - pct * circumference
  const over        = current > goal
  const center      = size / 2
  const strokeWidth = size > 100 ? 8 : 6

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth={strokeWidth}
        />

        {/* Fill */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={over ? 'var(--red)' : 'var(--accent)'}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>

      {/* Center content */}
      <div style={{
        position:        'absolute',
        inset:           0,
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        gap:             '1px',
      }}>
        <span style={{
          fontSize:      size > 100 ? '26px' : '20px',
          fontWeight:    '300',
          letterSpacing: '-0.04em',
          color:         over ? 'var(--red)' : 'var(--text-primary)',
          fontFamily:    'var(--font-sans)',
          lineHeight:    '1',
        }}>
          {current.toLocaleString()}
        </span>
        <span style={{
          fontSize:      '10px',
          color:         'var(--text-tertiary)',
          fontWeight:    '500',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {over ? 'over' : 'kcal'}
        </span>
      </div>
    </div>
  )
}

// ─── RingWithMacros ───────────────────────────────────────────────────────────
// Hero card — ring on the left, macro bars on the right
// This is the main dashboard widget

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

  const calGoal     = goals?.calories || 2000
  const calCurrent  = Math.round(totals?.calories || 0)
  const remaining   = Math.max(0, calGoal - calCurrent)
  const over        = calCurrent > calGoal
  const expectedPct = getExpectedDayPct()

  return (
    <div style={styles.heroCard}>
      {/* Left — ring + calorie detail */}
      <div style={styles.ringCol}>
        <RingChart
          current={calCurrent}
          goal={calGoal}
          size={108}
        />
        <div style={styles.calDetail}>
          <span style={styles.calDetailNum}>
            {over
              ? `+${(calCurrent - calGoal).toLocaleString()}`
              : remaining.toLocaleString()
            }
          </span>
          <span style={styles.calDetailLabel}>
            {over ? 'over goal' : 'remaining'}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div style={styles.divider} />

      {/* Right — macro bars */}
      <div style={styles.macroCol}>
        {macros.map(({ key, label }) => {
          const current     = Math.round(totals?.[key] || 0)
          const goal        = goals?.[key] || 0
          const pct         = goal > 0 ? Math.min(100, (current / goal) * 100) : 0
          const over        = current > goal
          const aheadOfPace = !over && pct > expectedPct + 15
          const fillColor   = over ? 'var(--red)' : aheadOfPace ? PACE_AMBER : MACRO_COLORS[key]

          return (
            <div key={key} style={styles.macroRow}>
              <span style={styles.macroLabel}>{label}</span>
              <div style={styles.macroTrack}>
                <div style={{
                  ...styles.macroFill,
                  width:      `${pct}%`,
                  background: fillColor,
                }} />
                <div style={{
                  position:   'absolute',
                  left:       `${expectedPct}%`,
                  top:        '-1px',
                  height:     'calc(100% + 2px)',
                  width:      '2px',
                  background: 'rgba(0,0,0,0.18)',
                  borderRadius: '1px',
                  transform:  'translateX(-50%)',
                }} />
              </div>
              <span style={{
                ...styles.macroVal,
                color: fillColor,
              }}>
                {current}<span style={styles.macroGoal}>/{goal}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  heroCard: {
    background:    'var(--bg-surface)',
    border:        '0.5px solid var(--border-subtle)',
    borderRadius:  'var(--r-xl)',
    padding:       '18px 16px',
    display:       'flex',
    alignItems:    'center',
    gap:           '16px',
  },
  ringCol: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           '8px',
    flexShrink:    0,
  },
  calDetail: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           '1px',
  },
  calDetailNum: {
    fontSize:      '15px',
    fontWeight:    '600',
    color:         'var(--text-primary)',
    letterSpacing: '-0.02em',
    fontFamily:    'var(--font-mono)',
  },
  calDetailLabel: {
    fontSize:      '10px',
    color:         'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight:    '500',
  },
  divider: {
    width:         '0.5px',
    alignSelf:     'stretch',
    background:    'var(--border-subtle)',
    flexShrink:    0,
  },
  macroCol: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },
  macroRow: {
    display:       'flex',
    alignItems:    'center',
    gap:           '8px',
  },
  macroLabel: {
    fontSize:      '12px',
    color:         'var(--text-secondary)',
    fontWeight:    '500',
    width:         '46px',
    flexShrink:    0,
  },
  macroTrack: {
    flex:          1,
    height:        '4px',
    background:    'var(--bg-elevated)',
    borderRadius:  '99px',
    position:      'relative',
  },
  macroFill: {
    height:        '100%',
    borderRadius:  '99px',
    transition:    'width 0.5s cubic-bezier(0.16,1,0.3,1)',
  },
  macroVal: {
    fontSize:      '12px',
    fontWeight:    '700',
    fontFamily:    'var(--font-mono)',
    width:         '52px',
    textAlign:     'right',
    flexShrink:    0,
    letterSpacing: '-0.01em',
  },
  macroGoal: {
    fontSize:      '10px',
    color:         'var(--text-tertiary)',
    fontWeight:    '400',
  },
}