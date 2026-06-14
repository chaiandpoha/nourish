import { useState } from 'react'
import { saveFood } from './FoodDB.js'
import { generateId } from '../auth/crypto.js'

export default function ManualFoodCreator({ onSaved, onCancel, householdId, prefillName = '' }) {
  const [name,         setName]         = useState(prefillName)
  const [brand,        setBrand]        = useState('')
  const [servingSize,  setServingSize]  = useState('100')
  const [servingLabel, setServingLabel] = useState('')
  const [macroMode,    setMacroMode]    = useState('serving') // 'serving' | 'per100'
  const [macros, setMacros] = useState({ calories: '', protein: '', carbs: '', fat: '', fibre: '', sodium: '' })
  const [error,  setError]  = useState('')
  const [saving, setSaving] = useState(false)

  function setMacro(key, val) {
    setMacros(m => ({ ...m, [key]: val }))
  }

  async function handleSave(addToLog) {
    if (!name.trim()) { setError('Food name is required'); return }
    const srv = parseFloat(servingSize) || 100
    if (srv <= 0) { setError('Serving size must be greater than 0'); return }
    setError('')
    setSaving(true)

    // If per-serving mode: convert to per-100g. If per-100g mode: use directly.
    const toP100 = v => macroMode === 'per100'
      ? Math.round((parseFloat(v) || 0) * 10) / 10
      : Math.round((parseFloat(v) || 0) / srv * 100 * 10) / 10

    const food = {
      id:           generateId(),
      name:         brand.trim() ? `${name.trim()}, ${brand.trim()}` : name.trim(),
      source:       'saved',
      barcode:      null,
      tags:         [],
      servingSize:  srv,
      servingLabel: servingLabel.trim() || `${Math.round(srv)}g`,
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

  const srv = parseFloat(servingSize) || 100
  const macroCardLabel = macroMode === 'per100'
    ? 'Per 100g'
    : `Per serving · ${Math.round(srv)}g`

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
            placeholder="e.g. Greek Yogurt"
            autoFocus={!prefillName}
          />
        </div>
        <div style={st.field}>
          <label style={st.label}>Brand (optional)</label>
          <input
            style={st.input}
            value={brand}
            onChange={e => setBrand(e.target.value)}
            placeholder="e.g. Chobani"
          />
        </div>
      </div>

      {/* Serving */}
      <div style={st.row}>
        <div style={st.field}>
          <label style={st.label}>Serving size (g)</label>
          <input
            style={st.input}
            type="number"
            inputMode="decimal"
            value={servingSize}
            onChange={e => setServingSize(e.target.value)}
          />
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

      {/* Macro mode toggle */}
      <div style={st.toggle}>
        <button
          style={{ ...st.toggleBtn, ...(macroMode === 'serving' ? st.toggleActive : {}) }}
          onClick={() => setMacroMode('serving')}
        >
          Per serving
        </button>
        <button
          style={{ ...st.toggleBtn, ...(macroMode === 'per100' ? st.toggleActive : {}) }}
          onClick={() => setMacroMode('per100')}
        >
          Per 100g
        </button>
      </div>

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
  toggle:        { display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', padding: '3px', gap: '3px' },
  toggleBtn:     { flex: 1, padding: '8px', background: 'none', border: 'none', borderRadius: 'var(--r-sm)', fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)', cursor: 'pointer' },
  toggleActive:  { background: 'var(--bg-surface)', color: 'var(--text-primary)', fontWeight: '600', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' },
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
