import { useState, useEffect, useRef } from "react"
import { searchFoods, getRecentFoods, getActiveBatches, seedFoodDatabase, saveFood } from "../food/FoodDB.js"
import { useAuth } from "../auth/useAuth.jsx"
import { addFoodLogEntry } from "../db/db.js"
import { calcMacros, calcBatchMacros, toGrams, WEIGHT_UNITS } from "../food/macroCalc.js"
import LabelScanner from "../food/LabelScanner.jsx"
import BarcodeScanner from "../food/BarcodeScanner.jsx"
import RecipeBuilder from "../food/RecipeBuilder.jsx"
import ManualFoodCreator from "../food/ManualFoodCreator.jsx"
import { MACRO_COLORS } from "../config.js"
import { localDate, readMealPref, timeSlot } from "./DayLog.jsx"

// ─── Speech recognition support ──────────────────────────────────────────────
const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

// ─── Voice input parser ───────────────────────────────────────────────────────
const _WORD_NUMS = {
  half: 0.5, quarter: 0.25, a: 1, an: 1,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}
const _UNIT_MAP = {
  g: 'g', gram: 'g', grams: 'g',
  ml: 'ml', milliliter: 'ml', millilitre: 'ml', milliliters: 'ml', millilitres: 'ml',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
}

function parseVoiceInput(text) {
  const t = text.toLowerCase().trim()

  // "[number] [unit] [food]" — with or without space between number and unit
  // e.g. "150 grams chicken breast", "100g oats", "300 ml milk"
  const m1 = t.match(/^(\d+(?:\.\d+)?)\s*(millilitres?|milliliters?|grams?|ounces?|pounds?|lbs?|oz|ml|g)\s+(.+)$/i)
  if (m1) {
    return {
      qty:      parseFloat(m1[1]),
      unit:     _UNIT_MAP[m1[2].toLowerCase()] || 'g',
      foodName: m1[3].trim(),
    }
  }

  // "[number] [food]" — no unit, default to g
  // e.g. "200 chicken breast", "50 almonds"
  const m2 = t.match(/^(\d+(?:\.\d+)?)\s+(.+)$/)
  if (m2) {
    return { qty: parseFloat(m2[1]), unit: 'g', foodName: m2[2].trim() }
  }

  // "[word number] [unit?] [food]"
  // e.g. "two eggs", "three ounces salmon"
  const words = t.split(/\s+/)
  const wn = _WORD_NUMS[words[0]]
  if (wn !== undefined && words.length >= 2) {
    const possUnit = _UNIT_MAP[words[1]]
    if (possUnit && words.length >= 3) {
      return { qty: wn, unit: possUnit, foodName: words.slice(2).join(' ') }
    }
    return { qty: wn, unit: 'g', foodName: words.slice(1).join(' ') }
  }

  // No quantity — entire utterance is the food name
  return { qty: null, unit: 'g', foodName: t }
}

