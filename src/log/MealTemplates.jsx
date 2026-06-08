import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { addFoodLogEntry } from '../db/db.js'
import { generateId } from '../auth/crypto.js'
import { sumMacros } from '../food/macroCalc.js'
import { localDate } from './DayLog.jsx'

// ─── MealTemplates ────────────────────────────────────────────────────────────
// Save and log meal templates — e.g. "Usual Breakfast"
// Templates are per-user, stored in IndexedDB + synced to Drive

export default function MealTemplates({ date, meal, onLogged, onClose }) {
  const [templates, setTemplates] = useState([])
  const [screen,    setScreen]    = useState('list') // list | create | log
  const [selected,  setSelected]  = useState(null)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    db.mealTemplates
      .where('userId').equals(user.id)
      .toArray()
      .then(setTemplates)
  }, [user])

  async function handleLogTemplate(template) {
    if (!user) return
    const today = date || localDate()
    for (const entry of template.entries) {
      await addFoodLogEntry(user.id, { ...entry, date: today, meal })
    }
    onLogged?.()
    onClose?.()
  }

  async function handleDelete(id) {
    await db.mealTemplates.delete(id)
    setTemplates(t => t.filter(x => x.id !== id))
  }

  if (screen === 'create') {
    return (
      <CreateTemplate
        userId={user?.id}
        onSave={t => {
          setTemplates(prev => [...prev, t])
          setScreen('list')
        }}
        onCancel={() => setScreen('list')}
      />
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Templates</span>
        <button style={styles.createBtn} onClick={() => setScreen('create')}>
          + New
        </button>
      </div>

      {templates.length === 0 && (
        <div style={styles.empty}>
          <p style={styles.emptyText}>No templates yet</p>
          <p style={styles.emptySub}>
            Save your usual meals as templates to log them in one tap
          </p>
        </div>
      )}

      {templates.map(t => {
        const totals = sumMacros(t.entries || [])
        return (
          <div key={t.id} style={styles.card}>
            <button
              style={styles.cardMain}
              onClick={() => handleLogTemplate(t)}
            >
              <div style={styles.cardName}>{t.name}</div>
              <div style={styles.cardMeta}>
                {t.entries?.length || 0} items ·{' '}
                {totals.calories} kcal · {totals.protein}g P
              </div>
              <div style={styles.cardItems}>
                {(t.entries || []).slice(0, 3).map((e, i) => (
                  <span key={i} style={styles.cardItem}>
                    {e.name} {e.grams}g
                    {i < Math.min(2, (t.entries?.length || 1) - 1) ? ' · ' : ''}
                  </span>
                ))}
                {(t.entries?.length || 0) > 3 && (
                  <span style={styles.cardItem}>
                    +{t.entries.length - 3} more
                  </span>
                )}
              </div>
            </button>
            <button
              style={styles.deleteBtn}
              onClick={() => handleDelete(t.id)}
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── CreateTemplate ───────────────────────────────────────────────────────────

function CreateTemplate({ userId, onSave, onCancel }) {
  const [name,    setName]    = useState('')
  const [entries, setEntries] = useState([])
  const [search,  setSearch]  = useState('')
  const [results, setResults] = useState([])
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      const { searchFoods } = await import('../food/FoodDB.js')
      const r = await searchFoods(search, 10)
      setResults(r)
    }, 200)
    return () => clearTimeout(t)
  }, [search])

  function addEntry(food) {
    setEntries(e => [...e, {
      foodId: food.id,
      name:   food.name,
      grams:  food.servingSize || 100,
      calories: (food.per100g?.calories || 0) * (food.servingSize || 100) / 100,
      protein:  (food.per100g?.protein  || 0) * (food.servingSize || 100) / 100,
      carbs:    (food.per100g?.carbs    || 0) * (food.servingSize || 100) / 100,
      fat:      (food.per100g?.fat      || 0) * (food.servingSize || 100) / 100,
      fibre:    (food.per100g?.fibre    || 0) * (food.servingSize || 100) / 100,
    }])
    setSearch('')
    setResults([])
  }

  function updateGrams(index, grams) {
    setEntries(prev => prev.map((e, i) => {
      if (i !== index) return e
      const g = parseFloat(grams) || 0
      const food = { per100g: { calories: e.calories / (e.grams/100), protein: e.protein / (e.grams/100), carbs: e.carbs / (e.grams/100), fat: e.fat / (e.grams/100), fibre: e.fibre / (e.grams/100) } }
      return {
        ...e,
        grams:    g,
        calories: (food.per100g.calories || 0) * g / 100,
        protein:  (food.per100g.protein  || 0) * g / 100,
        carbs:    (food.per100g.carbs    || 0) * g / 100,
        fat:      (food.per100g.fat      || 0) * g / 100,
        fibre:    (food.per100g.fibre    || 0) * g / 100,
      }
    }))
  }

  function removeEntry(index) {
    setEntries(e => e.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name your template'); return }
    if (!entries.length) { setError('Add at least one food'); return }

    const template = {
      id:        generateId(),
      userId,
      name:      name.trim(),
      entries,
      dirty:     1,
      updatedAt: new Date().toISOString(),
    }
    await db.mealTemplates.put(template)
    onSave(template)
  }

  const totals = sumMacros(entries)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>New Template</span>
        <button style={styles.ghostSmall} onClick={onCancel}>Cancel</button>
      </div>

      <input
        style={styles.nameInput}
        placeholder="Template name e.g. Usual Breakfast"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />

      {/* Added entries */}
      {entries.map((entry, i) => (
        <div key={i} style={styles.entryRow}>
          <div style={styles.entryName}>{entry.name}</div>
          <input
            style={styles.gramsInput}
            type="number"
            inputMode="decimal"
            value={entry.grams}
            onChange={e => updateGrams(i, e.target.value)}
          />
          <span style={styles.entryUnit}>g</span>
          <button style={styles.removeBtn} onClick={() => removeEntry(i)}>✕</button>
        </div>
      ))}

      {entries.length > 0 && (
        <div style={styles.totalRow}>
          {totals.calories} kcal · {totals.protein}g P · {totals.carbs}g C · {totals.fat}g F
        </div>
      )}

      {/* Food search */}
      <input
        style={styles.searchInput}
        placeholder="Add a food…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {results.map(food => (
        <button
          key={food.id}
          style={styles.resultRow}
          onClick={() => addEntry(food)}
        >
          <span style={styles.resultName}>{food.name}</span>
          <span style={styles.resultMeta}>
            {food.per100g?.calories}kcal / 100g
          </span>
        </button>
      ))}

      {error && <p style={styles.error}>{error}</p>}

      <button style={styles.saveBtn} onClick={handleSave}>
        Save Template
      </button>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },
  header: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginBottom:    '4px',
  },
  title: {
    fontSize:        '16px',
    fontWeight:      '600',
    color:           'var(--text-primary)',
    letterSpacing:   '-0.02em',
  },
  createBtn: {
    padding:         '6px 12px',
    background:      'var(--accent-dim)',
    border:          'none',
    borderRadius:    'var(--r-md)',
    color:           'var(--accent)',
    fontSize:        '13px',
    fontWeight:      '600',
    cursor:          'pointer',
  },
  ghostSmall: {
    padding:         '6px 12px',
    background:      'transparent',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-md)',
    color:           'var(--text-secondary)',
    fontSize:        '13px',
    cursor:          'pointer',
  },
  empty: {
    textAlign:       'center',
    padding:         '24px 0',
  },
  emptyText: {
    fontSize:        '15px',
    color:           'var(--text-secondary)',
    marginBottom:    '4px',
  },
  emptySub: {
    fontSize:        '13px',
    color:           'var(--text-tertiary)',
  },
  card: {
    display:         'flex',
    alignItems:      'stretch',
    background:      'var(--bg-elevated)',
    border:          '0.5px solid var(--border-subtle)',
    borderRadius:    'var(--r-lg)',
    overflow:        'hidden',
  },
  cardMain: {
    flex:            1,
    padding:         '12px 14px',
    background:      'transparent',
    border:          'none',
    textAlign:       'left',
    cursor:          'pointer',
    display:         'flex',
    flexDirection:   'column',
    gap:             '3px',
  },
  cardName: {
    fontSize:        '15px',
    fontWeight:      '600',
    color:           'var(--text-primary)',
    letterSpacing:   '-0.01em',
  },
  cardMeta: {
    fontSize:        '12px',
    color:           'var(--text-secondary)',
  },
  cardItems: {
    fontSize:        '12px',
    color:           'var(--text-tertiary)',
    marginTop:       '2px',
  },
  cardItem: {
    display:         'inline',
  },
  deleteBtn: {
    padding:         '0 14px',
    background:      'transparent',
    border:          'none',
    borderLeft:      '0.5px solid var(--border-subtle)',
    color:           'var(--text-tertiary)',
    fontSize:        '14px',
    cursor:          'pointer',
  },
  nameInput: {
    width:           '100%',
    padding:         '12px 14px',
    background:      'var(--bg-elevated)',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-md)',
    fontSize:        '15px',
    color:           'var(--text-primary)',
    outline:         'none',
    boxSizing:       'border-box',
  },
  entryRow: {
    display:         'flex',
    alignItems:      'center',
    gap:             '8px',
    padding:         '8px 0',
    borderBottom:    '0.5px solid var(--border-subtle)',
  },
  entryName: {
    flex:            1,
    fontSize:        '14px',
    color:           'var(--text-primary)',
  },
  gramsInput: {
    width:           '64px',
    padding:         '6px 8px',
    background:      'var(--bg-elevated)',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-sm)',
    fontSize:        '14px',
    color:           'var(--text-primary)',
    outline:         'none',
    textAlign:       'right',
  },
  entryUnit: {
    fontSize:        '13px',
    color:           'var(--text-tertiary)',
  },
  removeBtn: {
    background:      'none',
    border:          'none',
    color:           'var(--text-tertiary)',
    fontSize:        '14px',
    cursor:          'pointer',
    padding:         '4px',
  },
  totalRow: {
    fontSize:        '13px',
    color:           'var(--accent)',
    fontWeight:      '600',
    textAlign:       'right',
    padding:         '4px 0',
  },
  searchInput: {
    width:           '100%',
    padding:         '11px 14px',
    background:      'var(--bg-elevated)',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-md)',
    fontSize:        '15px',
    color:           'var(--text-primary)',
    outline:         'none',
    boxSizing:       'border-box',
  },
  resultRow: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    width:           '100%',
    padding:         '10px 12px',
    background:      'transparent',
    border:          'none',
    borderBottom:    '0.5px solid var(--border-subtle)',
    cursor:          'pointer',
    textAlign:       'left',
  },
  resultName: {
    fontSize:        '14px',
    color:           'var(--text-primary)',
  },
  resultMeta: {
    fontSize:        '12px',
    color:           'var(--text-tertiary)',
  },
  error: {
    fontSize:        '13px',
    color:           'var(--red)',
    margin:          0,
  },
  saveBtn: {
    width:           '100%',
    padding:         '14px',
    background:      'var(--text-primary)',
    border:          'none',
    borderRadius:    'var(--r-lg)',
    color:           'var(--text-inverse)',
    fontSize:        '15px',
    fontWeight:      '600',
    cursor:          'pointer',
    marginTop:       '4px',
  },
}