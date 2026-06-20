import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { searchFoods, seedFoodDatabase } from '../food/FoodDB.js'
import { calcBatchMacrosPer100g } from './batchCalc.js'
import { sbSaveBatch } from '../db/supabase.js'
import { generateId } from '../auth/crypto.js'
import { toGrams, WEIGHT_UNITS } from '../food/macroCalc.js'
import LabelScanner from '../food/LabelScanner.jsx'

export default function BatchBuilder({ onSave, onCancel, existingBatch }) {
  const [name,        setName]        = useState(existingBatch?.name || '')
  const [shared,      setShared]      = useState(existingBatch ? !!existingBatch.shared : true)
  const [ingredients, setIngredients] = useState(
    () => (existingBatch?.ingredients || []).map(i => ({ ...i, id: generateId(), grams: i.grams }))
  )
  const [yieldGrams,  setYieldGrams]  = useState(existingBatch?.yieldGrams ? String(existingBatch.yieldGrams) : '')
  const [yieldUnit,   setYieldUnit]   = useState('g')
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState([])
  const [errors,      setErrors]      = useState([])
  const [saving,      setSaving]      = useState(false)
  const [showManual,    setShowManual]    = useState(false)
  const [manualError,   setManualError]   = useState('')
  const [manual,        setManual]        = useState({ name:'', grams:'', calories:'', protein:'', carbs:'', fat:'', fibre:'' })
  const [manualUnit,    setManualUnit]    = useState('g')
  const [manualMode,    setManualMode]    = useState('weight')  // 'weight' | 'servings'
  const [servingSize,   setServingSize]   = useState('')        // g per serving
  const [servingCount,  setServingCount]  = useState('')        // how many servings used
  const [showScanner,   setShowScanner]   = useState(false)
  const [seeded,      setSeeded]      = useState(false)
  const [ownBatches,  setOwnBatches]  = useState([])
  const searchRef = useRef(null)
  const { user } = useAuth()

  useEffect(() => { seedFoodDatabase().then(() => setSeeded(true)) }, [])

  useEffect(() => {
    db.batches.where('closed').equals(0).toArray().then(all => {
      setOwnBatches(all.filter(b =>
        b.macrosPer100g &&
        (b.userId === user?.id ||
         (user?.householdId && b.householdId === user?.householdId))
      ).sort((a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
      ))
    })
  }, [user?.id, user?.householdId])

  useEffect(() => {
    if (!query.trim() || !seeded) { setResults([]); return }
    const t = setTimeout(async () => setResults(await searchFoods(query, 8)), 200)
    return () => clearTimeout(t)
  }, [query, seeded])

  const totalMacros = ingredients.reduce((acc, ing) => ({
    calories: acc.calories + (ing.per100g?.calories || 0) * ing.grams / 100,
    protein:  acc.protein  + (ing.per100g?.protein  || 0) * ing.grams / 100,
    carbs:    acc.carbs    + (ing.per100g?.carbs    || 0) * ing.grams / 100,
    fat:      acc.fat      + (ing.per100g?.fat      || 0) * ing.grams / 100,
    fibre:    acc.fibre    + (ing.per100g?.fibre    || 0) * ing.grams / 100,
  }), { calories:0, protein:0, carbs:0, fat:0, fibre:0 })

  const totalRawWeight = ingredients.reduce((s, i) => s + i.grams, 0)
  const yieldG = toGrams(parseFloat(yieldGrams) || 0, yieldUnit)
  const per100g = yieldG > 0 ? calcBatchMacrosPer100g(
    ingredients.map(i => ({ food: { per100g: i.per100g }, grams: i.grams })),
    yieldG
  ) : null

  function r1(n) { return Math.round(n * 10) / 10 }

  // Tap any food or batch → added immediately at default grams, no confirm step
  function addFood(food) {
    // Prevent duplicate ingredients from rapid double-taps
    if (ingredients.some(i => i.name === food.name && i.per100g === food.per100g)) return
    const defaultGrams = food.servingSize || 100
    setIngredients(prev => [...prev, {
      id:      generateId(),
      name:    food.name,
      grams:   defaultGrams,
      per100g: food.per100g,
    }])
    setQuery('')
    setResults([])
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function updateGrams(id, val) {
    setIngredients(prev => prev.map(i => i.id === id ? { ...i, grams: parseFloat(val) || 0 } : i))
  }

  function removeIngredient(id) {
    setIngredients(prev => prev.filter(i => i.id !== id))
  }

  function confirmManual() {
    if (!manual.name.trim()) { setManualError('Enter an ingredient name'); return }

    let grams, per100g
    if (manualMode === 'servings') {
      const sSize  = parseFloat(servingSize)
      const sCount = parseFloat(servingCount)
      if (!sSize || sSize <= 0)   { setManualError('Enter a valid serving size'); return }
      if (!sCount || sCount <= 0) { setManualError('Enter number of servings'); return }
      grams = sSize * sCount
      // macros entered per serving → normalize to per 100g
      const factor = sSize > 0 ? 100 / sSize : 1
      const m = n => Math.round((parseFloat(n) || 0) * factor * 10) / 10
      per100g = { calories: m(manual.calories), protein: m(manual.protein), carbs: m(manual.carbs), fat: m(manual.fat), fibre: m(manual.fibre) }
    } else {
      const raw = parseFloat(manual.grams)
      if (!raw || raw <= 0) { setManualError('Enter a valid weight'); return }
      grams = toGrams(raw, manualUnit)
      const factor = grams > 0 ? 100 / grams : 1
      const m = n => Math.round((parseFloat(n) || 0) * factor * 10) / 10
      per100g = { calories: m(manual.calories), protein: m(manual.protein), carbs: m(manual.carbs), fat: m(manual.fat), fibre: m(manual.fibre) }
    }

    setIngredients(prev => [...prev, { id: generateId(), name: manual.name.trim(), grams, per100g }])
    setManual({ name:'', grams:'', calories:'', protein:'', carbs:'', fat:'', fibre:'' })
    setManualError('')
    setManualUnit('g')
    setManualMode('weight')
    setServingSize('')
    setServingCount('')
    setShowManual(false)
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  // Called when LabelScanner returns a scanned food — add directly as ingredient
  function handleScanned(food) {
    setShowScanner(false)
    addFood(food)
  }

  async function handleSave() {
    const errs = []
    if (!name.trim())        errs.push('Give your batch a name')
    if (!ingredients.length) errs.push('Add at least one ingredient')
    if (!yieldG)             errs.push('Enter the cooked yield weight')
    if (errs.length) { setErrors(errs); return }
    setSaving(true)
    try {
      const batch = {
        ...(existingBatch || {}),
        id:            existingBatch?.id || generateId(),
        name:          name.trim(),
        userId:        user.id,
        createdBy:     user.email || user.id,
        shared:        shared ? 1 : 0,
        closed:        0,
        ingredients:   ingredients.map(i => ({ name: i.name, grams: i.grams, per100g: i.per100g })),
        yieldGrams:    yieldG,
        macrosPer100g: per100g,
        householdId:   user.householdId || null,
        createdAt:     existingBatch?.createdAt || new Date().toISOString(),
        updatedAt:     new Date().toISOString(),
        dirty:         1,
      }
      // Save locally first — always works offline
      await db.batches.put(batch)
      onSave?.(batch)
      // Household users: sync immediately to shared Supabase table
      // Solo users: dirty=1 will be flushed by the background sync cycle
      if (user.householdId) {
        sbSaveBatch(batch, user.email, user.householdId)
          .then(() => db.batches.update(batch.id, { dirty: 0 }))
          .catch(e => console.warn('Batch sync failed:', e.message))
      }
    } catch (e) {
      setErrors([e.message])
    } finally {
      setSaving(false)
    }
  }

  const inp = {
    padding: '11px 14px', background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)',
    fontSize: '15px', color: 'var(--text-primary)', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  }

  const macroFields = [
    { key:'calories', label:'kcal' }, { key:'protein', label:'P(g)' },
    { key:'carbs', label:'C(g)' },   { key:'fat', label:'F(g)' },
    { key:'fibre', label:'Fi(g)' },
  ]

  const matchingBatches = ownBatches.filter(b =>
    !query.trim() || b.name.toLowerCase().includes(query.toLowerCase())
  )

  // Show scanner as a full-screen overlay within the builder
  if (showScanner) {
    return (
      <LabelScanner
        userId={user?.id}
        mode="ingredient"
        onSaved={handleScanned}
        onCancel={() => setShowScanner(false)}
      />
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'14px', padding:'0 0 8px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={onCancel} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0 }}>← Back</button>
        <span style={{ fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' }}>{existingBatch ? 'Edit Batch' : 'New Batch'}</span>
        <div style={{ width:60 }} />
      </div>

      {/* Name */}
      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
        <label style={lbl}>Batch name</label>
        <input style={inp} placeholder="e.g. Dal Tadka, Chicken Curry" value={name} onChange={e => setName(e.target.value)} />
      </div>

      {/* Shared toggle */}
      <button onClick={() => setShared(v => !v)} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 14px', background: shared ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: shared ? '1px solid var(--accent)' : '1px solid var(--border-default)', borderRadius:'var(--r-lg)', cursor:'pointer', width:'100%', textAlign:'left' }}>
        <span style={{ fontSize:'20px' }}>{shared ? '👥' : '🔒'}</span>
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'2px' }}>
          <span style={{ fontSize:'14px', fontWeight:'600', color:'var(--text-primary)' }}>{shared ? 'Shared with household' : 'Personal batch'}</span>
          <span style={{ fontSize:'12px', color:'var(--text-secondary)' }}>{shared ? 'All profiles can log from this' : 'Only visible to you'}</span>
        </div>
        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background: shared ? 'var(--accent)' : 'var(--border-strong)', flexShrink:0 }} />
      </button>

      {/* ── INGREDIENTS CARD ─────────────────────────────────────── */}
      <div style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' }}>

        {/* Card header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'0.5px solid var(--border-subtle)' }}>
          <span style={lbl}>Ingredients</span>
          {ingredients.length > 0 && (
            <span style={{ fontSize:'12px', color:'var(--text-tertiary)' }}>{ingredients.length} items · {Math.round(totalRawWeight)}g raw</span>
          )}
        </div>

        {/* Added ingredient rows */}
        {ingredients.map(ing => (
          <div key={ing.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 16px', borderBottom:'0.5px solid var(--border-subtle)' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:'14px', fontWeight:'500', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ing.name}</div>
              <div style={{ fontSize:'11px', color:'var(--text-tertiary)', marginTop:'1px' }}>
                {r1((ing.per100g?.calories||0)*ing.grams/100)} kcal · {r1((ing.per100g?.protein||0)*ing.grams/100)}g P
              </div>
            </div>
            <input
              type="number" inputMode="decimal" value={ing.grams}
              onChange={e => updateGrams(ing.id, e.target.value)}
              style={{ width:'72px', padding:'8px 10px', background:'var(--bg-base)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'16px', fontWeight:'600', fontFamily:'var(--font-mono)', color:'var(--text-primary)', outline:'none', textAlign:'right', flexShrink:0 }}
            />
            <span style={{ fontSize:'13px', color:'var(--text-tertiary)', flexShrink:0 }}>g</span>
            <button onClick={() => removeIngredient(ing.id)} style={{ background:'none', border:'none', color:'var(--text-tertiary)', fontSize:'20px', cursor:'pointer', padding:'2px 4px', lineHeight:1, flexShrink:0 }}>×</button>
          </div>
        ))}

        {/* Running macro totals — visible while building */}
        {ingredients.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', padding:'10px 16px', borderBottom:'0.5px solid var(--border-subtle)', background:'var(--bg-elevated)' }}>
            {[
              { label:'kcal', val:r1(totalMacros.calories), color:'var(--text-primary)' },
              { label:'P',    val:r1(totalMacros.protein),  color:'var(--macro-protein)' },
              { label:'C',    val:r1(totalMacros.carbs),    color:'var(--macro-carbs)' },
              { label:'F',    val:r1(totalMacros.fat),      color:'var(--macro-fat)' },
              { label:'Fi',   val:r1(totalMacros.fibre),    color:'var(--macro-fibre)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' }}>
                <span style={{ fontSize:'14px', fontWeight:'700', fontFamily:'var(--font-mono)', letterSpacing:'-0.02em', color }}>{val}</span>
                <span style={{ fontSize:'9px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── PICKER ───────────────────────────────────────────────── */}
        <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>

          {/* My Batches chips — shown first so no typing needed */}
          {matchingBatches.length > 0 && !showManual && (
            <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              <span style={lbl}>My Batches</span>
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                {matchingBatches.map(b => (
                  <button key={b.id}
                    onClick={() => addFood({ id: b.id, name: b.name, per100g: b.macrosPer100g })}
                    style={{ padding:'7px 12px', background:'var(--accent-dim)', border:'1px solid var(--accent)', borderRadius:'var(--r-full)', fontSize:'13px', fontWeight:'600', color:'var(--accent)', cursor:'pointer', fontStyle:'italic', fontFamily:'var(--font-serif)', whiteSpace:'nowrap' }}>
                    + {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search box + results */}
          {!showManual && (
            <>
              <input
                ref={searchRef}
                style={inp}
                placeholder={seeded ? 'Search ingredient (dal, chicken, paneer…)' : 'Loading foods…'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                disabled={!seeded}
              />
              {results.length > 0 && (
                <div style={{ background:'var(--bg-base)', borderRadius:'var(--r-md)', border:'0.5px solid var(--border-subtle)', overflow:'hidden' }}>
                  {results.map(food => (
                    <button key={food.id} onClick={() => addFood(food)}
                      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'11px 14px', background:'transparent', border:'none', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left', gap:'8px' }}>
                      <span style={{ fontSize:'14px', color:'var(--text-primary)', flex:1 }}>{food.name}</span>
                      <span style={{ fontSize:'12px', color:'var(--text-tertiary)', flexShrink:0 }}>{food.per100g?.calories} kcal/100g</span>
                      <span style={{ fontSize:'20px', color:'var(--accent)', fontWeight:'700', flexShrink:0, lineHeight:1 }}>+</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Scan label button — always visible */}
          {!showManual && (
            <button onClick={() => setShowScanner(true)}
              style={{ display:'flex', alignItems:'center', gap:'8px', padding:'11px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--text-primary)', fontSize:'14px', fontWeight:'600', cursor:'pointer' }}>
              <span style={{ fontSize:'18px' }}>📷</span>
              Scan nutrition label
            </button>
          )}

          {/* Manual entry with weight or servings mode */}
          {showManual ? (
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              <span style={{ fontSize:'13px', fontWeight:'600', color:'var(--text-primary)' }}>Add manually</span>
              <input style={inp} placeholder="Ingredient name" value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))} />

              {/* Mode toggle */}
              <div style={{ display:'flex', gap:'4px' }}>
                {[['weight','By total weight'],['servings','By servings']].map(([m, label]) => (
                  <button key={m} type="button" onClick={() => { setManualMode(m); setManualError('') }}
                    style={{ flex:1, padding:'8px 6px', background: manualMode === m ? 'var(--text-primary)' : 'var(--bg-elevated)', border:`1px solid ${manualMode === m ? 'var(--text-primary)' : 'var(--border-default)'}`, borderRadius:'var(--r-md)', fontSize:'12px', fontWeight:'600', color: manualMode === m ? 'var(--text-inverse)' : 'var(--text-secondary)', cursor:'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>

              {manualMode === 'weight' ? (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
                    <input style={{ ...inp, flex:1, minWidth:'80px' }} type="number" inputMode="decimal" placeholder="Total weight used"
                      value={manual.grams} onChange={e => { setManual(m => ({ ...m, grams: e.target.value })); setManualError('') }} />
                    {WEIGHT_UNITS.map(u => (
                      <button key={u} type="button" onClick={() => setManualUnit(u)}
                        style={{ padding:'6px 8px', background: manualUnit === u ? 'var(--text-primary)' : 'var(--bg-elevated)', border:`1px solid ${manualUnit === u ? 'var(--text-primary)' : 'var(--border-default)'}`, borderRadius:'var(--r-sm)', color: manualUnit === u ? 'var(--text-inverse)' : 'var(--text-secondary)', fontSize:'12px', fontWeight:'600', cursor:'pointer' }}
                      >{u}</button>
                    ))}
                  </div>
                  <span style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Macros for {manual.grams || '?'}{manualUnit}</span>
                </>
              ) : (
                <>
                  <div style={{ display:'flex', gap:'8px' }}>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'4px' }}>
                      <span style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Serving size (g)</span>
                      <input style={inp} type="number" inputMode="decimal" placeholder="e.g. 30"
                        value={servingSize} onChange={e => { setServingSize(e.target.value); setManualError('') }} />
                    </div>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'4px' }}>
                      <span style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Servings used</span>
                      <input style={inp} type="number" inputMode="decimal" placeholder="e.g. 3"
                        value={servingCount} onChange={e => { setServingCount(e.target.value); setManualError('') }} />
                    </div>
                  </div>
                  {servingSize && servingCount && (
                    <div style={{ fontSize:'12px', color:'var(--accent)', fontWeight:'600' }}>
                      = {Math.round(parseFloat(servingSize) * parseFloat(servingCount))}g total
                    </div>
                  )}
                  <span style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Macros per serving ({servingSize || '?'}g)</span>
                </>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'6px' }}>
                {macroFields.map(({ key, label }) => (
                  <div key={key} style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                    <label style={{ fontSize:'10px', color:'var(--text-tertiary)', textAlign:'center' }}>{label}</label>
                    <input type="number" inputMode="decimal" placeholder="0" value={manual[key]}
                      onChange={e => setManual(m => ({ ...m, [key]: e.target.value }))}
                      style={{ padding:'8px 6px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'14px', color:'var(--text-primary)', outline:'none', textAlign:'center', width:'100%', boxSizing:'border-box' }} />
                  </div>
                ))}
              </div>
              {manualError && <div style={{ fontSize:'12px', color:'var(--red)' }}>{manualError}</div>}
              <div style={{ display:'flex', gap:'8px' }}>
                <button onClick={() => { setShowManual(false); setManualError(''); setManualMode('weight') }}
                  style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'14px', cursor:'pointer' }}>Cancel</button>
                <button onClick={confirmManual}
                  style={{ flex:2, padding:'11px', background:'var(--accent)', border:'none', borderRadius:'var(--r-md)', color:'#fff', fontSize:'14px', fontWeight:'600', cursor:'pointer' }}>Add Ingredient</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowManual(true)}
              style={{ padding:'10px 14px', background:'transparent', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-md)', color:'var(--text-tertiary)', fontSize:'13px', cursor:'pointer', textAlign:'left' }}>
              + Can't find it? Enter macros manually
            </button>
          )}
        </div>
      </div>

      {/* Yield */}
      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
        <label style={lbl}>Cooked yield weight</label>
        <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
          <input style={{ ...inp, flex:1, minWidth:'80px' }} type="number" inputMode="decimal" placeholder="e.g. 800" value={yieldGrams} onChange={e => setYieldGrams(e.target.value)} />
          {WEIGHT_UNITS.map(u => (
            <button key={u} type="button" onClick={() => setYieldUnit(u)}
              style={{ padding:'6px 8px', background: yieldUnit === u ? 'var(--text-primary)' : 'var(--bg-elevated)', border:`1px solid ${yieldUnit === u ? 'var(--text-primary)' : 'var(--border-default)'}`, borderRadius:'var(--r-sm)', color: yieldUnit === u ? 'var(--text-inverse)' : 'var(--text-secondary)', fontSize:'12px', fontWeight:'600', cursor:'pointer' }}
            >{u}</button>
          ))}
        </div>
        <p style={{ fontSize:'12px', color:'var(--text-tertiary)', margin:0 }}>Weigh the finished dish after cooking</p>
      </div>

      {/* Batch summary */}
      {per100g && (
        <div style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'12px' }}>
          <span style={{ fontSize:'14px', fontWeight:'700', color:'var(--text-primary)' }}>Batch summary</span>
          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>Total batch ({yieldG}g)</span>
            <span style={{ fontSize:'13px', fontWeight:'600', color:'var(--text-primary)', fontFamily:'var(--font-mono)' }}>{r1(totalMacros.calories)} kcal · {r1(totalMacros.protein)}g P</span>
          </div>
          <div style={{ height:'0.5px', background:'var(--border-subtle)' }} />
          <span style={lbl}>Per 100g</span>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)' }}>
            {[
              { label:'kcal', val:per100g.calories, color:'var(--text-primary)' },
              { label:'P',    val:per100g.protein,  color:'var(--macro-protein)' },
              { label:'C',    val:per100g.carbs,    color:'var(--macro-carbs)' },
              { label:'F',    val:per100g.fat,      color:'var(--macro-fat)' },
              { label:'Fi',   val:per100g.fibre,    color:'var(--macro-fibre)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
                <span style={{ fontSize:'16px', fontWeight:'700', fontFamily:'var(--font-mono)', letterSpacing:'-0.02em', color }}>{val}</span>
                <span style={{ fontSize:'10px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ height:'0.5px', background:'var(--border-subtle)' }} />
          <span style={lbl}>Example portions</span>
          {[150,200,250,300].map(g => (
            <div key={g} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'6px 0', borderBottom:'0.5px solid var(--border-subtle)' }}>
              <span style={{ fontSize:'13px', fontWeight:'600', color:'var(--text-primary)', fontFamily:'var(--font-mono)', width:'40px', flexShrink:0 }}>{g}g</span>
              <span style={{ fontSize:'12px', color:'var(--text-secondary)' }}>
                {r1(per100g.calories*g/100)} kcal · {r1(per100g.protein*g/100)}g P · {r1(per100g.carbs*g/100)}g C · {r1(per100g.fat*g/100)}g F
              </span>
            </div>
          ))}
        </div>
      )}

      {errors.map((e,i) => (
        <div key={i} style={{ fontSize:'13px', color:'var(--red)', background:'rgba(200,80,64,0.08)', padding:'10px 12px', borderRadius:'var(--r-md)' }}>{e}</div>
      ))}

      <button onClick={handleSave} disabled={saving}
        style={{ width:'100%', padding:'15px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'16px', fontWeight:'600', cursor:'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : existingBatch ? 'Update Batch' : 'Save Batch'}
      </button>

      <div style={{ height:24 }} />
    </div>
  )
}

const lbl = { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' }
