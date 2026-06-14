import { useState } from 'react'
import { saveFood } from './FoodDB.js'
import { generateId } from '../auth/crypto.js'

const UNITS = [
  { id: 'g',   label: 'g',   toG: v => v              },
  { id: 'oz',  label: 'oz',  toG: v => v * 28.3495    },
  { id: 'ml',  label: 'ml',  toG: v => v               }, // treat ml as g (standard)
  { id: 'fl',  label: 'fl oz', toG: v => v * 29.5735  },
]

function toGrams(value, unitId) {
  const u = UNITS.find(u => u.id === unitId) || UNITS[0]
  return u.toG(parseFloat(value) || 0)
}

export default function ManualFoodCreator({ onSaved, onCancel, householdId, prefillName = '' }) {
  const [name,          setName]          = useState(prefillName)
  const [brand,         setBrand]         = useState('')
  const [servingAmt,    setServingAmt]    = useState('100')
  const [servingUnit,   setServingUnit]   = useState('g')
  const [servingLabel,  setServingLabel]  = useState('')
  const [totalAmt,      setTotalAmt]      = useState('100')
  const [totalUnit,     setTotalUnit]     = useState('g')
  const [macroMode,     setMacroMode]     = useState('serving') // 'serving' | 'per100' | 'total'
  const [macros, setMacros] = useState({ calories: '', protein: '', carbs: '', fat: '', fibre: '', sodium: '' })
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  function setMacro(key, val) {
    setMacros(m => ({ ...m, [key]: val }))
  }

  async function handleSave(addToLog) {
    if (!name.trim()) { setError('Food name is required'); return }

    let refWeightG, srvG, label
    if (macroMode === 'per100') {
      refWeightG = 100
      srvG  = toGrams(servingAmt, servingUnit)
      label = servingLabel.trim() || `${parseFloat(servingAmt) || 100}${servingUnit}`
    } else if (macroMode === 'total') {
      refWeightG = toGrams(totalAmt, totalUnit)
      srvG  = refWeightG
      label = servingLabel.trim() || `${parseFloat(totalAmt) || 100}${totalUnit}`
    } else {
      srvG  = toGrams(servingAmt, servingUnit)
      refWeightG = srvG
      label = servingLabel.trim() || `${parseFloat(servingAmt) || 100}${servingUnit}`
    }

    if (refWeightG <= 0) { setError('Weight must be greater than 0'); return }
    setError('')
    setSaving(true)

    const toP100 = v => macroMode === 'per100'
      ? Math.round((parseFloat(v) || 0) * 10) / 10
      : Math.round((parseFloat(v) || 0) / refWeightG * 100 * 10) / 10

    const food = {
      id:           generateId(),
      name:         brand.trim() ? `${name.trim()}, ${brand.trim()}` : name.trim(),
      source:       'saved',
      barcode:      null,
      tags:         [],
      servingSize:  Math.round(srvG * 10) / 10,
      servingLabel: label,
      per100g: {
        calories:    toP100(macros.calories),
        protein:     toP100(macros.protein),
        carbs:       toP100(macros.carbs),
        fat:         toP100(macros.fat),
        fibre:       toP100(macros.fibre),
        sodium:      toP100(macros.sodium),
        sugar:       0,
        saturatedFat: 0,
      },
      updatedAt: new Date().toISOString(),
    }

    try {
      await saveFood(food, householdId)
      onSaved(food, addToLog)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const macroFields = [
    { key: 'calories', label: 'Calories', unit: 'kcal', color: 'var(--text-primary)'   },
    { key: 'protein',  label: 'Protein',  unit: 'g',    color: 'var(--macro-protein)'  },
    { key: 'carbs',    label: 'Carbs',    unit: 'g',    color: 'var(--macro-carbs)'    },
    { key: 'fat',      label: 'Fat',      unit: 'g',    color: 'var(--macro-fat)'      },
    { key: 'fibre',    label: 'Fibre',    unit: 'g',    color: 'var(--macro-fibre)'    },
    { key: 'sodium',   label: 'Sodium',   unit: 'mg',   color: 'var(--text-secondary)' },
  ]

  const modeHints = {
    serving: 'Macros are for one serving',
    per100:  'Macros per 100g — as printed on most labels',
    total:   'Macros for the entire thing. Log 0.5 servings to track half.',
  }

  const srvG   = toGrams(servingAmt, servingUnit)
  const totG   = toGrams(totalAmt, totalUnit)
  const macroCardLabel = {
    serving: `Per serving · ${Math.round(srvG * 10) / 10}g`,
    per100:  'Per 100g',
    total:   `Whole thing · ${Math.round(totG * 10) / 10}g`,
  }[macroMode]

  return (
    <div style={st.container}>
      <div style={st.header}>
        <button style={st.backBtn} onClick={onCancel}>← Back</button>
        <span style={st.title}>Create Food</span>
        <div style={{ width: 60 }} />
      </div>

      {/* Name + brand */}
      <div style={st.section}>
        <div style={st.field}>
          <label style={st.label}>Food name *</label>
          <input
            style={st.input}
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            placeholder="e.g. Burrito Bowl"
            autoFocus={!prefillName}
          />
        </div>
        <div style={st.field}>
          <label style={st.label}>Brand (optional)</label>
          <input
            style={st.input}
            value={brand}
            onChange={e => setBrand(e.target.value)}
            placeholder="e.g. Chipotle"
          />
        </div>
      </div>

      {/* Macro mode toggle */}
      <div style={st.toggle}>
        {[
          { id: 'serving', label: 'Per serving' },
          { id: 'per100',  label: 'Per 100g'    },
          { id: 'total',   label: 'Whole thing'  },
        ].map(({ id, label }) => (
          <button
            key={id}
            style={{ ...st.toggleBtn, ...(macroMode === id ? st.toggleActive : {}) }}
            onClick={() => setMacroMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <p style={st.hint}>{modeHints[macroMode]}</p>

      {/* Weight / serving fields */}
      {macroMode === 'total' ? (
        <div style={st.row}>
          <div style={st.field}>
            <label style={st.label}>Total weight</label>
            <div style={st.amtRow}>
              <input
                style={{ ...st.input, flex: 1 }}
                type="number"
                inputMode="decimal"
                placeholder="e.g. 600"
                value={totalAmt}
                onChange={e => setTotalAmt(e.target.value)}
              />
              <select style={st.unitSel} value={totalUnit} onChange={e => setTotalUnit(e.target.value)}>
                {UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </div>
          </div>
          <div style={st.field}>
            <label style={st.label}>Label (optional)</label>
            <input
              style={st.input}
              value={servingLabel}
              onChange={e => setServingLabel(e.target.value)}
              placeholder="e.g. whole bowl"
            />
          </div>
        </div>
      ) : (
        <div style={st.row}>
          <div style={st.field}>
            <label style={st.label}>{macroMode === 'per100' ? 'Serving size' : 'Serving size'}</label>
            <div style={st.amtRow}>
              <input
                style={{ ...st.input, flex: 1 }}
                type="number"
                inputMode="decimal"
                value={servingAmt}
                onChange={e => setServingAmt(e.target.value)}
              />
              <select style={st.unitSel} value={servingUnit} onChange={e => setServingUnit(e.target.value)}>
                {UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </div>
          </div>
          <div style={st.field}>
            <label style={st.label}>Serving label</label>
            <input
              style={st.input}
              value={servingLabel}
              onChange={e => setServingLabel(e.target.value)}
              placeholder="e.g. 1 cup"
            />
          </div>
        </div>
      )}

      {/* Macros */}
      <div style={st.macroCard}>
        <div style={st.macroCardLabel}>{macroCardLabel}</div>
        <div style={st.macroGrid}>
          {macroFields.map(({ key, label, unit, color }) => (
            <div key={key} style={st.macroField}>
              <label style={{ ...st.label, color }}>{label}</label>
              <div style={st.macroInputRow}>
                <input
                  style={st.macroInput}
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={macros[key]}
                  onChange={e => setMacro(key, e.target.value)}
                />
                <span style={st.macroUnit}>{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p style={st.error}>{error}</p>}

      <div style={st.actions}>
        <button style={st.secondaryBtn} onClick={() => handleSave(false)} disabled={saving}>
          Save to Foods
        </button>
        <button style={st.primaryBtn} onClick={() => handleSave(true)} disabled={saving}>
          Add to Log
        </button>
      </div>
    </div>
  )
}

const st = {
  container:     { display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '8px' },
  header:        { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:       { background: 'none', border: 'none', color: 'var(--accent)', fontSize: '15px', cursor: 'pointer', padding: 0, width: 60 },
  title:         { fontSize: '17px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  section:       { display: 'flex', flexDirection: 'column', gap: '10px' },
  row:           { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  field:         { display: 'flex', flexDirection: 'column', gap: '5px' },
  label:         { fontSize: '11px', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  input:         { padding: '11px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)', fontSize: '15px', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' },
  amtRow:        { display: 'flex', gap: '6px', alignItems: 'center' },
  unitSel:       { padding: '11px 8px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', flexShrink: 0, cursor: 'pointer' },
  toggle:        { display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: '3px', gap: '3px' },
  toggleBtn:     { flex: 1, padding: '8px 4px', background: 'none', border: 'none', borderRadius: 'var(--r-sm)', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)', cursor: 'pointer' },
  toggleActive:  { background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: '600', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' },
  hint:          { fontSize: '12px', color: 'var(--text-tertiary)', margin: 0, lineHeight: '1.4' },
  macroCard:     { background: 'var(--bg-surface)', border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' },
  macroCardLabel:{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  macroGrid:     { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' },
  macroField:    { display: 'flex', flexDirection: 'column', gap: '4px' },
  macroInputRow: { display: 'flex', alignItems: 'center', gap: '4px' },
  macroInput:    { flex: 1, padding: '9px 8px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: '15px', fontWeight: '500', color: 'var(--text-primary)', outline: 'none', textAlign: 'right', minWidth: 0, boxSizing: 'border-box' },
  macroUnit:     { fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 },
  error:         { fontSize: '13px', color: 'var(--red)', margin: 0 },
  actions:       { display: 'flex', gap: '10px', marginTop: '4px' },
  secondaryBtn:  { flex: 1, padding: '14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-lg)', color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '500', cursor: 'pointer' },
  primaryBtn:    { flex: 2, padding: '14px', background: 'var(--text-primary)', border: 'none', borderRadius: 'var(--r-lg)', color: 'var(--text-inverse)', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
}
