import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { searchFoods, seedFoodDatabase } from '../food/FoodDB.js'
import { calcBatchMacrosPer100g } from './batchCalc.js'
import { sbSaveBatch } from '../db/supabase.js'
import { generateId } from '../auth/crypto.js'
import { toGrams, WEIGHT_UNITS } from '../food/macroCalc.js'

export default function BatchBuilder({ onSave, onCancel }) {
  const [name,         setName]         = useState('')
  const [shared,       setShared]       = useState(true)
  const [ingredients,  setIngredients]  = useState([])
  const [yieldGrams,   setYieldGrams]   = useState('')
  const [query,        setQuery]        = useState('')
  const [results,      setResults]      = useState([])
  const [pending,      setPending]      = useState(null)
  const [pendingG,     setPendingG]     = useState('')
  const [pendingError, setPendingError] = useState('')
  const [errors,       setErrors]       = useState([])
  const [saving,       setSaving]       = useState(false)
  const [showManual,   setShowManual]   = useState(false)
  const [manualError,  setManualError]  = useState('')
  const [manual,       setManual]       = useState({ name:'', grams:'', calories:'', protein:'', carbs:'', fat:'', fibre:'' })
  const [seeded,       setSeeded]       = useState(false)
  const [pendingUnit,  setPendingUnit]  = useState('g')
  const [pendingMode,  setPendingMode]  = useState('servings') // 'servings' | 'grams'
  const [manualUnit,   setManualUnit]   = useState('g')
  const [yieldUnit,    setYieldUnit]    = useState('g')
  const pendingRef  = useRef(null)
  const searchRef   = useRef(null)
  const { user } = useAuth()

  // Seed food database — idempotent, returns immediately if already seeded
  useEffect(() => {
    seedFoodDatabase().then(() => setSeeded(true))
  }, [])

  useEffect(() => {
    if (!query.trim() || !seeded) { setResults([]); return }
    const t = setTimeout(async () => {
      const r = await searchFoods(query, 6)
      setResults(r)
    }, 200)
    return () => clearTimeout(t)
  }, [query, seeded])

  useEffect(() => {
    if (pending) {
      const hasServing = !!pending.servingSize
      setPendingMode(hasServing ? 'servings' : 'grams')
      setPendingG(hasServing ? '1' : String(pending.servingSize || 100))
      setPendingError('')
      setTimeout(() => pendingRef.current?.focus(), 100)
    }
  }, [pending])

  const totalMacros = ingredients.reduce((acc, ing) => ({
    calories: acc.calories + (ing.per100g?.calories || 0) * ing.grams / 100,
    protein:  acc.protein  + (ing.per100g?.protein  || 0) * ing.grams / 100,
    carbs:    acc.carbs    + (ing.per100g?.carbs    || 0) * ing.grams / 100,
    fat:      acc.fat      + (ing.per100g?.fat      || 0) * ing.grams / 100,
    fibre:    acc.fibre    + (ing.per100g?.fibre    || 0) * ing.grams / 100,
  }), { calories:0, protein:0, carbs:0, fat:0, fibre:0 })

  const totalRawWeight = ingredients.reduce((s, i) => s + i.grams, 0)
  const yieldG         = toGrams(parseFloat(yieldGrams) || 0, yieldUnit)
  const per100g        = yieldG > 0 ? calcBatchMacrosPer100g(
    ingredients.map(i => ({ food: { per100g: i.per100g }, grams: i.grams })),
    yieldG
  ) : null

  function r1(n) { return Math.round(n * 10) / 10 }

  function selectFood(food) {
    setPending(food)
    setQuery('')
    setResults([])
  }

  function confirmIngredient() {
    const raw = parseFloat(pendingG)
    if (!raw || raw <= 0) { setPendingError('Enter a valid amount'); return }
    const grams = pendingMode === 'servings'
      ? raw * (pending.servingSize || 100)
      : toGrams(raw, pendingUnit)
    setIngredients(prev => [...prev, {
      id:      generateId(),
      name:    pending.name,
      grams,
      per100g: pending.per100g,
    }])
    setPending(null)
    setPendingG('')
    setPendingError('')
    setPendingUnit('g')
    setPendingMode('servings')
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function confirmManual() {
    const raw = parseFloat(manual.grams)
    if (!manual.name.trim()) { setManualError('Enter an ingredient name'); return }
    if (!raw || raw <= 0)    { setManualError('Enter a valid weight'); return }
    const grams  = toGrams(raw, manualUnit)
    // User entered total macros for their amount — normalise to per100g for batch calc
    const factor = grams > 0 ? 100 / grams : 1
    const r1 = n => Math.round((parseFloat(n) || 0) * factor * 10) / 10
    setIngredients(prev => [...prev, {
      id:    generateId(),
      name:  manual.name.trim(),
      grams,
      per100g: {
        calories: r1(manual.calories),
        protein:  r1(manual.protein),
        carbs:    r1(manual.carbs),
        fat:      r1(manual.fat),
        fibre:    r1(manual.fibre),
      }
    }])
    setManual({ name:'', grams:'', calories:'', protein:'', carbs:'', fat:'', fibre:'' })
    setManualError('')
    setManualUnit('g')
    setShowManual(false)
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function updateGrams(id, grams) {
    setIngredients(prev => prev.map(i => i.id === id ? { ...i, grams: parseFloat(grams) || 0 } : i))
  }

  function removeIngredient(id) {
    setIngredients(prev => prev.filter(i => i.id !== id))
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
        id:            generateId(),
        name:          name.trim(),
        createdBy:     user.email || user.id,
        shared:        shared ? 1 : 0,
        closed:        0,
        ingredients:   ingredients.map(i => ({ name: i.name, grams: i.grams, per100g: i.per100g })),
        yieldGrams:    yieldG,
        macrosPer100g: per100g,
        householdId:   user.householdId || null,
        createdAt:     new Date().toISOString(),
        updatedAt:     new Date().toISOString(),
        dirty:         0,
      }
      // Write to Supabase (source of truth) + local cache
      await sbSaveBatch(batch, user.email, user.householdId)
      await db.batches.put(batch)
      onSave?.(batch)
    } catch (e) {
      setErrors([e.message])
      return
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
    { key:'calories', label:'kcal' },
    { key:'protein',  label:'P(g)' },
    { key:'carbs',    label:'C(g)' },
    { key:'fat',      label:'F(g)' },
    { key:'fibre',    label:'Fi(g)'},
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'14px', padding:'0 0 8px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={onCancel} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0 }}>← Back</button>
        <span style={{ fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' }}>New Batch</span>
        <div style={{ width:60 }} />
      </div>

      {/* Name */}
      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
        <label style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Batch name</label>
        <input style={inp} placeholder="e.g. Dal Tadka, Chicken Curry" value={name} onChange={e => setName(e.target.value)} />
      </div>

      {/* Shared toggle */}
      <button
        onClick={() => setShared(v => !v)}
        style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 14px', background: shared ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: shared ? '1px solid var(--accent)' : '1px solid var(--border-default)', borderRadius:'var(--r-lg)', cursor:'pointer', width:'100%', textAlign:'left', fontSize:'20px' }}
      >
        <span>{shared ? '👥' : '🔒'}</span>
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'2px' }}>
          <span style={{ fontSize:'14px', fontWeight:'600', color:'var(--text-primary)' }}>{shared ? 'Shared with household' : 'Personal batch'}</span>
          <span style={{ fontSize:'12px', color:'var(--text-secondary)' }}>{shared ? 'All profiles can log from this' : 'Only visible to you'}</span>
        </div>
        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background: shared ? 'var(--accent)' : 'var(--border-strong)' }} />
      </button>

      {/* Ingredients section */}
      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <label style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
            Ingredients {ingredients.length > 0 && <span style={{ color:'var(--accent)' }}>{ingredients.length} added</span>}
          </label>
        </div>

        {/* Added list */}
        {ingredients.length > 0 && (
          <div style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', overflow:'hidden' }}>
            {ingredients.map(ing => (
              <div key={ing.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 14px', borderBottom:'0.5px solid var(--border-subtle)' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'14px', fontWeight:'500', color:'var(--text-primary)' }}>{ing.name}</div>
                  <div style={{ fontSize:'11px', color:'var(--text-tertiary)' }}>
                    {r1((ing.per100g?.calories||0)*ing.grams/100)} kcal · {r1((ing.per100g?.protein||0)*ing.grams/100)}g P
                  </div>
                </div>
                <input
                  type="number" inputMode="decimal" value={ing.grams}
                  onChange={e => updateGrams(ing.id, e.target.value)}
                  style={{ width:'64px', padding:'6px 8px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'14px', color:'var(--text-primary)', outline:'none', textAlign:'right' }}
                />
                <span style={{ fontSize:'13px', color:'var(--text-tertiary)' }}>g</span>
                <button onClick={() => removeIngredient(ing.id)} style={{ background:'none', border:'none', color:'var(--text-tertiary)', fontSize:'14px', cursor:'pointer', padding:'4px' }}>✕</button>
              </div>
            ))}
            <div style={{ fontSize:'12px', color:'var(--text-tertiary)', textAlign:'right', padding:'8px 14px' }}>
              Raw total: {totalRawWeight}g
            </div>
          </div>
        )}

        {/* Pending from search */}
        {pending && !showManual && (
          <div style={{ background:'var(--accent-dim)', border:'1px solid var(--accent)', borderRadius:'var(--r-lg)', padding:'12px 14px', display:'flex', flexDirection:'column', gap:'8px' }}>
            <div style={{ fontSize:'15px', fontWeight:'600', color:'var(--text-primary)' }}>{pending.name}</div>
            <div style={{ fontSize:'12px', color:'var(--text-secondary)' }}>{pending.per100g?.calories} kcal per 100g</div>
            {/* Mode toggle — only for foods with servingSize */}
            {pending.servingSize && (
              <div style={{ display:'flex', gap:'4px' }}>
                {['servings','grams'].map(m => (
                  <button key={m} type="button" onClick={() => setPendingMode(m)}
                    style={{ padding:'4px 12px', background: pendingMode === m ? 'var(--text-primary)' : 'var(--bg-elevated)', border:`1px solid ${pendingMode === m ? 'var(--text-primary)' : 'var(--border-default)'}`, borderRadius:'var(--r-full)', fontSize:'12px', fontWeight:'600', color: pendingMode === m ? 'var(--text-inverse)' : 'var(--text-secondary)', cursor:'pointer', textTransform:'capitalize' }}
                  >{m}</button>
                ))}
              </div>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
              <input
                ref={pendingRef}
                type="number" inputMode="decimal" placeholder={pendingMode === 'servings' ? '1' : 'amount'}
                value={pendingG} onChange={e => { setPendingG(e.target.value); setPendingError('') }}
                onKeyDown={e => e.key === 'Enter' && confirmIngredient()}
                style={{ flex:1, minWidth:'80px', padding:'10px 12px', background:'var(--bg-surface)', border:`1px solid ${pendingError ? 'var(--red)' : 'var(--border-default)'}`, borderRadius:'var(--r-md)', fontSize:'18px', fontWeight:'300', color:'var(--text-primary)', outline:'none' }}
              />
              {pendingMode === 'servings' ? (
                <span style={{ fontSize:'13px', color:'var(--text-secondary)', fontWeight:'500' }}>
                  {pending.servingLabel ? pending.servingLabel.replace(/^[\d.]+\s+/, '') : 'serving'}
                  {' · '}{Math.round((parseFloat(pendingG)||0) * (pending.servingSize||100))}g
                </span>
              ) : (
                WEIGHT_UNITS.map(u => (
                  <button key={u} type="button" onClick={() => setPendingUnit(u)}
                    style={{ padding:'6px 8px', background: pendingUnit === u ? 'var(--text-primary)' : 'var(--bg-elevated)', border:`1px solid ${pendingUnit === u ? 'var(--text-primary)' : 'var(--border-default)'}`, borderRadius:'var(--r-sm)', color: pendingUnit === u ? 'var(--text-inverse)' : 'var(--text-secondary)', fontSize:'12px', fontWeight:'600', cursor:'pointer' }}
                  >{u}</button>
                ))
              )}
              <button onClick={confirmIngredient} style={{ padding:'10px 16px', background:'var(--accent)', border:'none', borderRadius:'var(--r-md)', color:'#fff', fontSize:'14px', fontWeight:'600', cursor:'pointer' }}>Add</button>
              <button onClick={() => { setPending(null); setPendingError(''); setPendingUnit('g'); setPendingMode('servings') }} style={{ padding:'10px 10px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'14px', cursor:'pointer' }}>✕</button>
            </div>
            {pendingError && <div style={{ fontSize:'12px', color:'var(--red)' }}>{pendingError}</div>}
          </div>
        )}

        {/* Manual entry form */}
        {showManual && (
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', padding:'14px', display:'flex', flexDirection:'column', gap:'10px' }}>
            <div style={{ fontSize:'14px', fontWeight:'600', color:'var(--text-primary)' }}>Add ingredient manually</div>
            <input style={inp} placeholder="Ingredient name" value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))} />
            <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
              <input
                style={{ ...inp, flex:1, minWidth:'80px' }}
                type="number" inputMode="decimal" placeholder="Raw weight"
                value={manual.grams} onChange={e => { setManual(m => ({ ...m, grams: e.target.value })); setManualError('') }}
              />
              {WEIGHT_UNITS.map(u => (
                <button key={u} type="button" onClick={() => setManualUnit(u)}
                  style={{ padding:'6px 8px', background: manualUnit === u ? 'var(--text-primary)' : 'var(--bg-elevated)', border:`1px solid ${manualUnit === u ? 'var(--text-primary)' : 'var(--border-default)'}`, borderRadius:'var(--r-sm)', color: manualUnit === u ? 'var(--text-inverse)' : 'var(--text-secondary)', fontSize:'12px', fontWeight:'600', cursor:'pointer' }}
                >{u}</button>
              ))}
            </div>
            <div style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
              Macros for {manual.grams || '?'}{manualUnit}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'6px' }}>
              {macroFields.map(({ key, label }) => (
                <div key={key} style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
                  <label style={{ fontSize:'10px', color:'var(--text-tertiary)', textAlign:'center' }}>{label}</label>
                  <input
                    type="number" inputMode="decimal" placeholder="0"
                    value={manual[key]} onChange={e => setManual(m => ({ ...m, [key]: e.target.value }))}
                    style={{ padding:'8px 6px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-sm)', fontSize:'14px', color:'var(--text-primary)', outline:'none', textAlign:'center', width:'100%', boxSizing:'border-box' }}
                  />
                </div>
              ))}
            </div>
            {manualError && <div style={{ fontSize:'12px', color:'var(--red)' }}>{manualError}</div>}
            <div style={{ display:'flex', gap:'8px' }}>
              <button onClick={() => { setShowManual(false); setManualError('') }} style={{ flex:1, padding:'11px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'14px', cursor:'pointer' }}>Cancel</button>
              <button onClick={confirmManual} style={{ flex:2, padding:'11px', background:'var(--accent)', border:'none', borderRadius:'var(--r-md)', color:'#fff', fontSize:'14px', fontWeight:'600', cursor:'pointer' }}>Add Ingredient</button>
            </div>
          </div>
        )}

        {/* Search + manual buttons */}
        {!pending && !showManual && (
          <>
            <input
              ref={searchRef}
              style={inp}
              placeholder={seeded ? "Search ingredient…" : "Loading foods…"}
              value={query}
              onChange={e => setQuery(e.target.value)}
              disabled={!seeded}
            />
            {results.map(food => (
              <button key={food.id} onClick={() => selectFood(food)}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'10px 12px', background:'transparent', border:'none', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left' }}>
                <span style={{ fontSize:'14px', color:'var(--text-primary)' }}>{food.name}</span>
                <span style={{ fontSize:'12px', color:'var(--text-tertiary)' }}>{food.per100g?.calories} kcal/100g</span>
              </button>
            ))}
            <button onClick={() => setShowManual(true)}
              style={{ padding:'10px 14px', background:'var(--bg-elevated)', border:'1px dashed var(--border-strong)', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'13px', fontWeight:'500', cursor:'pointer', textAlign:'left' }}>
              + Add ingredient manually (enter macros)
            </button>
          </>
        )}
      </div>

      {/* Running total */}
      {ingredients.length > 0 && (
        <div style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', padding:'14px' }}>
          <div style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'10px' }}>Total raw macros</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)' }}>
            {[
              { label:'kcal', val:r1(totalMacros.calories), color:'var(--text-primary)' },
              { label:'P',    val:r1(totalMacros.protein),  color:'var(--macro-protein)' },
              { label:'C',    val:r1(totalMacros.carbs),    color:'var(--macro-carbs)' },
              { label:'F',    val:r1(totalMacros.fat),      color:'var(--macro-fat)' },
              { label:'Fi',   val:r1(totalMacros.fibre),    color:'var(--macro-fibre)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
                <span style={{ fontSize:'16px', fontWeight:'700', fontFamily:'var(--font-mono)', letterSpacing:'-0.02em', color }}>{val}</span>
                <span style={{ fontSize:'10px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Yield */}
      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
        <label style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Cooked yield weight</label>
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

      {/* Per 100g summary */}
      {per100g && (
        <div style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'12px' }}>
          <span style={{ fontSize:'14px', fontWeight:'700', color:'var(--text-primary)' }}>Batch summary</span>

          <div style={{ display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>Total batch ({yieldG}g)</span>
            <span style={{ fontSize:'13px', fontWeight:'600', color:'var(--text-primary)', fontFamily:'var(--font-mono)' }}>
              {r1(totalMacros.calories)} kcal · {r1(totalMacros.protein)}g P
            </span>
          </div>

          <div style={{ height:'0.5px', background:'var(--border-subtle)' }} />

          <div style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Per 100g</div>
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

          <div style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Example portions</div>
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

      <button
        onClick={handleSave} disabled={saving}
        style={{ width:'100%', padding:'15px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'16px', fontWeight:'600', cursor:'pointer', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Saving…' : 'Save Batch'}
      </button>

      <div style={{ height:24 }} />
    </div>
  )
}
