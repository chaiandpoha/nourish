import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { getFoodLogForDate, deleteFoodLogEntry, addFoodLogEntry, updateFoodLogEntry } from '../db/db.js'
import { sumMacros } from '../food/macroCalc.js'
import { MACRO_COLORS } from '../config.js'
import { Skeleton, SkeletonCard } from '../shared/Skeleton.jsx'

const MEAL_SLOTS  = ['breakfast', 'lunch', 'dinner', 'snack']
const MEAL_ICONS  = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' }
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

// Local date (not UTC) — fixes midnight–5:30am IST showing wrong day
export function localDate(d = new Date()) {
  return d.toLocaleDateString('en-CA') // always YYYY-MM-DD in local tz
}

function yesterday(dateStr) {
  const [y, m, dy] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, dy - 1).toLocaleDateString('en-CA')
}

// Active meal persisted with date so it resets each day
const MEAL_PREF_KEY = 'nourish_active_meal'

function saveMealPref(meal) {
  localStorage.setItem(MEAL_PREF_KEY, JSON.stringify({ meal, date: localDate() }))
}

export function readMealPref() {
  try {
    const p = JSON.parse(localStorage.getItem(MEAL_PREF_KEY) || 'null')
    if (p?.date === localDate()) return p.meal
  } catch {}
  return null
}

export function timeSlot() {
  const h = new Date().getHours()
  if (h < 12) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 19) return 'snack'
  return 'dinner'
}

// Returns the best meal tab for + button: first unfilled from current-time order
export function smartMealSlot(byMeal) {
  const base  = timeSlot()
  const order = MEAL_SLOTS
  const idx   = order.indexOf(base)
  if (!byMeal[base]?.length) return base
  for (let i = 1; i < order.length; i++) {
    const s = order[(idx + i) % order.length]
    if (!byMeal[s]?.length) return s
  }
  return base
}

// ─── DayLog ───────────────────────────────────────────────────────────────────