export default function MealEntry({ date, onLogged, inline = false }) {
  const [open,       setOpen]       = useState(false)
  const [screen,     setScreen]     = useState("list") // list | entry | scan | barcode | recipe | create
  const [selected,   setSelected]   = useState(null)
  const [query,      setQuery]      = useState("")
  const [results,    setResults]    = useState([])
  const [recents,    setRecents]    = useState([])
  const [batches,    setBatches]    = useState([])
  const [recipes,    setRecipes]    = useState([])
  const [meal,       setMeal]       = useState(readMealPref() || timeSlot())
  const [seeded,     setSeeded]     = useState(false)
  const [seedFailed, setSeedFailed] = useState(false)
  const [listening,  setListening]  = useState(false)
  const [voiceHint,  setVoiceHint]  = useState('')
  const [voiceQty,   setVoiceQty]   = useState(null)
  const [voiceUnit,  setVoiceUnit]  = useState('g')
  const recogRef  = useRef(null)
  const sheetRef  = useRef(null)
  const dragRef   = useRef({ startY: 0, lastY: 0, lastT: 0, dy: 0, vel: 0, active: false })
  const closeRef  = useRef(null)
  const { user } = useAuth()

  // Seed food database once; retry once on failure
  useEffect(() => {
    seedFoodDatabase().then(ok => {
      if (ok) {
        setSeeded(true)
      } else {
        setSeedFailed(true)
        // Retry after 3s in case of transient fetch failure
        setTimeout(() => {
          seedFoodDatabase().then(ok2 => {
            if (ok2) { setSeeded(true); setSeedFailed(false) }
          })
        }, 3000)
      }
    })
  }, [])

  // Load recents + batches when sheet opens; pick up active tab from DayLog
  useEffect(() => {
    if (!open || !user) return
    setMeal(readMealPref() || timeSlot())
    Promise.all([
      getActiveBatches(user.id),
      getRecentFoods(user.id),
      import('../db/indexedDB.js').then(({ db }) => db.foods.where('source').equals('recipe').toArray()),
    ]).then(([b, r, rec]) => {
      setBatches(b)
      setRecents(r)
      setRecipes(rec.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')))
    })
    // Sync household foods with Supabase each time the sheet opens
    if (user.householdId) {
      import('../food/FoodDB.js').then(({ fetchHouseholdFoods, pushLocalFoodsToHousehold }) => {
        fetchHouseholdFoods(user.householdId).catch(e => console.error('fetch household foods:', e))
        pushLocalFoodsToHousehold(user.householdId).catch(e => console.error('push household foods:', e))
      })
    }
  }, [open, user])

  // Search as user types — support "2 eggs" / "100g chicken" style queries
  useEffect(() => {
    if (!query.trim() || !seeded) { setResults([]); return }
    const parsed = parseVoiceInput(query)
    const searchTerm = parsed.qty ? parsed.foodName : query
    if (!searchTerm.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      const r = await searchFoods(searchTerm, 20)
      setResults(r)
    }, 150)
    return () => clearTimeout(t)
  }, [query, seeded])

  // Lock body scroll while sheet is open — prevents iOS Safari from scrolling
  // the background when the keyboard appears, which makes the sheet jump
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top      = `-${scrollY}px`
    document.body.style.width    = '100%'
    return () => {
      document.body.style.position = ''
      document.body.style.top      = ''
      document.body.style.width    = ''
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // Keep closeRef current so gesture handlers always call the latest version
  closeRef.current = closeSheet

  // Swipe-down-to-dismiss — non-passive touchmove so we can preventDefault
  // Only activates when sheet is scrolled to the top (avoids conflicting with
  // internal scroll) and the user drags downward.
  useEffect(() => {
    if (!open) return
    const sheet = sheetRef.current
    if (!sheet) return

    function onStart(e) {
      const d = dragRef.current
      d.startY     = e.touches[0].clientY
      d.lastY      = d.startY
      d.lastT      = Date.now()
      d.dy         = 0
      d.vel        = 0
      d.active     = false
      // Allow drag from handle zone (top 48px) even when sheet is scrolled
      d.fromHandle = (d.startY - sheet.getBoundingClientRect().top) < 48
    }

    function onMove(e) {
      const d  = dragRef.current
      const dy = e.touches[0].clientY - d.startY
      if (dy <= 0) return                                   // never drag upward
      if (!d.fromHandle && sheet.scrollTop > 0) return     // scrolled — let sheet scroll

      const now = Date.now()
      const dt  = now - d.lastT
      d.vel     = dt > 0 ? (e.touches[0].clientY - d.lastY) / dt : d.vel
      d.lastY   = e.touches[0].clientY
      d.lastT   = now
      d.dy      = dy
      d.active  = true

      e.preventDefault()  // stop sheet from scrolling while we handle gesture
      sheet.style.transition = 'none'
      sheet.style.transform  = `translateY(${dy}px)`
    }

    function onEnd() {
      const d = dragRef.current
      if (!d.active) return
      d.active = false
      // Dismiss if dragged far enough OR flicked fast enough
      if (d.dy > 120 || (d.dy > 40 && d.vel > 0.5)) {
        sheet.style.transition = 'transform 0.25s ease'
        sheet.style.transform  = 'translateY(100%)'
        setTimeout(() => closeRef.current?.(), 230)
      } else {
        sheet.style.transition = 'transform 0.35s cubic-bezier(0.16,1,0.3,1)'
        sheet.style.transform  = 'translateY(0)'
      }
    }

    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove',  onMove,  { passive: false })
    sheet.addEventListener('touchend',   onEnd,   { passive: true })
    sheet.addEventListener('touchcancel',onEnd,   { passive: true })

    return () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove',  onMove)
      sheet.removeEventListener('touchend',   onEnd)
      sheet.removeEventListener('touchcancel',onEnd)
    }
  }, [open])

  function openSheet() {
    setOpen(true)
    setScreen("list")
    setQuery("")
    setSelected(null)
    setVoiceQty(null)
    setVoiceHint('')
  }

  function closeSheet() {
    recogRef.current?.abort()
    recogRef.current = null
    setListening(false)
    setOpen(false)
    setScreen("list")
    setQuery("")
    setSelected(null)
    setVoiceQty(null)
    setVoiceHint('')
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR || !seeded) return

    const recog = new SR()
    recog.lang             = 'en-US'
    recog.interimResults   = true  // needed on iOS — final result may not fire
    recog.maxAlternatives  = 1
    recog.continuous       = false
    recogRef.current       = recog

    let captured  = ''
    let processed = false

    const applyResult = (transcript) => {
      if (processed) return
      processed = true
      const { qty, unit, foodName } = parseVoiceInput(transcript)
      setQuery(foodName)
      if (qty) {
        setVoiceQty(qty)
        setVoiceUnit(unit)
        setVoiceHint(`${qty}${unit} · "${foodName}"`)
      } else {
        setVoiceQty(null)
        setVoiceHint(`"${foodName}"`)
      }
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

    recog.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setVoiceHint('Microphone access denied — check Settings › Safari › Microphone')
      } else if (e.error === 'no-speech') {
        setVoiceHint('No speech detected — tap 🎤 to try again')
      } else if (e.error !== 'aborted') {
        setVoiceHint('Voice error — tap 🎤 to try again')
      }
      setListening(false)
    }

    // iOS fallback: onend fires but onresult may not have fired isFinal
    recog.onend = () => {
      setListening(false)
      if (captured) applyResult(captured)
    }

    setListening(true)
    setVoiceHint('')
    recog.start()
  }

  function stopListening() {
    recogRef.current?.abort()
    recogRef.current = null
    setListening(false)
  }

  function selectItem(food, batch) {
    setSelected({ food, batch })
    setScreen("entry")
  }

  async function handleAdd(entry) {
    if (!user) return
    await addFoodLogEntry(user.id, {
      ...entry,
      date: date || localDate(),
      meal,
    })
    closeSheet()
    onLogged?.()
  }

  const displayList = query.trim() ? results : recents

  return (
    <>
      {/* Trigger: FAB (global) or inline button (past-day view) */}
      {inline
        ? <button style={s.inlineAddBtn} onClick={openSheet}>+ Add food</button>
        : <button style={s.fab} onClick={openSheet}>+</button>
      }

      {/* Overlay */}
      {open && <div style={s.overlay} onClick={closeSheet} />}

      {/* Bottom sheet */}
      {open && (
        <div ref={sheetRef} style={s.sheet}>
          <div style={s.handle} />

          {/* List screen */}
          {screen === "list" && (
            <>
              {/* Meal selector */}
              <div style={s.mealRow}>
                {["breakfast","lunch","dinner","snack"].map(m => (
                  <button
                    key={m}
                    style={{ ...s.mealBtn, ...(meal === m ? s.mealBtnActive : {}) }}
                    onClick={() => setMeal(m)}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div style={s.searchRow}>
                <input
                  style={s.searchInput}
                  placeholder={
                    listening ? "Listening…" :
                    !seeded   ? (seedFailed ? "Food database unavailable" : "Loading foods…") :
                    "Search or type '2 eggs', '100g chicken'…"
                  }
                  value={query}
                  onChange={e => {
                    const v = e.target.value
                    setQuery(v)
                    if (!v.trim()) {
                      setVoiceQty(null)
                      setVoiceHint('')
                      return
                    }
                    const parsed = parseVoiceInput(v)
                    if (parsed.qty && parsed.foodName) {
                      setVoiceQty(parsed.qty)
                      setVoiceUnit(parsed.unit)
                      setVoiceHint(`${parsed.qty}${parsed.unit} · "${parsed.foodName}"`)
                    } else {
                      setVoiceQty(null)
                      setVoiceHint('')
                    }
                  }}
                  autoComplete="off"
                  disabled={!seeded}
                />
                {query.length > 0 && !listening && (
                  <button style={s.searchIconBtn} onClick={() => { setQuery(''); setVoiceQty(null); setVoiceHint('') }}>✕</button>
                )}
                {speechSupported && (
                  <button
                    style={{ ...s.searchIconBtn, ...(listening ? s.micActive : {}) }}
                    onClick={listening ? stopListening : startListening}
                    disabled={!seeded}
                    type="button"
                    aria-label={listening ? "Stop listening" : "Voice input"}
                  >
                    {listening ? '⏹' : '🎤'}
                  </button>
                )}
              </div>
              {listening && (
                <div style={s.voiceHint}>
                  Listening… tap <strong>⏹</strong> to stop
                </div>
              )}
              {!listening && voiceHint ? (
                <div style={s.voiceHint}>{voiceHint}</div>
              ) : null}

              {/* Scan + Manual + Recipe buttons */}
              <div style={s.actionGrid}>
                <button style={s.actionBtn} onClick={() => setScreen("barcode")}>
                  📲 Barcode
                </button>
                <button style={s.actionBtn} onClick={() => setScreen("scan")}>
                  📷 Scan Label
                </button>
                <button style={s.actionBtn} onClick={() => setScreen("create")}>
                  ✏️ Create Food
                </button>
                <button style={s.actionBtn} onClick={() => setScreen("recipe")}>
                  🍲 Recipe
                </button>
              </div>

              {/* Active batches */}
              {!query.trim() && batches.length > 0 && (
                <div style={s.section}>
                  <div style={s.sectionLabel}>Active Batches</div>
                  {batches.map(batch => (
                    <button key={batch.id} style={s.foodRow} onClick={() => selectItem(null, batch)}>
                      <div style={s.foodInfo}>
                        <div style={s.foodName}>{batch.name}</div>
                        <div style={s.foodMeta}>
                          {batch.macrosPer100g?.calories || 0} kcal · {batch.macrosPer100g?.protein || 0}g P per 100g
                          {batch.shared ? <span style={s.tag}> · Shared</span> : ""}
                        </div>
                      </div>
                      <span style={s.chevron}>›</span>
                    </button>
                  ))}
                </div>
              )}

              {/* My Recipes */}
              {!query.trim() && recipes.length > 0 && (
                <div style={s.section}>
                  <div style={s.sectionLabel}>My Recipes</div>
                  {recipes.map(food => (
                    <button key={food.id} style={s.foodRow} onClick={() => selectItem(food, null)}>
                      <div style={s.foodInfo}>
                        <div style={{ ...s.foodName, fontWeight: '600' }}>{food.name}</div>
                        <div style={s.foodMeta}>
                          {food.servingSize ? `${Math.round((food.per100g?.calories||0)*food.servingSize/100)} kcal · ${Math.round((food.per100g?.protein||0)*food.servingSize/100*10)/10}g P per ${food.servingLabel || `${food.servingSize}g`}` : `${food.per100g?.calories||0} kcal · ${food.per100g?.protein||0}g P per 100g`}
                          <span style={s.tagPersonal}> · Recipe</span>
                        </div>
                      </div>
                      <span style={s.chevron}>›</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Results / Recents */}
              <div style={s.section}>
                <div style={s.sectionLabel}>
                  {query.trim()
                    ? `${results.length} result${results.length !== 1 ? 's' : ''}`
                    : 'Recent Foods'}
                </div>

                {displayList.length === 0 && (
                  <div style={s.empty}>
                    {query.trim()
                      ? 'No foods found — try scanning a label or add manually'
                      : 'No recent foods yet — search above to find foods'}
                  </div>
                )}

                {displayList.map(food => {
                  const isPersonal = food.source === 'saved' || food.source === 'scanned' || food.source === 'recipe'
                  const sourceTag  = food.source === 'scanned' ? 'Your label'
                                   : food.source === 'saved'   ? 'Yours'
                                   : food.source === 'recipe'  ? '🍲 Recipe'
                                   : food.source === 'nin'     ? 'Indian'
                                   : 'USDA'
                  return (
                    <button key={food.id} style={s.foodRow} onClick={() => selectItem(food, null)}>
                      <div style={s.foodInfo}>
                        <div style={{ ...s.foodName, fontWeight: isPersonal ? '600' : '500' }}>
                          {food.name}
                        </div>
                        <div style={s.foodMeta}>
                          {food.servingSize
                            ? `${Math.round((food.per100g?.calories||0)*food.servingSize/100)} kcal · ${Math.round((food.per100g?.protein||0)*food.servingSize/100*10)/10}g P per ${food.servingLabel || `${food.servingSize}g`}`
                            : `${food.per100g?.calories || 0} kcal · ${food.per100g?.protein || 0}g P per 100g`}
                          <span style={isPersonal ? s.tagPersonal : s.tag}> · {sourceTag}</span>
                        </div>
                      </div>
                      <span style={s.chevron}>›</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Entry screen */}
          {screen === "entry" && selected && (
            <FoodEntryInline
              food={selected.food}
              batch={selected.batch}
              meal={meal}
              onAdd={handleAdd}
              onBack={() => setScreen("list")}
              onEditRecipe={() => setScreen("recipe")}
              initialAmount={voiceQty ? String(voiceQty) : undefined}
              initialUnit={voiceQty ? voiceUnit : undefined}
            />
          )}

          {/* Scan screen */}
          {screen === "scan" && (
            <LabelScanner
              userId={user?.id}
              householdId={user?.householdId}
              onSaved={food => selectItem(food, null)}
              onCancel={() => setScreen("list")}
            />
          )}

          {/* Barcode screen */}
          {screen === "barcode" && (
            <BarcodeScanner
              householdId={user?.householdId}
              onFound={food => selectItem(food, null)}
              onSaved={() => setScreen("list")}
              onCancel={() => setScreen("list")}
            />
          )}

          {/* Manual food creator */}
          {screen === "create" && (
            <ManualFoodCreator
              householdId={user?.householdId}
              onSaved={(food, addToLog) => addToLog ? selectItem(food, null) : setScreen("list")}
              onCancel={() => setScreen("list")}
            />
          )}

          {/* Recipe builder screen */}
          {screen === "recipe" && (
            <RecipeBuilder
              existingFood={selected?.food?.source === 'recipe' ? selected.food : null}
              householdId={user?.householdId}
              onSaved={food => selectItem(food, null)}
              onCancel={() => selected?.food?.source === 'recipe' ? setScreen("entry") : setScreen("list")}
            />
          )}
        </div>
      )}
    </>
  )
}

// ─── Serving unit label helper ────────────────────────────────────────────────
function parseServingUnit(label) {
  if (!label) return 'serving'
  const m = label.match(/^[\d.]+\s+(.+)$/)
  return m ? m[1] : label
}

// ─── Inline Food Entry ────────────────────────────────────────────────────────
function FoodEntryInline({ food, batch, meal, onAdd, onBack, onEditRecipe, initialAmount, initialUnit }) {
  const { user } = useAuth()
  const isManual = food?.id === "manual"
  const isBatch  = !!batch
  const isRecipe = !isBatch && food?.source === 'recipe' && Array.isArray(food?.ingredients) && food.ingredients.length > 0
  const item     = batch || food

  const hasServingMode       = !isBatch && !!item?.servingSize
  const defaultMode          = hasServingMode ? 'servings' : 'grams'
  const defaultAmount        = hasServingMode ? '1' : String(item?.servingSize || 100)
  const hasAdjustIngredients = (isBatch && Array.isArray(batch?.ingredients) && batch.ingredients.length > 0) || isRecipe

  const ingredientSrc = isBatch ? (batch?.ingredients || []) : (isRecipe ? (food?.ingredients || []) : [])

  const [inputMode,      setInputMode]      = useState(defaultMode)
  const [amount,         setAmount]         = useState(initialAmount ?? defaultAmount)
  const [unit,           setUnit]           = useState(initialUnit   ?? 'g')
  const [name,           setName]           = useState(isManual ? "" : (item?.name || ""))
  const [manMacros,      setManMacros]      = useState({ calories:"", protein:"", carbs:"", fat:"", fibre:"" })
  const [manServings,    setManServings]    = useState('1')
  const [servingLabel,   setServingLabel]   = useState('')
  const [saveToFoods,    setSaveToFoods]    = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState("")
  const [adjustMode,     setAdjustMode]     = useState(false)
  const [updateSaved,    setUpdateSaved]    = useState(false)
  const [adjIngredients, setAdjIngredients] = useState(
    () => ingredientSrc.map(i => ({ ...i, gramsInput: String(i.grams) }))
  )

  const parsedAmount = parseFloat(amount) || 0
  const parsedGrams  = inputMode === 'servings'
    ? parsedAmount * (item?.servingSize || 100)
    : toGrams(parsedAmount, unit)

  const manServingCount = Math.max(parseFloat(manServings) || 1, 0.1)
  const manGrams = toGrams(parsedAmount, unit)

  // In adjust mode: sum macros from each adjusted ingredient directly
  const adjTotalGrams = adjustMode
    ? adjIngredients.reduce((s, i) => s + (parseFloat(i.gramsInput) || 0), 0)
    : 0

  // Calculate macros
  let macros = { calories:0, protein:0, carbs:0, fat:0, fibre:0 }
  if (adjustMode && adjIngredients.length > 0) {
    for (const ing of adjIngredients) {
      const g = parseFloat(ing.gramsInput) || 0
      const m = calcMacros({ per100g: ing.per100g }, g)
      for (const k of ['calories','protein','carbs','fat','fibre']) macros[k] = Math.round(((macros[k]||0) + (m[k]||0)) * 10) / 10
    }
  } else if (isBatch && parsedGrams > 0) {
    macros = calcBatchMacros(batch, parsedGrams)
  } else if (!isManual && food && parsedGrams > 0) {
    macros = calcMacros(food, parsedGrams)
  } else if (isManual) {
    macros = {
      calories: Math.round((parseFloat(manMacros.calories) || 0) * manServingCount * 10) / 10,
      protein:  Math.round((parseFloat(manMacros.protein)  || 0) * manServingCount * 10) / 10,
      carbs:    Math.round((parseFloat(manMacros.carbs)    || 0) * manServingCount * 10) / 10,
      fat:      Math.round((parseFloat(manMacros.fat)      || 0) * manServingCount * 10) / 10,
      fibre:    Math.round((parseFloat(manMacros.fibre)    || 0) * manServingCount * 10) / 10,
    }
  }

  async function handleAdd() {
    if (isManual && parsedAmount <= 0) { setError("Enter a valid amount"); return }
    if (!isManual && parsedAmount <= 0) { setError("Enter a valid amount"); return }
    if (isManual && !name.trim()) { setError("Enter food name"); return }
    setSaving(true)

    const totalGrams = adjustMode ? adjTotalGrams
      : isManual ? manGrams * manServingCount
      : parsedGrams

    let foodId = isBatch ? null : (isManual ? null : food.id)

    if (isManual && saveToFoods && name.trim() && manGrams > 0) {
      // Normalise to per-100g for storage; servingSize = 1-serving grams
      const factor = 100 / manGrams
      const per100g = {
        calories: Math.round((parseFloat(manMacros.calories) || 0) * factor * 10) / 10,
        protein:  Math.round((parseFloat(manMacros.protein)  || 0) * factor * 10) / 10,
        carbs:    Math.round((parseFloat(manMacros.carbs)    || 0) * factor * 10) / 10,
        fat:      Math.round((parseFloat(manMacros.fat)      || 0) * factor * 10) / 10,
        fibre:    Math.round((parseFloat(manMacros.fibre)    || 0) * factor * 10) / 10,
      }
      const label = servingLabel.trim()
        ? `${manGrams}g ${servingLabel.trim()}`
        : `${manGrams}g serving`
      const saved = await saveFood({ name: name.trim(), per100g, servingSize: manGrams, servingLabel: label, source: 'saved', tags: [] }, user?.householdId)
      foodId = saved.id
    }

    onAdd({
      foodId,
      batchId: isBatch ? batch.id : null,
      name:    isManual ? name.trim() : item.name,
      grams:   totalGrams,
      source:  isBatch ? "batch" : (isManual ? (saveToFoods ? "saved" : "manual") : food.source),
      ...macros,
    })
    setSaving(false)
  }

  async function handleUpdateRecipe() {
    if (!isRecipe || !food?.id) return
    const updated = adjIngredients.map(({ gramsInput, ...rest }) => ({ ...rest, grams: parseFloat(gramsInput) || rest.grams }))
    const totalG  = updated.reduce((s, i) => s + i.grams, 0)
    if (!totalG) return
    let totals = { calories:0, protein:0, carbs:0, fat:0, fibre:0 }
    for (const ing of updated) {
      const m = calcMacros({ per100g: ing.per100g }, ing.grams)
      for (const k of Object.keys(totals)) totals[k] = Math.round(((totals[k]||0) + (m[k]||0)) * 10) / 10
    }
    const factor  = 100 / totalG
    const per100g = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v * factor * 10) / 10]))
    await saveFood({ ...food, ingredients: updated, per100g, servingSize: totalG, dirty: 1, updatedAt: new Date().toISOString() }, user?.householdId)
    setUpdateSaved(true)
    setTimeout(() => setUpdateSaved(false), 2500)
  }

  return (
    <div style={s.entryContainer}>
      <button style={s.backBtn} onClick={onBack}>← Back</button>

      {/* Food name */}
      {isManual ? (
        <input
          style={s.nameInput}
          placeholder="Food name e.g. Homemade Dal"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
      ) : (
        <div style={s.entryTitle}>{item?.name}</div>
      )}

      {isBatch   && <div style={s.batchTag}>From batch</div>}
      {isRecipe  && (
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <div style={{ ...s.batchTag, background:'var(--bg-elevated)', color:'var(--text-secondary)', borderColor:'var(--border-default)' }}>Recipe</div>
          <button style={s.editRecipeLink} onClick={onEditRecipe}>Edit recipe ✏️</button>
        </div>
      )}

      {/* Amount input + unit picker — hidden when adjusting ingredients */}
      {!adjustMode && (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {hasServingMode && (
            <div style={s.modeToggleRow}>
              <button type="button" onClick={() => setInputMode('servings')} style={{ ...s.modeToggleBtn, ...(inputMode === 'servings' ? s.modeToggleActive : {}) }}>Servings</button>
              <button type="button" onClick={() => setInputMode('grams')}    style={{ ...s.modeToggleBtn, ...(inputMode === 'grams'    ? s.modeToggleActive : {}) }}>Grams</button>
            </div>
          )}
          <div style={s.gramRow}>
            <input
              style={s.gramInput}
              type="number"
              inputMode="decimal"
              placeholder={inputMode === 'servings' ? '1' : '100'}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus={!isManual}
            />
            {inputMode === 'servings' ? (
              <div style={s.servingUnitInfo}>
                <span style={s.servingUnitName}>{parseServingUnit(item?.servingLabel)}</span>
                <span style={s.servingUnitGrams}>{Math.round(parsedGrams)}g</span>
              </div>
            ) : (
              <div style={{ display:'flex', gap:'4px', flexShrink:0 }}>
                {WEIGHT_UNITS.map(u => (
                  <button key={u} type="button" onClick={() => setUnit(u)}
                    style={{ padding:'6px 8px', background: unit === u ? 'var(--text-primary)' : 'var(--bg-elevated)', border:`1px solid ${unit === u ? 'var(--text-primary)' : 'var(--border-default)'}`, borderRadius:'var(--r-sm)', color: unit === u ? 'var(--text-inverse)' : 'var(--text-secondary)', fontSize:'12px', fontWeight:'600', cursor:'pointer' }}
                  >{u}</button>
                ))}
              </div>
            )}
          </div>
          {!isManual && !isBatch && inputMode === 'grams' && item?.servingSize && item?.servingLabel && (
            <button style={s.servingHint} onClick={() => { setAmount(String(item.servingSize)); setUnit('g') }}>
              1 serving = {item.servingSize}g ({item.servingLabel}) — tap to use
            </button>
          )}
        </div>
      )}

      {/* Adjust ingredients — batch or recipe */}
      {hasAdjustIngredients && (
        <button
          type="button"
          style={{ ...s.adjustToggle, ...(adjustMode ? s.adjustToggleOn : {}) }}
          onClick={() => setAdjustMode(v => !v)}
        >
          {adjustMode ? '✕ Use standard amount' : '⚖️ Adjust ingredients'}
        </button>
      )}

      {adjustMode && (
        <div style={s.adjCard}>
          <div style={s.adjHeader}>
            <span style={s.adjTitle}>Today's quantities</span>
            <span style={s.adjTotal}>{Math.round(adjTotalGrams)}g total</span>
          </div>
          {adjIngredients.map((ing, i) => (
            <div key={i} style={s.adjRow}>
              <span style={s.adjName}>{ing.name}</span>
              <div style={s.adjInputWrap}>
                <input
                  style={s.adjInput}
                  type="number"
                  inputMode="decimal"
                  value={ing.gramsInput}
                  onChange={e => setAdjIngredients(prev =>
                    prev.map((x, j) => j === i ? { ...x, gramsInput: e.target.value } : x)
                  )}
                />
                <span style={s.adjUnit}>g</span>
              </div>
            </div>
          ))}
          {isRecipe && (
            <button style={{ ...s.adjRow, borderBottom:'none', justifyContent:'center', cursor:'pointer', background:'none', border:'none', width:'100%' }} onClick={handleUpdateRecipe}>
              <span style={{ fontSize:'12px', fontWeight:'600', color: updateSaved ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                {updateSaved ? '✓ Saved as new defaults' : 'Save as new defaults for this recipe'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Manual macro input */}
      {isManual && (
        <div style={s.manualSection}>
          <div style={s.manualLabel}>
            Macros for 1 serving ({parsedAmount > 0 ? parsedAmount : '?'}{unit})
          </div>
          <div style={s.manualGrid}>
            {[
              { key:"calories", label:"kcal",   color:"var(--text-primary)"  },
              { key:"protein",  label:"P (g)",  color:"var(--macro-protein)" },
              { key:"carbs",    label:"C (g)",  color:"var(--macro-carbs)"   },
              { key:"fat",      label:"F (g)",  color:"var(--macro-fat)"     },
              { key:"fibre",    label:"Fi (g)", color:"var(--macro-fibre)"   },
            ].map(({ key, label, color }) => (
              <div key={key} style={s.manualField}>
                <label style={{ ...s.manualFieldLabel, color }}>{label}</label>
                <input
                  style={s.manualInput}
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={manMacros[key]}
                  onChange={e => setManMacros(m => ({ ...m, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          {/* Serving count — how many of the above serving did you have? */}
          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginTop:'4px' }}>
            <div style={{ flex:1 }}>
              <div style={s.manualLabel}>Servings eaten</div>
              <input
                style={{ ...s.manualInput, textAlign:'left', padding:'8px 10px', fontSize:'16px' }}
                type="number"
                inputMode="decimal"
                placeholder="1"
                value={manServings}
                onChange={e => setManServings(e.target.value)}
              />
            </div>
            {manServingCount !== 1 && (
              <div style={{ fontSize:'12px', color:'var(--text-tertiary)', marginTop:'16px' }}>
                = {Math.round(manGrams * manServingCount)}g total
              </div>
            )}
          </div>
        </div>
      )}

      {/* Macro preview */}
      <div style={s.macroPreview}>
        {[
          { key:"calories", label:"kcal",    val: macros.calories },
          { key:"protein",  label:"Protein", val: macros.protein  },
          { key:"carbs",    label:"Carbs",   val: macros.carbs    },
          { key:"fat",      label:"Fat",     val: macros.fat      },
          { key:"fibre",    label:"Fibre",   val: macros.fibre    },
        ].map(({ key, label, val }) => (
          <div key={key} style={s.macroCell}>
            <span style={{ ...s.macroVal, color: MACRO_COLORS[key] }}>{val}</span>
            <span style={s.macroLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* Per 100g reference */}
      {!isManual && !isBatch && (
        <div style={s.per100}>
          Per 100g — {food?.per100g?.calories || 0} kcal · {food?.per100g?.protein || 0}g P · {food?.per100g?.carbs || 0}g C · {food?.per100g?.fat || 0}g F
        </div>
      )}

      {isManual && (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          <button
            type="button"
            onClick={() => setSaveToFoods(v => !v)}
            style={{ ...s.saveToggle, ...(saveToFoods ? s.saveToggleOn : {}) }}
          >
            <div style={{ ...s.saveToggleDot, ...(saveToFoods ? s.saveToggleDotOn : {}) }} />
            <span>Save to my foods (searchable next time)</span>
          </button>
          {saveToFoods && (
            <input
              style={{ ...s.nameInput, fontSize:'14px', padding:'10px 14px' }}
              placeholder={`Serving name (optional) — e.g. bowl, scoop, cup`}
              value={servingLabel}
              onChange={e => setServingLabel(e.target.value)}
            />
          )}
        </div>
      )}

      {error && <p style={s.error}>{error}</p>}

      <div style={s.actions}>
        <button style={s.cancelBtn} onClick={onBack}>Cancel</button>
        <button style={s.addBtn} onClick={handleAdd} disabled={saving}>
          {saving ? 'Saving…' : 'Add to log'}
        </button>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  fab:          { position:"fixed", bottom:"calc(80px + env(safe-area-inset-bottom) + 16px)", right:"20px", width:"56px", height:"56px", borderRadius:"50%", background:"var(--text-primary)", color:"var(--text-inverse)", fontSize:"28px", fontWeight:"300", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(28,24,20,0.18)", zIndex:90 },
  inlineAddBtn: { padding:"14px", background:"var(--text-primary)", color:"var(--text-inverse)", border:"none", borderRadius:"var(--r-lg)", fontSize:"15px", fontWeight:"600", cursor:"pointer", width:"100%", textAlign:"center" },
  overlay:      { position:"fixed", inset:0, background:"rgba(28,24,20,0.35)", zIndex:150, backdropFilter:"blur(2px)" },
  sheet:        { position:"fixed", bottom:0, left:0, right:0, background:"var(--bg-surface)", borderRadius:"22px 22px 0 0", borderTop:"0.5px solid var(--border-subtle)", padding:"12px 16px calc(16px + env(safe-area-inset-bottom))", zIndex:151, height:"92svh", overflowY:"auto", overscrollBehavior:"contain", WebkitOverflowScrolling:"touch", animation:"sheetUp 0.2s cubic-bezier(0,0,0.2,1) both" },
  handle:       { width:"32px", height:"3px", background:"var(--border-strong)", borderRadius:"99px", margin:"0 auto 16px" },
  mealRow:      { display:"flex", gap:"6px", marginBottom:"12px" },
  mealBtn:      { flex:1, padding:"8px 4px", background:"var(--bg-elevated)", border:"0.5px solid var(--border-subtle)", borderRadius:"var(--r-md)", fontSize:"12px", fontWeight:"500", color:"var(--text-secondary)", cursor:"pointer" },
  mealBtnActive:{ background:"var(--text-primary)", color:"var(--text-inverse)", borderColor:"var(--text-primary)" },
  searchRow:    { display:"flex", alignItems:"center", gap:"6px", marginBottom:"6px" },
  searchInput:  { flex:1, padding:"11px 14px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-md)", fontSize:"15px", color:"var(--text-primary)", outline:"none", minWidth:0 },
  searchIconBtn:{ width:"40px", height:"40px", borderRadius:"var(--r-md)", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", color:"var(--text-secondary)", fontSize:"15px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  micActive:    { background:"var(--accent)", borderColor:"var(--accent)", color:"#fff", animation:"micPulse 1s ease-in-out infinite" },
  voiceHint:    { fontSize:"12px", color:"var(--accent)", marginBottom:"8px", paddingLeft:"2px", fontWeight:"500" },
  actionRow:    { display:"flex", gap:"8px", marginBottom:"12px" },
  actionGrid:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", marginBottom:"12px" },
  actionBtn:    { padding:"10px", background:"var(--bg-elevated)", border:"1px dashed var(--border-strong)", borderRadius:"var(--r-md)", color:"var(--text-secondary)", fontSize:"13px", fontWeight:"500", cursor:"pointer" },
  section:      { marginBottom:"8px" },
  sectionLabel: { fontSize:"10px", fontWeight:"700", color:"var(--text-tertiary)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"6px", paddingLeft:"2px" },
  foodRow:      { display:"flex", alignItems:"center", width:"100%", padding:"11px 12px", background:"transparent", border:"none", borderBottom:"0.5px solid var(--border-subtle)", cursor:"pointer", textAlign:"left", gap:"8px" },
  foodInfo:     { flex:1, display:"flex", flexDirection:"column", gap:"2px" },
  foodName:     { fontSize:"14px", fontWeight:"500", color:"var(--text-primary)", letterSpacing:"-0.01em" },
  foodMeta:     { fontSize:"12px", color:"var(--text-tertiary)" },
  tag:          { color:"var(--text-tertiary)", fontWeight:"500" },
  tagPersonal:  { color:"var(--accent)", fontWeight:"600" },
  chevron:      { fontSize:"20px", color:"var(--text-tertiary)", flexShrink:0 },
  empty:        { fontSize:"13px", color:"var(--text-tertiary)", textAlign:"center", padding:"24px 0" },
  entryContainer:{ display:"flex", flexDirection:"column", gap:"14px", paddingBottom:"8px" },
  backBtn:      { background:"none", border:"none", color:"var(--accent)", fontSize:"15px", cursor:"pointer", padding:0, alignSelf:"flex-start" },
  entryTitle:   { fontSize:"18px", fontWeight:"600", color:"var(--text-primary)", letterSpacing:"-0.02em" },
  batchTag:     { display:"inline-block", fontSize:"11px", fontWeight:"600", background:"var(--accent-dim)", color:"var(--accent)", padding:"3px 10px", borderRadius:"var(--r-full)", letterSpacing:"0.04em", textTransform:"uppercase" },
  editRecipeLink:{ background:"none", border:"none", color:"var(--accent)", fontSize:"12px", fontWeight:"600", cursor:"pointer", padding:0 },
  nameInput:    { padding:"12px 14px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-md)", fontSize:"16px", color:"var(--text-primary)", outline:"none", width:"100%", boxSizing:"border-box" },
  gramRow:         { display:"flex", alignItems:"center", gap:"10px" },
  gramInput:       { flex:1, fontSize:"36px", fontWeight:"300", letterSpacing:"-0.03em", padding:"10px 14px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-md)", color:"var(--text-primary)", outline:"none" },
  gramUnit:        { fontSize:"18px", color:"var(--text-tertiary)", fontWeight:"400" },
  servingHint:     { background:"none", border:"none", color:"var(--accent)", fontSize:"13px", cursor:"pointer", padding:0, textAlign:"left" },
  modeToggleRow:   { display:"flex", gap:"4px" },
  modeToggleBtn:   { padding:"6px 14px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-full)", fontSize:"12px", fontWeight:"600", color:"var(--text-secondary)", cursor:"pointer" },
  modeToggleActive:{ background:"var(--text-primary)", borderColor:"var(--text-primary)", color:"var(--text-inverse)" },
  servingUnitInfo: { display:"flex", flexDirection:"column", alignItems:"flex-end", flexShrink:0, gap:"2px" },
  servingUnitName: { fontSize:"15px", fontWeight:"500", color:"var(--text-primary)" },
  servingUnitGrams:{ fontSize:"12px", color:"var(--text-tertiary)", fontFamily:"var(--font-mono)" },
  manualSection:{ display:"flex", flexDirection:"column", gap:"8px" },
  manualLabel:  { fontSize:"11px", fontWeight:"700", color:"var(--text-tertiary)", textTransform:"uppercase", letterSpacing:"0.07em" },
  manualGrid:   { display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"6px" },
  manualField:  { display:"flex", flexDirection:"column", gap:"3px" },
  manualFieldLabel:{ fontSize:"10px", fontWeight:"600", textAlign:"center" },
  manualInput:  { padding:"8px 4px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-sm)", fontSize:"14px", color:"var(--text-primary)", outline:"none", textAlign:"center", width:"100%", boxSizing:"border-box" },
  macroPreview: { display:"grid", gridTemplateColumns:"repeat(5,1fr)", background:"var(--bg-elevated)", borderRadius:"var(--r-lg)", overflow:"hidden" },
  macroCell:    { display:"flex", flexDirection:"column", alignItems:"center", padding:"12px 4px", gap:"3px" },
  macroVal:     { fontSize:"16px", fontWeight:"600", letterSpacing:"-0.02em", fontFamily:"var(--font-mono)" },
  macroLabel:   { fontSize:"10px", color:"var(--text-tertiary)", fontWeight:"500", textTransform:"uppercase", letterSpacing:"0.04em" },
  per100:       { fontSize:"12px", color:"var(--text-tertiary)", textAlign:"center" },
  error:        { fontSize:"13px", color:"var(--red)", margin:0 },
  actions:      { display:"flex", gap:"10px", marginTop:"4px" },
  cancelBtn:    { flex:1, padding:"14px", background:"transparent", border:"1px solid var(--border-default)", borderRadius:"var(--r-lg)", color:"var(--text-secondary)", fontSize:"15px", fontWeight:"500", cursor:"pointer" },
  addBtn:       { flex:2, padding:"14px", background:"var(--text-primary)", border:"none", borderRadius:"var(--r-lg)", color:"var(--text-inverse)", fontSize:"15px", fontWeight:"600", cursor:"pointer" },
  saveToggle:   { display:"flex", alignItems:"center", gap:"10px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-lg)", padding:"12px 14px", cursor:"pointer", width:"100%", textAlign:"left", fontSize:"13px", color:"var(--text-secondary)", fontWeight:"500" },
  saveToggleOn: { borderColor:"var(--accent)", color:"var(--accent)", background:"var(--accent-dim)" },
  saveToggleDot:{ width:"18px", height:"18px", borderRadius:"50%", border:"2px solid var(--border-default)", flexShrink:0, transition:"all 0.15s" },
  saveToggleDotOn:{ background:"var(--accent)", borderColor:"var(--accent)" },
  // Adjust ingredients
  adjustToggle: { display:"flex", alignItems:"center", justifyContent:"center", gap:"6px", padding:"10px 14px", background:"var(--bg-elevated)", border:"1px dashed var(--border-strong)", borderRadius:"var(--r-lg)", fontSize:"13px", fontWeight:"600", color:"var(--text-secondary)", cursor:"pointer", width:"100%" },
  adjustToggleOn:{ borderStyle:"solid", borderColor:"var(--accent)", color:"var(--accent)", background:"var(--accent-dim)" },
  adjCard:      { background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-lg)", overflow:"hidden" },
  adjHeader:    { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px 8px", borderBottom:"0.5px solid var(--border-subtle)" },
  adjTitle:     { fontSize:"11px", fontWeight:"700", color:"var(--text-tertiary)", textTransform:"uppercase", letterSpacing:"0.08em" },
  adjTotal:     { fontSize:"12px", fontWeight:"600", color:"var(--accent)", fontFamily:"var(--font-mono)" },
  adjRow:       { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"0.5px solid var(--border-subtle)", gap:"12px" },
  adjName:      { fontSize:"14px", color:"var(--text-primary)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  adjInputWrap: { display:"flex", alignItems:"center", gap:"4px", flexShrink:0 },
  adjInput:     { width:"64px", padding:"6px 8px", background:"var(--bg-base)", border:"1px solid var(--border-default)", borderRadius:"var(--r-md)", fontSize:"15px", fontWeight:"600", color:"var(--text-primary)", outline:"none", textAlign:"right", fontFamily:"var(--font-mono)" },
  adjUnit:      { fontSize:"13px", color:"var(--text-tertiary)", fontWeight:"500" },
}
