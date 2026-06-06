import { useState, useEffect, useRef } from 'react'
import { searchFoods, saveFood, fetchHouseholdFoods } from './FoodDB.js'
import { calcMacros } from './macroCalc.js'
import { generateId } from '../auth/crypto.js'
import { MACRO_COLORS } from '../config.js'

const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

export default function RecipeBuilder({ onSaved, onCancel, existingFood, householdId }) {
  const [name,          setName]          = useState(existingFood?.name || '')
  const [servingLabel,  setServingLabel]  = useState(
    existingFood?.servingLabel ? existingFood.servingLabel.replace(/^\d+g\s*/, '') : ''
  )
  const [ingredients,   setIngredients]   = useState(
    () => (existingFood?.ingredients || []).map(i => ({ ...i, gramsInput: String(i.grams) }))
  )
  const [search,        setSearch]        = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [error,         setError]         = useState('')
  const [saving,        setSaving]        = useState(false)
  const [listening,     setListening]     = useState(false)
  const [voiceHint,     setVoiceHint]     = useState('')
  const recogRef = useRef(null)

  // Pull latest household foods into IndexedDB so scanned labels are searchable
  useEffect(() => {
    if (householdId) fetchHouseholdFoods(householdId).catch(() => {})
  }, [householdId])

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const r = await searchFoods(search, 15)
      setSearchResults(r)
    }, 150)
    return () => clearTimeout(t)
  }, [search])

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recog = new SR()
    recog.lang            = 'en-US'
    recog.interimResults  = true
    recog.maxAlternatives = 1
    recog.continuous      = false
    recogRef.current      = recog

    let captured  = ''
    let processed = false

    const applyResult = (t) => {
      if (processed) return
      processed = true
      const text = t.trim()
      setSearch(text)
      setVoiceHint(`"${text}"`)
    }

    recog.onresult = (e) => {
      let t = ''
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
      captured = t
      if (e.results[e.results.length - 1].isFinal) {
        applyResult(t)
        setListening(false)
      } else {
        setVoiceHint(`Hearing: "${t}"`)
      }
    }
    recog.onerror = () => { setListening(false) }
    recog.onend   = () => { setListening(false); if (captured) applyResult(captured) }

    setListening(true)
    setVoiceHint('')
    recog.start()
  }

  function stopListening() {
    recogRef.current?.abort()
    recogRef.current = null
    setListening(false)
  }

  function addIngredient(food) {
    setIngredients(prev => [
      ...prev,
      { name: food.name, grams: food.servingSize || 100, gramsInput: String(food.servingSize || 100), per100g: food.per100g },
    ])
    setSearch('')
    setSearchResults([])
    setVoiceHint('')
  }

  function removeIngredient(i) {
    setIngredients(prev => prev.filter((_, j) => j !== i))
  }

  function updateGrams(i, val) {
    setIngredients(prev => prev.map((x, j) => j === i ? { ...x, gramsInput: val } : x))
  }

  // Derived totals
  const parsed = ingredients.map(i => ({ ...i, grams: parseFloat(i.gramsInput) || 0 }))
  const totalGrams = parsed.reduce((s, i) => s + i.grams, 0)

  let totalMacros = { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
  for (const ing of parsed) {
    if (!ing.grams || !ing.per100g) continue
    const m = calcMacros({ per100g: ing.per100g }, ing.grams)
    for (const k of Object.keys(totalMacros))
      totalMacros[k] = Math.round(((totalMacros[k] || 0) + (m[k] || 0)) * 10) / 10
  }

  const per100g = totalGrams > 0
    ? Object.fromEntries(Object.entries(totalMacros).map(([k, v]) => [k, Math.round(v / totalGrams * 100 * 10) / 10]))
    : { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }

  async function handleSave() {
    setError('')
    if (!name.trim())          { setError('Enter a recipe name'); return }
    if (ingredients.length < 1){ setError('Add at least one ingredient'); return }
    if (totalGrams <= 0)       { setError('Enter ingredient amounts'); return }
    setSaving(true)
    try {
      const label = servingLabel.trim()
        ? `${Math.round(totalGrams)}g ${servingLabel.trim()}`
        : `${Math.round(totalGrams)}g serving`
      const clean = parsed.map(({ gramsInput, ...rest }) => rest)
      const food  = await saveFood({
        id:           existingFood?.id || generateId(),
        name:         name.trim(),
        source:       'recipe',
        tags:         [],
        ingredients:  clean,
        per100g,
        servingSize:  totalGrams,
        servingLabel: label,
        dirty:        1,
        updatedAt:    new Date().toISOString(),
      }, householdId)
      onSaved(food)
    } catch (e) {
      setError('Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={r.container}>

      {/* Header */}
      <div style={r.header}>
        <button style={r.backBtn} onClick={onCancel}>← Back</button>
        <span style={r.title}>{existingFood ? 'Edit Recipe' : 'New Recipe'}</span>
        <div style={{ width: 60 }} />
      </div>

      {/* Name */}
      <input
        style={r.nameInput}
        placeholder="Recipe name (e.g. Overnight Oats, Chai)"
        value={name}
        onChange={e => setName(e.target.value)}
        autoFocus
      />

      {/* Ingredient search */}
      <div>
        <div style={r.sectionLabel}>Ingredients</div>
        <div style={r.searchRow}>
          <input
            style={r.searchInput}
            placeholder={listening ? 'Listening…' : 'Search food to add…'}
            value={search}
            onChange={e => { setSearch(e.target.value); setVoiceHint('') }}
          />
          {search.length > 0 && !listening && (
            <button style={r.searchIconBtn} onClick={() => { setSearch(''); setSearchResults([]); setVoiceHint('') }}>✕</button>
          )}
          {speechSupported && (
            <button
              style={{ ...r.searchIconBtn, ...(listening ? r.micActive : {}) }}
              onClick={listening ? stopListening : startListening}
              type="button"
            >
              {listening ? '⏹' : '🎤'}
            </button>
          )}
        </div>
        {voiceHint ? (
          <div style={r.voiceHint}>{listening ? voiceHint : voiceHint}</div>
        ) : null}

        {/* Inline results — no absolute positioning so sheet overflow won't clip */}
        {searchResults.length > 0 && (
          <div style={r.resultsList}>
            {searchResults.map(food => (
              <button key={food.id} style={r.dropRow} onClick={() => addIngredient(food)}>
                <div style={r.dropInfo}>
                  <span style={r.dropName}>{food.name}</span>
                  {(food.source === 'scanned' || food.source === 'saved' || food.source === 'recipe') && (
                    <span style={r.dropTag}>{food.source === 'scanned' ? 'Your label' : food.source === 'recipe' ? 'Recipe' : 'Saved'}</span>
                  )}
                </div>
                <span style={r.dropMeta}>{food.per100g?.calories || 0} kcal/100g +</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ingredient list */}
      {ingredients.length > 0 && (
        <div style={r.ingCard}>
          {ingredients.map((ing, i) => (
            <div key={i} style={{ ...r.ingRow, ...(i === ingredients.length - 1 ? { borderBottom: 'none' } : {}) }}>
              <button style={r.removeBtn} onClick={() => removeIngredient(i)}>−</button>
              <span style={r.ingName}>{ing.name}</span>
              <div style={r.ingRight}>
                <input
                  style={r.ingInput}
                  type="number"
                  inputMode="decimal"
                  value={ing.gramsInput}
                  onChange={e => updateGrams(i, e.target.value)}
                />
                <span style={r.ingUnit}>g</span>
              </div>
            </div>
          ))}
          {totalGrams > 0 && (
            <div style={r.totalRow}>
              <span style={r.totalLabel}>Total</span>
              <span style={r.totalVal}>{Math.round(totalGrams)}g</span>
            </div>
          )}
        </div>
      )}

      {/* Macro totals */}
      {totalGrams > 0 && (
        <div style={r.macroGrid}>
          {[
            { key: 'calories', label: 'kcal',    val: totalMacros.calories },
            { key: 'protein',  label: 'Protein', val: totalMacros.protein  },
            { key: 'carbs',    label: 'Carbs',   val: totalMacros.carbs    },
            { key: 'fat',      label: 'Fat',     val: totalMacros.fat      },
            { key: 'fibre',    label: 'Fibre',   val: totalMacros.fibre    },
          ].map(({ key, label, val }) => (
            <div key={key} style={r.macroCell}>
              <span style={{ ...r.macroVal, color: MACRO_COLORS[key] }}>{val}</span>
              <span style={r.macroLabel}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Serving label */}
      <div>
        <div style={r.sectionLabel}>Serving name <span style={{ fontWeight: 400 }}>(optional)</span></div>
        <input
          style={r.nameInput}
          placeholder={`e.g. bowl, jar, cup — total ${Math.round(totalGrams)}g`}
          value={servingLabel}
          onChange={e => setServingLabel(e.target.value)}
        />
      </div>

      {error && <p style={r.error}>{error}</p>}

      <div style={r.actions}>
        <button style={r.cancelBtn} onClick={onCancel}>Cancel</button>
        <button style={r.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : existingFood ? 'Update Recipe' : 'Save Recipe'}
        </button>
      </div>
    </div>
  )
}

const r = {
  container:    { display:'flex', flexDirection:'column', gap:'14px', paddingBottom:'8px' },
  header:       { display:'flex', alignItems:'center', justifyContent:'space-between' },
  backBtn:      { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0, width:60 },
  title:        { fontSize:'17px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  nameInput:    { padding:'12px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'16px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box' },
  sectionLabel: { fontSize:'10px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'6px' },
  searchRow:    { display:'flex', alignItems:'center', gap:'6px' },
  searchInput:  { flex:1, padding:'11px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'15px', color:'var(--text-primary)', outline:'none', minWidth:0 },
  searchIconBtn:{ width:'40px', height:'40px', borderRadius:'var(--r-md)', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)', fontSize:'15px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  micActive:    { background:'var(--accent)', borderColor:'var(--accent)', color:'#fff', animation:'micPulse 1s ease-in-out infinite' },
  voiceHint:    { fontSize:'12px', color:'var(--accent)', marginTop:'4px', paddingLeft:'2px', fontWeight:'500' },
  resultsList:  { marginTop:'6px', background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', overflow:'hidden' },
  dropRow:      { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'11px 14px', background:'transparent', border:'none', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left', gap:'8px' },
  dropInfo:     { display:'flex', flexDirection:'column', gap:'2px', flex:1, minWidth:0 },
  dropName:     { fontSize:'14px', color:'var(--text-primary)', textAlign:'left', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  dropTag:      { fontSize:'11px', color:'var(--accent)', fontWeight:'600' },
  dropMeta:     { fontSize:'12px', color:'var(--accent)', fontWeight:'600', flexShrink:0 },
  ingCard:      { background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', overflow:'hidden' },
  ingRow:       { display:'flex', alignItems:'center', padding:'10px 12px', borderBottom:'0.5px solid var(--border-subtle)', gap:'10px' },
  removeBtn:    { width:'24px', height:'24px', borderRadius:'50%', background:'var(--border-default)', border:'none', color:'var(--text-secondary)', fontSize:'16px', fontWeight:'700', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, lineHeight:1 },
  ingName:      { flex:1, fontSize:'14px', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  ingRight:     { display:'flex', alignItems:'center', gap:'4px', flexShrink:0 },
  ingInput:     { width:'60px', padding:'6px 8px', background:'var(--bg-base)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', outline:'none', textAlign:'right', fontFamily:'var(--font-mono)' },
  ingUnit:      { fontSize:'13px', color:'var(--text-tertiary)', fontWeight:'500' },
  totalRow:     { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg-surface)' },
  totalLabel:   { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em' },
  totalVal:     { fontSize:'13px', fontWeight:'600', color:'var(--text-primary)', fontFamily:'var(--font-mono)' },
  macroGrid:    { display:'grid', gridTemplateColumns:'repeat(5,1fr)', background:'var(--bg-elevated)', borderRadius:'var(--r-lg)', overflow:'hidden' },
  macroCell:    { display:'flex', flexDirection:'column', alignItems:'center', padding:'12px 4px', gap:'3px' },
  macroVal:     { fontSize:'16px', fontWeight:'600', letterSpacing:'-0.02em', fontFamily:'var(--font-mono)' },
  macroLabel:   { fontSize:'10px', color:'var(--text-tertiary)', fontWeight:'500', textTransform:'uppercase', letterSpacing:'0.04em' },
  error:        { fontSize:'13px', color:'var(--red)', margin:0 },
  actions:      { display:'flex', gap:'10px', marginTop:'4px' },
  cancelBtn:    { flex:1, padding:'14px', background:'transparent', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--text-secondary)', fontSize:'15px', fontWeight:'500', cursor:'pointer' },
  saveBtn:      { flex:2, padding:'14px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'15px', fontWeight:'600', cursor:'pointer' },
}