export default function DayLog({ date, onTotalsChange, reloadTrigger }) {
  const [logs,      setLogs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  // Past dates default to breakfast; today uses saved pref or time-based slot
  const [activeTab, setActiveTab] = useState(() =>
    (!date || date === localDate()) ? (readMealPref() || timeSlot()) : 'breakfast'
  )
  const { user } = useAuth()

  // Compute target date fresh on each load — avoids stale "today" if app is
  // kept open across midnight (date prop wins for calendar past-day views)
  const getTargetDate = useCallback(() => date || localDate(), [date])
  const isToday = !date || date === localDate()

  const loadLogs = useCallback(async () => {
    if (!user) return
    const targetDate = getTargetDate()
    const todayDate  = localDate()
    const loading_isToday = targetDate === todayDate
    setLoading(true)
    const entries = await getFoodLogForDate(user.id, targetDate)
    setLogs(entries)
    setLoading(false)
    onTotalsChange?.(sumMacros(entries))

    if (loading_isToday) {
      const byMeal = MEAL_SLOTS.reduce((acc, m) => {
        acc[m] = entries.filter(l => l.meal === m)
        return acc
      }, {})
      const saved = readMealPref()
      if (!saved) {
        const smart = smartMealSlot(byMeal)
        setActiveTab(smart)
        saveMealPref(smart)
      }
    }
  }, [user, getTargetDate])

  useEffect(() => { loadLogs() }, [loadLogs, reloadTrigger])

  // Reload when app comes back to foreground (handles midnight date change)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadLogs() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadLogs])

  function handleTabChange(meal) {
    setActiveTab(meal)
    if (isToday) saveMealPref(meal)
  }

  async function handleDelete(id) {
    await deleteFoodLogEntry(id)
    loadLogs()
  }

  async function handleEdit(id, updates) {
    await updateFoodLogEntry(id, updates)
    loadLogs()
  }

  async function handleCopyFromYesterday() {
    if (!user) return
    const today   = getTargetDate()
    const prev    = yesterday(today)
    const prevLogs = await getFoodLogForDate(user.id, prev)
    const slotLogs = prevLogs.filter(l => l.meal === activeTab)
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

  const activeEntries = byMeal[activeTab] || []
  const activeTotals  = sumMacros(activeEntries)
  const dayTotals     = sumMacros(logs)

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.tabRow}>
          {MEAL_SLOTS.map(m => <Skeleton key={m} height="36px" style={{ flex:1, borderRadius:'var(--r-lg)' }} />)}
        </div>
        <SkeletonCard style={{ gap:'10px' }}>
          <Skeleton height="14px" width="60%" radius="6px" />
          <Skeleton height="12px" width="80%" radius="5px" />
          <Skeleton height="12px" width="50%" radius="5px" />
        </SkeletonCard>
      </div>
    )
  }

  return (
    <div style={s.container}>
      {/* Tab row */}
      <div style={s.tabRow}>
        {MEAL_SLOTS.map(meal => {
          const kcal    = sumMacros(byMeal[meal]).calories
          const hasFood = byMeal[meal].length > 0
          const active  = meal === activeTab
          return (
            <button
              key={meal}
              style={{ ...s.tab, ...(active ? s.tabActive : {}) }}
              onClick={() => handleTabChange(meal)}
            >
              <span style={s.tabIcon}>{MEAL_ICONS[meal]}</span>
              <span style={{ ...s.tabLabel, ...(active ? s.tabLabelActive : {}) }}>
                {MEAL_LABELS[meal]}
              </span>
              {hasFood && (
                <span style={{ ...s.tabKcal, ...(active ? s.tabKcalActive : {}) }}>
                  {kcal}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content card */}
      <div style={s.card}>
        {/* Meal header */}
        <div style={s.cardHeader}>
          <span style={s.cardTitle}>
            {MEAL_ICONS[activeTab]} {MEAL_LABELS[activeTab]}
          </span>
          {activeEntries.length > 0 && (
            <span style={s.cardKcal}>{activeTotals.calories} kcal</span>
          )}
        </div>

        {/* Food entries — tap to reveal Edit/Remove */}
        {activeEntries.map(entry => (
          <FoodEntryRow
            key={entry.id}
            entry={entry}
            onDelete={() => handleDelete(entry.id)}
            onEdit={(updates) => handleEdit(entry.id, updates)}
          />
        ))}

        {/* Empty state */}
        {activeEntries.length === 0 && (
          <div style={s.emptySlot}>
            Nothing logged yet — tap + to add
          </div>
        )}

        {/* Macro breakdown for this meal */}
        {activeEntries.length > 0 && (
          <div style={s.mealMacros}>
            {[
              { key: 'protein', label: 'P', val: activeTotals.protein  },
              { key: 'carbs',   label: 'C', val: activeTotals.carbs    },
              { key: 'fat',     label: 'F', val: activeTotals.fat      },
              { key: 'fibre',   label: 'Fi',val: activeTotals.fibre    },
            ].map(({ key, label, val }) => (
              <span key={key} style={{ ...s.mealMacro, color: MACRO_COLORS[key] }}>
                {val}g {label}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={s.cardFooter}>
          <button style={s.copyBtn} onClick={handleCopyFromYesterday}>
            ↩ Copy from yesterday
          </button>
          {logs.length > 0 && (
            <span style={s.dayTotal}>{dayTotals.calories} kcal {isToday ? 'today' : 'total'}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── FoodEntryRow ─────────────────────────────────────────────────────────────
// Tap once → shows Edit / Remove actions. Tap again → collapses.

function FoodEntryRow({ entry, onDelete, onEdit }) {
  const [mode,         setMode]         = useState('collapsed') // collapsed | actions | editing
  const [gramsStr,     setGramsStr]     = useState(String(entry.grams))
  const [adjMode,      setAdjMode]      = useState(false) // ingredient-level adjust
  const [adjIngredients, setAdjIngredients] = useState([])

  const isBatch  = entry.source === 'batch' || !!entry.batchId
  const newGrams = parseFloat(gramsStr) || 0
  const ratio    = entry.grams > 0 ? newGrams / entry.grams : 0

  // Simple grams-scaled preview
  const simplePreview = {
    calories: Math.round(entry.calories * ratio),
    protein:  Math.round(entry.protein  * ratio * 10) / 10,
    carbs:    Math.round(entry.carbs    * ratio * 10) / 10,
    fat:      Math.round(entry.fat      * ratio * 10) / 10,
    fibre:    Math.round((entry.fibre || 0) * ratio * 10) / 10,
  }

  // Ingredient-adjusted preview
  const adjTotalGrams = adjIngredients.reduce((s, i) => s + (parseFloat(i.gramsInput) || 0), 0)
  const adjMacros = adjIngredients.reduce((m, i) => {
    const g  = parseFloat(i.gramsInput) || 0
    const p  = i.per100g || {}
    return {
      calories: Math.round(m.calories + (p.calories || 0) * g / 100),
      protein:  Math.round((m.protein  + (p.protein  || 0) * g / 100) * 10) / 10,
      carbs:    Math.round((m.carbs    + (p.carbs    || 0) * g / 100) * 10) / 10,
      fat:      Math.round((m.fat      + (p.fat      || 0) * g / 100) * 10) / 10,
      fibre:    Math.round((m.fibre    + (p.fibre    || 0) * g / 100) * 10) / 10,
    }
  }, { calories:0, protein:0, carbs:0, fat:0, fibre:0 })

  async function openEdit() {
    setGramsStr(String(entry.grams))
    setAdjMode(false)
    if (isBatch && entry.batchId) {
      const { db } = await import('../db/indexedDB.js')
      const batch  = await db.batches.get(entry.batchId)
      if (batch?.ingredients?.length) {
        const batchTotal = batch.ingredients.reduce((s, i) => s + (i.grams || 0), 0)
        const scale      = batchTotal > 0 ? entry.grams / batchTotal : 1
        setAdjIngredients(batch.ingredients.map(i => ({
          ...i,
          gramsInput: String(Math.round(i.grams * scale)),
        })))
      }
    }
    setMode('editing')
  }

  function handleSave() {
    if (adjMode) {
      if (adjTotalGrams <= 0) return
      onEdit({ grams: adjTotalGrams, ...adjMacros })
    } else {
      if (newGrams <= 0) return
      onEdit({ grams: newGrams, ...simplePreview })
    }
    setMode('collapsed')
  }

  const preview = adjMode ? adjMacros : simplePreview
  const previewGrams = adjMode ? adjTotalGrams : newGrams

  if (mode === 'editing') {
    return (
      <div style={{ ...s.entryRow, flexDirection:'column', alignItems:'stretch', gap:'10px' }}>
        <div style={s.entryName}>{entry.name}</div>

        {/* Toggle between grams and ingredient adjust (batch only) */}
        {isBatch && adjIngredients.length > 0 && (
          <div style={{ display:'flex', gap:'6px' }}>
            <button
              style={{ ...s.editBtn, ...((!adjMode) ? { background:'var(--text-primary)', color:'var(--text-inverse)' } : {}) }}
              onClick={() => setAdjMode(false)}
            >Grams</button>
            <button
              style={{ ...s.editBtn, ...(adjMode ? { background:'var(--text-primary)', color:'var(--text-inverse)' } : {}) }}
              onClick={() => setAdjMode(true)}
            >Ingredients</button>
          </div>
        )}

        {adjMode ? (
          <div style={s.adjCard}>
            {adjIngredients.map((ing, i) => (
              <div key={i} style={s.adjRow}>
                <span style={s.adjName}>{ing.name}</span>
                <div style={{ display:'flex', alignItems:'center', gap:'4px', flexShrink:0 }}>
                  <input
                    style={s.gramsInput}
                    type="number"
                    inputMode="decimal"
                    value={ing.gramsInput}
                    onChange={e => setAdjIngredients(prev =>
                      prev.map((x, j) => j === i ? { ...x, gramsInput: e.target.value } : x)
                    )}
                  />
                  <span style={{ fontSize:'12px', color:'var(--text-tertiary)' }}>g</span>
                </div>
              </div>
            ))}
            <div style={{ ...s.adjRow, justifyContent:'space-between', borderBottom:'none' }}>
              <span style={{ fontSize:'11px', color:'var(--text-tertiary)', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.06em' }}>Total</span>
              <span style={{ fontSize:'13px', fontWeight:'600', fontFamily:'var(--font-mono)', color:'var(--text-primary)' }}>{Math.round(adjTotalGrams)}g</span>
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <input
              style={s.gramsInput}
              type="number"
              value={gramsStr}
              onChange={e => setGramsStr(e.target.value)}
              onFocus={e => e.target.select()}
              autoFocus
            />
            <span style={{ fontSize:'13px', color:'var(--text-tertiary)' }}>g</span>
          </div>
        )}

        <div style={s.macroPreview}>
          <span style={s.previewVal}>{preview.calories} kcal</span>
          <span style={s.dot}>·</span>
          <span style={s.previewVal}>{previewGrams > 0 ? `${Math.round(previewGrams)}g` : '—'}</span>
          <span style={s.dot}>·</span>
          <span style={s.previewVal}>{preview.protein}g P</span>
          <span style={s.dot}>·</span>
          <span style={s.previewVal}>{preview.carbs}g C</span>
          <span style={s.dot}>·</span>
          <span style={s.previewVal}>{preview.fat}g F</span>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button style={s.saveBtn} onClick={handleSave}>Save</button>
          <button style={s.cancelBtn} onClick={() => { setMode('collapsed'); setGramsStr(String(entry.grams)) }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.entryRow} onClick={() => setMode(m => m === 'actions' ? 'collapsed' : 'actions')}>
      <div style={s.entryInfo}>
        <div style={s.entryName}>{entry.name}</div>
        {mode !== 'actions' && (
          <div style={s.entryMeta}>{entry.grams}g · {entry.calories} kcal · {entry.protein}g P</div>
        )}
      </div>

      {mode === 'actions' ? (
        <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
          <button style={s.editBtn} onClick={e => { e.stopPropagation(); openEdit() }}>Edit</button>
          <button style={s.deleteBtn} onClick={e => { e.stopPropagation(); onDelete() }}>Remove</button>
        </div>
      ) : (
        <span style={s.entryCalories}>{entry.calories}</span>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  container:    { display:'flex', flexDirection:'column', gap:'8px' },
  tabRow:       { display:'flex', gap:'6px' },
  tab:          { flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', padding:'8px 4px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', cursor:'pointer', minWidth:0 },
  tabActive:    { background:'var(--text-primary)', borderColor:'var(--text-primary)' },
  tabIcon:      { fontSize:'14px', lineHeight:1 },
  tabLabel:     { fontSize:'10px', fontWeight:'600', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap' },
  tabLabelActive:{ color:'var(--text-inverse)' },
  tabKcal:      { fontSize:'10px', fontWeight:'700', color:'var(--accent)', fontFamily:'var(--font-mono)' },
  tabKcalActive:{ color:'rgba(255,255,255,0.75)' },

  card:         { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  cardHeader:   { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderBottom:'0.5px solid var(--border-subtle)' },
  cardTitle:    { fontSize:'14px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.01em' },
  cardKcal:     { fontSize:'13px', fontWeight:'600', color:'var(--text-secondary)', fontFamily:'var(--font-mono)' },

  emptySlot:    { fontSize:'13px', color:'var(--text-tertiary)', padding:'20px 14px', textAlign:'center' },

  mealMacros:   { display:'flex', gap:'10px', padding:'8px 14px', flexWrap:'wrap', borderTop:'0.5px solid var(--border-subtle)' },
  mealMacro:    { fontSize:'12px', fontWeight:'600', fontFamily:'var(--font-mono)' },

  cardFooter:   { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderTop:'0.5px solid var(--border-subtle)' },
  copyBtn:      { background:'none', border:'none', color:'var(--text-tertiary)', fontSize:'12px', cursor:'pointer', padding:0, fontWeight:'500' },
  dayTotal:     { fontSize:'12px', color:'var(--text-secondary)', fontWeight:'600', fontFamily:'var(--font-mono)' },

  entryRow:     { display:'flex', alignItems:'center', padding:'10px 14px', borderTop:'0.5px solid var(--border-subtle)', cursor:'pointer', gap:'8px' },
  entryInfo:    { flex:1, display:'flex', flexDirection:'column', gap:'2px', minWidth:0 },
  entryName:    { fontSize:'14px', fontWeight:'500', color:'var(--text-primary)', letterSpacing:'-0.01em', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  entryMeta:    { fontSize:'12px', color:'var(--text-tertiary)' },
  entryCalories:{ fontSize:'14px', fontWeight:'600', color:'var(--text-secondary)', fontFamily:'var(--font-mono)', flexShrink:0 },

  editBtn:      { padding:'5px 10px', background:'var(--bg-elevated)', border:'none', borderRadius:'var(--r-sm)', color:'var(--text-secondary)', fontSize:'12px', fontWeight:'600', cursor:'pointer' },
  deleteBtn:    { padding:'5px 10px', background:'rgba(200,80,64,0.08)', border:'none', borderRadius:'var(--r-sm)', color:'var(--red)', fontSize:'12px', fontWeight:'600', cursor:'pointer' },

  gramsInput:   { width:'72px', padding:'7px 10px', fontSize:'15px', fontWeight:'600', borderRadius:'var(--r-md)', border:'1px solid var(--border-subtle)', background:'var(--bg-elevated)', color:'var(--text-primary)', outline:'none', fontFamily:'var(--font-mono)', textAlign:'right' },
  macroPreview: { display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' },
  previewVal:   { fontSize:'12px', fontWeight:'600', color:'var(--text-secondary)', fontFamily:'var(--font-mono)' },
  adjCard:      { background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', overflow:'hidden' },
  adjRow:       { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 12px', borderBottom:'0.5px solid var(--border-subtle)', gap:'10px' },
  adjName:      { fontSize:'13px', color:'var(--text-primary)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  dot:          { fontSize:'12px', color:'var(--text-tertiary)' },
  saveBtn:      { padding:'7px 16px', background:'var(--accent)', border:'none', borderRadius:'var(--r-md)', color:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  cancelBtn:    { padding:'7px 12px', background:'var(--bg-elevated)', border:'none', borderRadius:'var(--r-md)', color:'var(--text-tertiary)', fontSize:'13px', fontWeight:'500', cursor:'pointer' },
}
