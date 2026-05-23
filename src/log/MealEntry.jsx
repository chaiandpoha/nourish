import { useState, useEffect } from 'react'
import { searchFoods, getRecentFoods, getActiveBatches, detectMealSlot } from '../food/FoodDB.js'
import { useAuth } from '../auth/useAuth.jsx'
import FoodEntry from '../food/FoodEntry.jsx'
import { addFoodLogEntry } from '../db/db.js'

// ─── MealEntry ────────────────────────────────────────────────────────────────
// Floating + button + bottom sheet for logging food
// Shows: active batches → recent foods → search results

export default function MealEntry({ date, onLogged }) {
  const [open,        setOpen]        = useState(false)
  const [screen,      setScreen]      = useState('list') // list | entry
  const [selected,    setSelected]    = useState(null)   // { food } or { batch }
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState([])
  const [recents,     setRecents]     = useState([])
  const [batches,     setBatches]     = useState([])
  const [meal,        setMeal]        = useState(detectMealSlot())
  const [loading,     setLoading]     = useState(false)
  const { user } = useAuth()

  // Load batches + recents when sheet opens
  useEffect(() => {
    if (!open || !user) return
    setMeal(detectMealSlot())
    Promise.all([
      getActiveBatches(user.id),
      getRecentFoods(user.id),
    ]).then(([b, r]) => {
      setBatches(b)
      setRecents(r)
    })
  }, [open, user])

  // Search as user types
  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const r = await searchFoods(query)
      setResults(r)
      setLoading(false)
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  function openSheet()  { setOpen(true);  setScreen('list'); setQuery(''); setSelected(null) }
  function closeSheet() { setOpen(false); setScreen('list'); setQuery(''); setSelected(null) }

  function selectFood(food) {
    setSelected({ food })
    setScreen('entry')
  }

  function selectBatch(batch) {
    setSelected({ batch })
    setScreen('entry')
  }

  async function handleAdd(entry) {
    if (!user) return
    await addFoodLogEntry(user.id, {
      ...entry,
      date: date || new Date().toISOString().slice(0, 10),
      meal,
    })
    closeSheet()
    onLogged?.()
  }

  const displayList = query.trim()
    ? results
    : recents

  return (
    <>
      {/* Floating + button */}
      <button style={styles.fab} onClick={openSheet}>+</button>

      {/* Overlay */}
      {open && (
        <div style={styles.overlay} onClick={closeSheet} />
      )}

      {/* Bottom sheet */}
      {open && (
        <div style={styles.sheet}>
          <div style={styles.handle} />

          {screen === 'list' && (
            <>
              {/* Meal slot selector */}
              <div style={styles.mealRow}>
                {['breakfast','lunch','dinner','snack'].map(m => (
                  <button
                    key={m}
                    style={{
                      ...styles.mealBtn,
                      ...(meal === m ? styles.mealBtnActive : {})
                    }}
                    onClick={() => setMeal(m)}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div style={styles.searchRow}>
                <input
                  style={styles.searchInput}
                  placeholder="Search foods…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoComplete="off"
                />
                {query.length > 0 && (
                  <button style={styles.clearBtn} onClick={() => setQuery('')}>✕</button>
                )}
              </div>

              {/* Active batches — shown when not searching */}
              {!query.trim() && batches.length > 0 && (
                <div style={styles.section}>
                  <div style={styles.sectionLabel}>Active Batches</div>
                  {batches.map(batch => (
                    <button
                      key={batch.id}
                      style={styles.foodRow}
                      onClick={() => selectBatch(batch)}
                    >
                      <div style={styles.foodInfo}>
                        <div style={styles.foodName}>{batch.name}</div>
                        <div style={styles.foodMeta}>
                          {batch.macrosPer100g?.calories || 0} kcal ·{' '}
                          {batch.macrosPer100g?.protein  || 0}g P per 100g
                          {batch.shared && (
                            <span style={styles.sharedTag}> · Shared</span>
                          )}
                        </div>
                      </div>
                      <span style={styles.chevron}>›</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Recent / search results */}
              <div style={styles.section}>
                <div style={styles.sectionLabel}>
                  {query.trim()
                    ? loading ? 'Searching…' : `${results.length} results`
                    : 'Recent Foods'
                  }
                </div>

                {displayList.length === 0 && !loading && (
                  <div style={styles.empty}>
                    {query.trim()
                      ? 'No foods found — try scanning a label'
                      : 'No recent foods yet'
                    }
                  </div>
                )}

                {displayList.map(food => (
                  <button
                    key={food.id}
                    style={styles.foodRow}
                    onClick={() => selectFood(food)}
                  >
                    <div style={styles.foodInfo}>
                      <div style={styles.foodName}>{food.name}</div>
                      <div style={styles.foodMeta}>
                        {food.per100g?.calories || 0} kcal ·{' '}
                        {food.per100g?.protein  || 0}g P per 100g
                        <span style={styles.sourceTag}>
                          {' '}· {food.source === 'nin' ? 'Indian' : food.source}
                        </span>
                      </div>
                    </div>
                    <span style={styles.chevron}>›</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {screen === 'entry' && selected && (
            <FoodEntry
              food={selected.food}
              batch={selected.batch}
              onAdd={handleAdd}
              onCancel={() => setScreen('list')}
            />
          )}
        </div>
      )}
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  fab: {
    position:        'fixed',
    bottom:          '96px',
    right:           '20px',
    width:           '56px',
    height:          '56px',
    borderRadius:    '50%',
    background:      'var(--text-primary)',
    color:           'var(--text-inverse)',
    fontSize:        '28px',
    fontWeight:      '300',
    border:          'none',
    cursor:          'pointer',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    boxShadow:       '0 4px 16px rgba(28,24,20,0.18)',
    zIndex:          90,
    lineHeight:      '1',
  },
  overlay: {
    position:        'fixed',
    inset:           0,
    background:      'rgba(28,24,20,0.35)',
    zIndex:          150,
    backdropFilter:  'blur(2px)',
  },
  sheet: {
    position:        'fixed',
    bottom:          0,
    left:            0,
    right:           0,
    background:      'var(--bg-surface)',
    borderRadius:    '22px 22px 0 0',
    borderTop:       '0.5px solid var(--border-subtle)',
    padding:         '12px 16px calc(16px + env(safe-area-inset-bottom))',
    zIndex:          151,
    maxHeight:       '88dvh',
    overflowY:       'auto',
    animation:       'sheetUp 0.3s cubic-bezier(0.16,1,0.3,1) both',
  },
  handle: {
    width:           '32px',
    height:          '3px',
    background:      'var(--border-strong)',
    borderRadius:    '99px',
    margin:          '0 auto 16px',
  },
  mealRow: {
    display:         'flex',
    gap:             '6px',
    marginBottom:    '14px',
  },
  mealBtn: {
    flex:            1,
    padding:         '8px 4px',
    background:      'var(--bg-elevated)',
    border:          '0.5px solid var(--border-subtle)',
    borderRadius:    'var(--r-md)',
    fontSize:        '12px',
    fontWeight:      '500',
    color:           'var(--text-secondary)',
    cursor:          'pointer',
  },
  mealBtnActive: {
    background:      'var(--text-primary)',
    color:           'var(--text-inverse)',
    borderColor:     'var(--text-primary)',
  },
  searchRow: {
    display:         'flex',
    alignItems:      'center',
    gap:             '8px',
    marginBottom:    '16px',
    position:        'relative',
  },
  searchInput: {
    flex:            1,
    padding:         '11px 14px',
    background:      'var(--bg-elevated)',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-md)',
    fontSize:        '15px',
    color:           'var(--text-primary)',
    outline:         'none',
  },
  clearBtn: {
    position:        'absolute',
    right:           '10px',
    background:      'none',
    border:          'none',
    color:           'var(--text-tertiary)',
    fontSize:        '14px',
    cursor:          'pointer',
    padding:         '4px',
  },
  section: {
    marginBottom:    '8px',
  },
  sectionLabel: {
    fontSize:        '10px',
    fontWeight:      '700',
    color:           'var(--text-tertiary)',
    textTransform:   'uppercase',
    letterSpacing:   '0.08em',
    marginBottom:    '6px',
    paddingLeft:     '2px',
  },
  foodRow: {
    display:         'flex',
    alignItems:      'center',
    width:           '100%',
    padding:         '11px 12px',
    background:      'transparent',
    border:          'none',
    borderBottom:    '0.5px solid var(--border-subtle)',
    cursor:          'pointer',
    textAlign:       'left',
    gap:             '8px',
  },
  foodInfo: {
    flex:            1,
    display:         'flex',
    flexDirection:   'column',
    gap:             '2px',
  },
  foodName: {
    fontSize:        '14px',
    fontWeight:      '500',
    color:           'var(--text-primary)',
    letterSpacing:   '-0.01em',
  },
  foodMeta: {
    fontSize:        '12px',
    color:           'var(--text-tertiary)',
  },
  sharedTag: {
    color:           'var(--accent)',
    fontWeight:      '600',
  },
  sourceTag: {
    color:           'var(--text-tertiary)',
    textTransform:   'capitalize',
  },
  chevron: {
    fontSize:        '20px',
    color:           'var(--text-tertiary)',
    flexShrink:      0,
    lineHeight:      '1',
  },
  empty: {
    fontSize:        '13px',
    color:           'var(--text-tertiary)',
    textAlign:       'center',
    padding:         '24px 0',
  },
}