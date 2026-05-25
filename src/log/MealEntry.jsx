import { useState, useEffect } from "react"
import { searchFoods, getRecentFoods, getActiveBatches, detectMealSlot, seedFoodDatabase } from "../food/FoodDB.js"
import { useAuth } from "../auth/useAuth.jsx"
import { addFoodLogEntry } from "../db/db.js"
import { calcMacros, calcBatchMacros } from "../food/macroCalc.js"
import LabelScanner from "../food/LabelScanner.jsx"
import { MACRO_COLORS } from "../config.js"

export default function MealEntry({ date, onLogged }) {
  const [open,     setOpen]     = useState(false)
  const [screen,   setScreen]   = useState("list") // list | entry | scan
  const [selected, setSelected] = useState(null)
  const [query,    setQuery]    = useState("")
  const [results,  setResults]  = useState([])
  const [recents,  setRecents]  = useState([])
  const [batches,  setBatches]  = useState([])
  const [meal,     setMeal]     = useState(detectMealSlot())
  const [seeded,   setSeeded]   = useState(false)
  const { user } = useAuth()

  // Seed food database once
  useEffect(() => {
    seedFoodDatabase().then(() => setSeeded(true))
  }, [])

  // Load recents + batches when sheet opens
  useEffect(() => {
    if (!open || !user || !seeded) return
    setMeal(detectMealSlot())
    Promise.all([
      getActiveBatches(user.id),
      getRecentFoods(user.id),
    ]).then(([b, r]) => {
      setBatches(b)
      setRecents(r)
    })
  }, [open, user, seeded])

  // Search as user types
  useEffect(() => {
    if (!query.trim() || !seeded) { setResults([]); return }
    const t = setTimeout(async () => {
      const r = await searchFoods(query, 20)
      setResults(r)
    }, 150)
    return () => clearTimeout(t)
  }, [query, seeded])

  function openSheet() {
    setOpen(true)
    setScreen("list")
    setQuery("")
    setSelected(null)
  }

  function closeSheet() {
    setOpen(false)
    setScreen("list")
    setQuery("")
    setSelected(null)
  }

  function selectItem(food, batch) {
    setSelected({ food, batch })
    setScreen("entry")
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

  const displayList = query.trim() ? results : recents

  return (
    <>
      {/* Floating + button */}
      <button style={s.fab} onClick={openSheet}>+</button>

      {/* Overlay */}
      {open && <div style={s.overlay} onClick={closeSheet} />}

      {/* Bottom sheet */}
      {open && (
        <div style={s.sheet}>
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
                  placeholder="Search foods…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  autoComplete="off"
                />
                {query.length > 0 && (
                  <button style={s.clearBtn} onClick={() => setQuery("")}>✕</button>
                )}
              </div>

              {/* Scan + Manual buttons */}
              <div style={s.actionRow}>
                <button style={s.actionBtn} onClick={() => setScreen("scan")}>
                  📷 Scan Label
                </button>
                <button style={s.actionBtn} onClick={() => selectItem({ id:"manual", name:"", per100g:{ calories:0, protein:0, carbs:0, fat:0, fibre:0 }, servingSize:100 }, null)}>
                  ✏️ Add Manual
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

              {/* Results / Recents */}
              <div style={s.section}>
                <div style={s.sectionLabel}>
                  {query.trim() ? `${results.length} results` : "Recent Foods"}
                </div>

                {displayList.length === 0 && (
                  <div style={s.empty}>
                    {query.trim() ? "No foods found — try scanning a label" : "No recent foods yet — search above"}
                  </div>
                )}

                {displayList.map(food => (
                  <button key={food.id} style={s.foodRow} onClick={() => selectItem(food, null)}>
                    <div style={s.foodInfo}>
                      <div style={s.foodName}>{food.name}</div>
                      <div style={s.foodMeta}>
                        {food.per100g?.calories || 0} kcal · {food.per100g?.protein || 0}g P per 100g
                        <span style={s.tag}> · {food.source === "nin" ? "Indian" : food.source}</span>
                      </div>
                    </div>
                    <span style={s.chevron}>›</span>
                  </button>
                ))}
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
            />
          )}

          {/* Scan screen */}
          {screen === "scan" && (
            <LabelScanner
              userId={user?.id}
              onSaved={food => selectItem(food, null)}
              onCancel={() => setScreen("list")}
            />
          )}
        </div>
      )}
    </>
  )
}

