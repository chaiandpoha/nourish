// ─── MacroBar ─────────────────────────────────────────────────────────────────
// Horizontal progress bar for a single macro
// Shows label, current value, goal, and fill

export default function MacroBar({ label, current, goal, color }) {
  const pct     = goal > 0 ? Math.min(100, (current / goal) * 100) : 0
  const over    = current > goal
  const nearGoal = pct >= 90 && !over

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
        <span style={styles.values}>
          <span style={{ ...styles.current, color }}>{current}</span>
          <span style={styles.separator}> / </span>
          <span style={styles.goal}>{goal}g</span>
        </span>
      </div>

      <div style={styles.track}>
        <div
          style={{
            ...styles.fill,
            width:      `${pct}%`,
            background: over ? 'var(--red)' : color,
            opacity:    nearGoal ? 1 : 0.85,
          }}
        />
        {over && (
          <div
            style={{
              ...styles.overFill,
              background: color,
              opacity:    0.2,
            }}
          />
        )}
      </div>

      <div style={styles.footer}>
        <span style={styles.pct}>{Math.round(pct)}%</span>
        {over
          ? <span style={styles.overText}>+{Math.round(current - goal)}g over</span>
          : <span style={styles.remaining}>{Math.round(goal - current)}g left</span>
        }
      </div>
    </div>
  )
}

// ─── MacroBarGroup ────────────────────────────────────────────────────────────
// Renders all 4 macro bars (protein, carbs, fat, fibre) in a card

import { MACRO_COLORS } from '../config.js'

export function MacroBarGroup({ totals, goals }) {
  const bars = [
    { key: 'protein', label: 'Protein' },
    { key: 'carbs',   label: 'Carbs'   },
    { key: 'fat',     label: 'Fat'     },
    { key: 'fibre',   label: 'Fibre'   },
  ]

  return (
    <div style={styles.group}>
      {bars.map(({ key, label }) => (
        <MacroBar
          key={key}
          label={label}
          current={Math.round(totals?.[key] || 0)}
          goal={goals?.[key]   || 0}
          color={MACRO_COLORS[key]}
        />
      ))}
    </div>
  )
}

// ─── MacroRow ─────────────────────────────────────────────────────────────────
// Compact single-line macro summary — used in meal slots

export function MacroRow({ totals, goals }) {
  const items = [
    { key: 'calories', label: 'kcal' },
    { key: 'protein',  label: 'P'    },
    { key: 'carbs',    label: 'C'    },
    { key: 'fat',      label: 'F'    },
    { key: 'fibre',    label: 'Fi'   },
  ]

  return (
    <div style={styles.row}>
      {items.map(({ key, label }) => {
        const val  = Math.round(totals?.[key]  || 0)
        const goal = goals?.[key] || 0
        const over = goal > 0 && val > goal
        return (
          <div key={key} style={styles.rowItem}>
            <span style={{
              ...styles.rowVal,
              color: over ? 'var(--red)' : MACRO_COLORS[key]
            }}>
              {val}
            </span>
            <span style={styles.rowLabel}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  // MacroBar
  container: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '4px',
  },
  header: {
    display:         'flex',
    alignItems:      'baseline',
    justifyContent:  'space-between',
  },
  label: {
    fontSize:        '12px',
    fontWeight:      '500',
    color:           'var(--text-secondary)',
  },
  values: {
    fontSize:        '12px',
    display:         'flex',
    alignItems:      'baseline',
    gap:             '1px',
  },
  current: {
    fontWeight:      '700',
    fontFamily:      'var(--font-mono)',
    fontSize:        '13px',
  },
  separator: {
    color:           'var(--text-tertiary)',
  },
  goal: {
    color:           'var(--text-tertiary)',
    fontFamily:      'var(--font-mono)',
  },
  track: {
    height:          '5px',
    background:      'var(--bg-elevated)',
    borderRadius:    '99px',
    overflow:        'hidden',
    position:        'relative',
  },
  fill: {
    height:          '100%',
    borderRadius:    '99px',
    transition:      'width 0.5s cubic-bezier(0.16,1,0.3,1)',
    position:        'absolute',
    top:             0,
    left:            0,
  },
  overFill: {
    position:        'absolute',
    inset:           0,
    borderRadius:    '99px',
  },
  footer: {
    display:         'flex',
    justifyContent:  'space-between',
    alignItems:      'center',
  },
  pct: {
    fontSize:        '11px',
    color:           'var(--text-tertiary)',
    fontFamily:      'var(--font-mono)',
  },
  remaining: {
    fontSize:        '11px',
    color:           'var(--text-tertiary)',
  },
  overText: {
    fontSize:        '11px',
    color:           'var(--red)',
    fontWeight:      '600',
  },

  // MacroBarGroup
  group: {
    display:         'flex',
    flexDirection:   'column',
    gap:             '12px',
  },

  // MacroRow
  row: {
    display:         'flex',
    justifyContent:  'space-between',
    background:      'var(--bg-elevated)',
    borderRadius:    'var(--r-lg)',
    padding:         '10px 8px',
  },
  rowItem: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             '2px',
    flex:            1,
  },
  rowVal: {
    fontSize:        '15px',
    fontWeight:      '700',
    fontFamily:      'var(--font-mono)',
    letterSpacing:   '-0.02em',
  },
  rowLabel: {
    fontSize:        '10px',
    color:           'var(--text-tertiary)',
    fontWeight:      '500',
    textTransform:   'uppercase',
    letterSpacing:   '0.04em',
  },
}