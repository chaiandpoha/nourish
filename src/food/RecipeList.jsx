import { useState, useEffect, useRef } from 'react'
import { db } from '../db/db.js'
import RecipeBuilder from './RecipeBuilder.jsx'
import { deleteFood, pushLocalFoodsToHousehold } from './FoodDB.js'
import { MACRO_COLORS } from '../config.js'

export default function RecipeList({ householdId }) {
  const [recipes,  setRecipes]  = useState([])
  const [editing,  setEditing]  = useState(null) // null | food object
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(null) // id being confirmed
  const didSync = useRef(false)

  const byNewest = (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')

  async function loadLocal() {
    const local = await db.foods.where('source').equals('recipe').toArray()
    local.sort(byNewest)
    setRecipes(local)
    return local
  }

  async function syncFromCloud(localRecipes) {
    if (!householdId) return
    try {
      const { sbFetchHouseholdFoods } = await import('../db/db.js')
      const remote = await sbFetchHouseholdFoods(householdId)
      const localById = new Map(localRecipes.map(f => [f.id, f]))
      let deletedIds = new Set()
      try { deletedIds = new Set(JSON.parse(localStorage.getItem('nourish_deleted_foods') || '[]')) } catch {}
      const toSave = []
      for (const f of remote) {
        if (deletedIds.has(f.id)) continue  // skip foods this user explicitly deleted
        const isRecipe = f.source === 'recipe' || (Array.isArray(f.ingredients) && f.ingredients.length > 0)
        if (!isRecipe) continue
        const local = localById.get(f.id)
        const remoteHasIng = Array.isArray(f.ingredients) && f.ingredients.length > 0
        if (!local) {
          // In Supabase but not local — restore it (data loss scenario)
          toSave.push({ ...f, source: 'recipe' })
        } else {
          const localHasIng = Array.isArray(local.ingredients) && local.ingredients.length > 0
          if (localHasIng && !remoteHasIng) continue  // local is richer
          if (local.updatedAt && f.updatedAt && local.updatedAt >= f.updatedAt) continue  // local is newer
          toSave.push({ ...f, source: 'recipe' })
        }
      }
      if (toSave.length) {
        await db.foods.bulkPut(toSave)
        await loadLocal()  // refresh display with restored recipes
      }
    } catch {
      // Cloud sync failed — local data already shown
    }
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      const local = await loadLocal()
      if (cancelled) return
      // Background push + pull — doesn't block display
      if (householdId && !didSync.current) {
        didSync.current = true
        pushLocalFoodsToHousehold(householdId).catch(() => {})
      }
      syncFromCloud(local)
    }
    init()
    return () => { cancelled = true }
  }, [householdId])

  async function handleDelete(id) {
    await deleteFood(id, householdId)
    setDeleting(null)
    setRecipes(prev => prev.filter(r => r.id !== id))
  }

  function handleSaved(food) {
    setEditing(null)
    setCreating(false)
    setRecipes(prev => {
      const idx = prev.findIndex(r => r.id === food.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = food
        return next.sort(byNewest)
      }
      return [food, ...prev]
    })
  }

  if (creating) {
    return (
      <RecipeBuilder
        householdId={householdId}
        onSaved={handleSaved}
        onCancel={() => setCreating(false)}
      />
    )
  }

  if (editing) {
    return (
      <RecipeBuilder
        existingFood={editing}
        householdId={householdId}
        onSaved={handleSaved}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div style={s.container}>
      <button style={s.newBtn} onClick={() => setCreating(true)}>+ New Recipe</button>

      {recipes.length === 0 ? (
        <div style={s.empty}>
          <p style={s.emptyTitle}>No recipes yet</p>
          <p style={s.emptySub}>Create a recipe by combining ingredients to track it as a single food</p>
        </div>
      ) : (
        <div style={s.list}>
          {recipes.map(recipe => {
            const srv = recipe.servingSize || 100
            const cal = Math.round((recipe.per100g?.calories || 0) * srv / 100)
            const pro = Math.round((recipe.per100g?.protein  || 0) * srv / 100)
            const crb = Math.round((recipe.per100g?.carbs    || 0) * srv / 100)
            const fat = Math.round((recipe.per100g?.fat      || 0) * srv / 100)
            const ingCount = recipe.ingredients?.length || 0
            const isDeleting = deleting === recipe.id

            return (
              <div key={recipe.id} style={s.card}>
                <div style={s.cardTop}>
                  <div style={s.cardInfo}>
                    <span style={s.cardName}>{recipe.name}</span>
                    <span style={s.cardMeta}>
                      {recipe.servingLabel || `${Math.round(srv)}g`} · {ingCount} ingredient{ingCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={s.cardActions}>
                    {isDeleting ? (
                      <>
                        <button style={s.confirmBtn} onClick={() => handleDelete(recipe.id)}>Delete</button>
                        <button style={s.cancelBtn}  onClick={() => setDeleting(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button style={s.editBtn}   onClick={() => setEditing(recipe)}>Edit</button>
                        <button style={s.deleteBtn} onClick={() => setDeleting(recipe.id)}>✕</button>
                      </>
                    )}
                  </div>
                </div>
                <div style={s.macroRow}>
                  {[
                    { key:'calories', label:'kcal', val: cal },
                    { key:'protein',  label:'P',    val: pro },
                    { key:'carbs',    label:'C',    val: crb },
                    { key:'fat',      label:'F',    val: fat },
                  ].map(({ key, label, val }) => (
                    <div key={key} style={s.macroCell}>
                      <span style={{ ...s.macroVal, color: MACRO_COLORS[key] }}>{val}</span>
                      <span style={s.macroLabel}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: '12px' },
  newBtn:    { padding: '13px', background:'var(--accent)', border: 'none', borderRadius: 'var(--r-lg)', color: 'var(--text-inverse)', fontSize: '15px', fontWeight: '600', cursor: 'pointer', width: '100%' },
  empty:     { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: '6px' },
  emptyTitle:{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 },
  emptySub:  { fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', margin: 0, lineHeight: '1.5', maxWidth: '260px' },
  list:      { display: 'flex', flexDirection: 'column', gap: '8px' },
  card:      { background: 'var(--bg-surface)', border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' },
  cardTop:   { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' },
  cardInfo:  { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 },
  cardName:  { fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardMeta:  { fontSize: '12px', color: 'var(--text-tertiary)' },
  cardActions: { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
  editBtn:   { padding: '5px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  deleteBtn: { width: '28px', height: '28px', background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  confirmBtn:{ padding: '5px 10px', background: 'var(--red)', border: 'none', borderRadius: 'var(--r-md)', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  cancelBtn: { padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  macroRow:  { display: 'flex', gap: '0', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', overflow: 'hidden' },
  macroCell: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '7px 4px', gap: '1px' },
  macroVal:  { fontSize: '14px', fontWeight: '600', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' },
  macroLabel:{ fontSize: '9px', color: 'var(--text-tertiary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' },
}