// ─── Inline Food Entry ────────────────────────────────────────────────────────
function FoodEntryInline({ food, batch, meal, onAdd, onBack }) {
  const isManual = food?.id === "manual"
  const isBatch  = !!batch
  const item     = batch || food

  const [grams,    setGrams]    = useState(String(item?.servingSize || 100))
  const [name,     setName]     = useState(isManual ? "" : (item?.name || ""))
  const [manMacros, setManMacros] = useState({ calories:"", protein:"", carbs:"", fat:"", fibre:"" })
  const [error,    setError]    = useState("")

  const parsedGrams = parseFloat(grams) || 0

  // Calculate macros
  let macros = { calories:0, protein:0, carbs:0, fat:0, fibre:0 }
  if (isBatch && parsedGrams > 0) {
    macros = calcBatchMacros(batch, parsedGrams)
  } else if (!isManual && food && parsedGrams > 0) {
    macros = calcMacros(food, parsedGrams)
  } else if (isManual && parsedGrams > 0) {
    // Manual — macros entered per 100g, calculate for grams
    const ratio = parsedGrams / 100
    macros = {
      calories: Math.round((parseFloat(manMacros.calories) || 0) * ratio * 10) / 10,
      protein:  Math.round((parseFloat(manMacros.protein)  || 0) * ratio * 10) / 10,
      carbs:    Math.round((parseFloat(manMacros.carbs)    || 0) * ratio * 10) / 10,
      fat:      Math.round((parseFloat(manMacros.fat)      || 0) * ratio * 10) / 10,
      fibre:    Math.round((parseFloat(manMacros.fibre)    || 0) * ratio * 10) / 10,
    }
  }

  function handleAdd() {
    if (parsedGrams <= 0) { setError("Enter a valid amount"); return }
    if (isManual && !name.trim()) { setError("Enter food name"); return }

    onAdd({
      foodId:  isBatch ? null : (isManual ? null : food.id),
      batchId: isBatch ? batch.id : null,
      name:    isManual ? name.trim() : item.name,
      grams:   parsedGrams,
      source:  isBatch ? "batch" : (isManual ? "manual" : food.source),
      ...macros,
    })
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

      {isBatch && <div style={s.batchTag}>From batch</div>}

      {/* Grams input */}
      <div style={s.gramRow}>
        <input
          style={s.gramInput}
          type="number"
          inputMode="decimal"
          placeholder="100"
          value={grams}
          onChange={e => setGrams(e.target.value)}
          autoFocus={!isManual}
        />
        <span style={s.gramUnit}>g</span>
      </div>

      {/* Serving size reference */}
      {!isManual && item?.servingSize && item?.servingLabel && (
        <button
          style={s.servingHint}
          onClick={() => setGrams(String(item.servingSize))}
        >
          1 serving = {item.servingSize}g ({item.servingLabel}) — tap to use
        </button>
      )}

      {/* Manual macro input */}
      {isManual && (
        <div style={s.manualSection}>
          <div style={s.manualLabel}>Macros per 100g</div>
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

      {error && <p style={s.error}>{error}</p>}

      <div style={s.actions}>
        <button style={s.cancelBtn} onClick={onBack}>Cancel</button>
        <button style={s.addBtn} onClick={handleAdd}>Add to log</button>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  fab:          { position:"fixed", bottom:"96px", right:"20px", width:"56px", height:"56px", borderRadius:"50%", background:"var(--text-primary)", color:"var(--text-inverse)", fontSize:"28px", fontWeight:"300", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(28,24,20,0.18)", zIndex:90 },
  overlay:      { position:"fixed", inset:0, background:"rgba(28,24,20,0.35)", zIndex:150, backdropFilter:"blur(2px)" },
  sheet:        { position:"fixed", bottom:0, left:0, right:0, background:"var(--bg-surface)", borderRadius:"22px 22px 0 0", borderTop:"0.5px solid var(--border-subtle)", padding:"12px 16px calc(16px + env(safe-area-inset-bottom))", zIndex:151, maxHeight:"92dvh", overflowY:"auto", animation:"sheetUp 0.3s cubic-bezier(0.16,1,0.3,1) both" },
  handle:       { width:"32px", height:"3px", background:"var(--border-strong)", borderRadius:"99px", margin:"0 auto 16px" },
  mealRow:      { display:"flex", gap:"6px", marginBottom:"12px" },
  mealBtn:      { flex:1, padding:"8px 4px", background:"var(--bg-elevated)", border:"0.5px solid var(--border-subtle)", borderRadius:"var(--r-md)", fontSize:"12px", fontWeight:"500", color:"var(--text-secondary)", cursor:"pointer" },
  mealBtnActive:{ background:"var(--text-primary)", color:"var(--text-inverse)", borderColor:"var(--text-primary)" },
  searchRow:    { display:"flex", alignItems:"center", gap:"8px", marginBottom:"10px", position:"relative" },
  searchInput:  { flex:1, padding:"11px 14px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-md)", fontSize:"15px", color:"var(--text-primary)", outline:"none" },
  clearBtn:     { position:"absolute", right:"10px", background:"none", border:"none", color:"var(--text-tertiary)", fontSize:"14px", cursor:"pointer", padding:"4px" },
  actionRow:    { display:"flex", gap:"8px", marginBottom:"12px" },
  actionBtn:    { flex:1, padding:"10px", background:"var(--bg-elevated)", border:"1px dashed var(--border-strong)", borderRadius:"var(--r-md)", color:"var(--text-secondary)", fontSize:"13px", fontWeight:"500", cursor:"pointer" },
  section:      { marginBottom:"8px" },
  sectionLabel: { fontSize:"10px", fontWeight:"700", color:"var(--text-tertiary)", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"6px", paddingLeft:"2px" },
  foodRow:      { display:"flex", alignItems:"center", width:"100%", padding:"11px 12px", background:"transparent", border:"none", borderBottom:"0.5px solid var(--border-subtle)", cursor:"pointer", textAlign:"left", gap:"8px" },
  foodInfo:     { flex:1, display:"flex", flexDirection:"column", gap:"2px" },
  foodName:     { fontSize:"14px", fontWeight:"500", color:"var(--text-primary)", letterSpacing:"-0.01em" },
  foodMeta:     { fontSize:"12px", color:"var(--text-tertiary)" },
  tag:          { color:"var(--accent)", fontWeight:"500" },
  chevron:      { fontSize:"20px", color:"var(--text-tertiary)", flexShrink:0 },
  empty:        { fontSize:"13px", color:"var(--text-tertiary)", textAlign:"center", padding:"24px 0" },
  entryContainer:{ display:"flex", flexDirection:"column", gap:"14px", paddingBottom:"8px" },
  backBtn:      { background:"none", border:"none", color:"var(--accent)", fontSize:"15px", cursor:"pointer", padding:0, alignSelf:"flex-start" },
  entryTitle:   { fontSize:"18px", fontWeight:"600", color:"var(--text-primary)", letterSpacing:"-0.02em" },
  batchTag:     { display:"inline-block", fontSize:"11px", fontWeight:"600", background:"var(--accent-dim)", color:"var(--accent)", padding:"3px 10px", borderRadius:"var(--r-full)", letterSpacing:"0.04em", textTransform:"uppercase" },
  nameInput:    { padding:"12px 14px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-md)", fontSize:"16px", color:"var(--text-primary)", outline:"none", width:"100%", boxSizing:"border-box" },
  gramRow:      { display:"flex", alignItems:"center", gap:"10px" },
  gramInput:    { flex:1, fontSize:"36px", fontWeight:"300", letterSpacing:"-0.03em", padding:"10px 14px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-md)", color:"var(--text-primary)", outline:"none" },
  gramUnit:     { fontSize:"18px", color:"var(--text-tertiary)", fontWeight:"400" },
  servingHint:  { background:"none", border:"none", color:"var(--accent)", fontSize:"13px", cursor:"pointer", padding:0, textAlign:"left" },
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
}
