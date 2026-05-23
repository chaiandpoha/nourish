import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { getFoodLogForDate, deleteFoodLogEntry, addFoodLogEntry } from '../db/db.js'
import { sumMacros } from '../food/macroCalc.js'
import { MACRO_COLORS } from '../config.js'

const MEAL_SLOTS   = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_ICONS   = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' }
const MEAL_LABELS  = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

// ─── DayLog ───────────────────────────────────────────────────────────────────
// Shows all 4 meal slots for a given date
// Each slot shows logged foods + macro subtotal + copy from yesterday

export default function DayLog({ date, onTotalsChange }) {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const today     = date || new Date().toISOString().slice(0, 10)
  const yesterday = (() => {
    const d = new Date(today)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const loadLogs = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const entries = await getFoodLogForDate(user.id, today)
    setLogs(entries)
    setLoading(false)
    // Bubble totals up to parent (dashboard)
    onTotalsChange?.(sumMacros(entries))
  }, [user, today])

  useEffect(() => { loadLogs() }, [loadLogs])

  async function handleDelete(id) {
    await deleteFoodLogEntry(id)
    loadLogs()
  }

  async function handleCopyFromYesterday(meal) {
    if (!user) return
    const yesterdayLogs = await getFoodLogForDate(user.id, yesterday)
    const slotLogs = yesterdayLogs.filter(l => l.meal === meal)
    if (!slotLogs.length) return

    for (const log of slotLogs) {
      const { id, ...entry } = log
      await addFoodLogEntry(user.id, { ...entry, date: today })
    }
    loadLogs()
  }

  const byMeal = MEAL_SLOTS.reduce((acc, meal) => {
    acc[meal] = logs.filter(l => l.meal === meal)
    return acc
  }, {})

  if (loading) {
    return <div style={styles.loading}>Loading…</div>
  }

  return (
    <div style={styles.container}>
      {MEAL_SLOTS.map(meal => (
        <MealSlot
          key={meal}
          meal={meal}
          entries={byMeal[meal]}
          onDelete={handleDelete}
          onCopyFromYesterday={() => handleCopyFromYesterday(meal)}
        />
      ))}
    </div>
  )
}

// ─── MealSlot ─────────────────────────────────────────────────────────────────

function MealSlot({ meal, entries, onDelete, onCopyFromYesterday }) {
  const [expanded, setExpanded] = useState(true)
  const totals  = sumMacros(entries)
  const hasFood = entries.length > 0

  return (
    <div style={styles.slot}>
      {/* Slot header */}
      <button
        style={styles.slotHeader}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={styles.slotIcon}>{MEAL_ICONS[meal]}</span>
        <span style={styles.slotLabel}>{MEAL_LABELS[meal]}</span>

        {hasFood && (
          <span style={styles.slotMacros}>
            {totals.calories} kcal · {totals.protein}g P
          </span>
        )}

        <span style={styles.chevron}>
          {expanded ? '˄' : '˅'}
        </span>
      </button>

      {expanded && (
        <>
          {/* Food entries */}
          {entries.map(entry => (
            <FoodEntryRow
              key={entry.id}
              entry={entry}
              onDelete={() => onDelete(entry.id)}
            />
          ))}

          {/* Empty state */}
          {!hasFood && (
            <div style={styles.emptySlot}>
              Nothing logged yet
            </div>
          )}

          {/* Slot footer */}
          <div style={styles.slotFooter}>
            <button
              style={styles.copyBtn}
              onClick={onCopyFromYesterday}
            >
              ↩ Copy from yesterday
            </button>

            {hasFood && (
              <div style={styles.slotTotals}>
                {[
                  { key: 'protein', label: 'P', val: totals.protein  },
                  { key: 'carbs',   label: 'C', val: totals.carbs    },
                  { key: 'fat',     label: 'F', val: totals.fat      },
                  { key: 'fibre',   label: 'Fi',val: totals.fibre    },
                ].map(({ key, label, val }) => (
                  <span
                    key={key}
                    style={{ ...styles.slotTotal, color: MACRO_COLORS[key] }}
                  >
                    {val}g {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── FoodEntryRow ─────────────────────────────────────────────────────────────

function FoodEntryRow({ entry, onDelete }) {
  const [showDelete, setShowDelete] = useState(false)

  return (
    <div
      style={styles.entryRow}
      onClick={() => setShowDelete(s => !s)}
    >
      <div style={styles.entryInfo}>
        <div style={styles.entryName}>{entry.name}</div>
        <div style={styles.entryMeta}>
          {entry.grams}g · {entry.calories} kcal · {entry.protein}g P
        </div>
      </div>

      {showDelete ? (
        <button
          style={styles.deleteBtn}
          onClick={e => { e.stopPropagation(); onDelete() }}
        >
          Remove
        </button>
      ) : (
        <span style={styles.entryCalories}>{entry.calories}</span>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '8px',
  },
  loading: {
    fontSize:      '14px',
    color:         'var(--text-tertiary)',
    textAlign:     'center',
    padding:       '24px 0',
  },
  slot: {
    background:    'var(--bg-surface)',
    border:        '0.5px solid var(--border-subtle)',
    borderRadius:  'var(--r-xl)',
    overflow:      'hidden',
  },
  slotHeader: {
    display:       'flex',
    alignItems:    'center',
    width:         '100%',
    padding:       '13px 14px',
    background:    'transparent',
    border:        'none',
    cursor:        'pointer',
    gap:           '8px',
    textAlign:     'left',
  },
  slotIcon: {
    fontSize:      '16px',
    flexShrink:    0,
  },
  slotLabel: {
    fontSize:      '14px',
    fontWeight:    '600',
    color:         'var(--text-primary)',
    letterSpacing: '-0.01em',
    flex:          1,
  },
  slotMacros: {
    fontSize:      '12px',
    color:         'var(--text-secondary)',
    fontWeight:    '500',
  },
  chevron: {
    fontSize:      '14px',
    color:         'var(--text-tertiary)',
    flexShrink:    0,
  },
  emptySlot: {
    fontSize:      '13px',
    color:         'var(--text-tertiary)',
    padding:       '8px 14px 4px',
  },
  entryRow: {
    display:       'flex',
    alignItems:    'center',
    padding:       '10px 14px',
    borderTop:     '0.5px solid var(--border-subtle)',
    cursor:        'pointer',
    gap:           '8px',
  },
  entryInfo: {
    flex:          1,
    display:       'flex',
    flexDirection: 'column',
    gap:           '2px',
  },
  entryName: {
    fontSize:      '14px',
    fontWeight:    '500',
    color:         'var(--text-primary)',
    letterSpacing: '-0.01em',
  },
  entryMeta: {
    fontSize:      '12px',
    color:         'var(--text-tertiary)',
  },
  entryCalories: {
    fontSize:      '14px',
    fontWeight:    '600',
    color:         'var(--text-secondary)',
    fontFamily:    'var(--font-mono)',
    flexShrink:    0,
  },
  deleteBtn: {
    padding:       '5px 10px',
    background:    'rgba(200,80,64,0.08)',
    border:        'none',
    borderRadius:  'var(--r-sm)',
    color:         'var(--red)',
    fontSize:      '12px',
    fontWeight:    '600',
    cursor:        'pointer',
    flexShrink:    0,
  },
  slotFooter: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         '8px 14px 12px',
    borderTop:       '0.5px solid var(--border-subtle)',
    flexWrap:        'wrap',
    gap:             '8px',
  },
  copyBtn: {
    background:    'none',
    border:        'none',
    color:         'var(--text-tertiary)',
    fontSize:      '12px',
    cursor:        'pointer',
    padding:       0,
    fontWeight:    '500',
  },
  slotTotals: {
    display:       'flex',
    gap:           '10px',
  },
  slotTotal: {
    fontSize:      '12px',
    fontWeight:    '600',
    fontFamily:    'var(--font-mono)',
  },
}