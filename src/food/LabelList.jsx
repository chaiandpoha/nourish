import { useState, useEffect } from 'react'
import { db } from '../db/indexedDB.js'
import { saveFood, deleteFood, fetchHouseholdFoods } from './FoodDB.js'
import { MACRO_COLORS } from '../config.js'

export default function LabelList({ householdId }) {
  const [foods,    setFoods]    = useState([])
  const [editing,  setEditing]  = useState(null) // food id being edited
  const [form,     setForm]     = useState(null)  // current edit form state
  const [deleting, setDeleting] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [syncing,  setSyncing]  = useState(false)
  const [error,    setError]    = useState('')

  async function load() {
    const all = await db.foods.where('source').anyOf(['scanned', 'saved']).toArray()
    all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    setFoods(all)
  }

  useEffect(() => {
    async function syncThenLoad() {
      if (householdId) {
        setSyncing(true)
        await fetchHouseholdFoods(householdId).catch(() => {})
        setSyncing(false)
      }
      await load()
    }
    syncThenLoad()
  }, [householdId])

  function startEdit(food) {
    // Split "Name, Brand" back into name + brand if applicable
    const nameParts = food.name.split(', ')
    setForm({
      name:         nameParts[0] || food.name,
      brand:        nameParts.length > 1 ? nameParts.slice(1).join(', ') : '',
      servingSize:  String(food.servingSize || 100),
      servingLabel: food.servingLabel || '',
      calories:     String(food.per100g?.calories  || 0),
      protein:      String(food.per100g?.protein   || 0),
      carbs:        String(food.per100g?.carbs     || 0),
      fat:          String(food.per100g?.fat       || 0),
      fibre:        String(food.per100g?.fibre     || 0),
      sodium:       String(food.per100g?.sodium    || 0),
    })
    setEditing(food.id)
    setError('')
  }

  function cancelEdit() {
    setEditing(null)
    setForm(null)
    setError('')
  }

  async function handleSave(food) {
    if (!form.name.trim()) { setError('Food name is required'); return }
    setSaving(true)
    try {
      const updated = {
        ...food,
        name: form.brand.trim()
          ? `${form.name.trim()}, ${form.brand.trim()}`
          : form.name.trim(),
        servingSize:  parseFloat(form.servingSize)  || 100,
        servingLabel: form.servingLabel || `${parseFloat(form.servingSize) || 100}g`,
        per100g: {
          ...food.per100g,
          calories: parseFloat(form.calories) || 0,
          protein:  parseFloat(form.protein)  || 0,
          carbs:    parseFloat(form.carbs)    || 0,
          fat:      parseFloat(form.fat)      || 0,
          fibre:    parseFloat(form.fibre)    || 0,
          sodium:   parseFloat(form.sodium)   || 0,
        },
        dirty:     1,
        updatedAt: new Date().toISOString(),
      }
      await saveFood(updated, householdId)
      cancelEdit()
      load()
    } catch (e) {
      setError('Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    await deleteFood(id, householdId)
    setDeleting(null)
    load()
  }

  if (syncing && foods.length === 0) {
    return (
      <div style={s.empty}>
        <p style={s.emptyTitle}>Syncing…</p>
        <p style={s.emptySub}>Loading shared household labels</p>
      </div>
    )
  }

  if (foods.length === 0) {
    return (
      <div style={s.empty}>
        <p style={s.emptyTitle}>No saved labels yet</p>
        <p style={s.emptySub}>Scan a nutrition label or use the barcode scanner to save foods here</p>
      </div>
    )
  }

  return (
    <div style={s.container}>
      {foods.map(food => {
        const isEditing  = editing === food.id
        const isDeleting = deleting === food.id
        const srv = food.servingSize || 100
        const cal = Math.round((food.per100g?.calories || 0) * srv / 100)
        const pro = Math.round((food.per100g?.protein  || 0) * srv / 100)

        return (
          <div key={food.id} style={s.card}>
            {isEditing && form ? (
              <EditForm
                form={form}
                setForm={setForm}
                error={error}
                saving={saving}
                onSave={() => handleSave(food)}
                onCancel={cancelEdit}
              />
            ) : (
              <>
                <div style={s.cardTop}>
                  <div style={s.cardInfo}>
                    <span style={s.cardName}>{food.name}</span>
                    <span style={s.cardMeta}>
                      {food.servingLabel || `${Math.round(srv)}g`} · {cal} kcal · {pro}g P
                      <span style={{ color: food.source === 'scanned' ? 'var(--accent)' : 'var(--text-tertiary)', marginLeft: 4 }}>
                        {food.source === 'scanned' ? '· Scanned' : '· Saved'}
                      </span>
                    </span>
                  </div>
                  <div style={s.cardActions}>
                    {isDeleting ? (
                      <>
                        <button style={s.confirmBtn} onClick={() => handleDelete(food.id)}>Delete</button>
                        <button style={s.cancelBtn}  onClick={() => setDeleting(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button style={s.editBtn}   onClick={() => startEdit(food)}>Edit</button>
                        <button style={s.deleteBtn} onClick={() => setDeleting(food.id)}>✕</button>
                      </>
                    )}
                  </div>
                </div>
                <div style={s.macroRow}>
                  {[
                    { key: 'calories', label: 'kcal', val: Math.round((food.per100g?.calories || 0)) },
                    { key: 'protein',  label: 'P',    val: food.per100g?.protein  || 0 },
                    { key: 'carbs',    label: 'C',    val: food.per100g?.carbs    || 0 },
                    { key: 'fat',      label: 'F',    val: food.per100g?.fat      || 0 },
                  ].map(({ key, label, val }) => (
                    <div key={key} style={s.macroCell}>
                      <span style={{ ...s.macroVal, color: MACRO_COLORS[key] }}>{val}</span>
                      <span style={s.macroLabel}>{label} /100g</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function EditForm({ form, setForm, error, saving, onSave, onCancel }) {
  const f = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div style={s.editForm}>
      <div style={s.fieldRow}>
        <div style={s.field}>
          <label style={s.fieldLabel}>Name</label>
          <input style={s.input} value={form.name} onChange={e => f('name', e.target.value)} placeholder="Food name" />
        </div>
        <div style={s.field}>
          <label style={s.fieldLabel}>Brand</label>
          <input style={s.input} value={form.brand} onChange={e => f('brand', e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div style={s.fieldRow}>
        <div style={s.field}>
          <label style={s.fieldLabel}>Serving size (g)</label>
          <input style={s.input} type="number" inputMode="decimal" value={form.servingSize} onChange={e => f('servingSize', e.target.value)} />
        </div>
        <div style={s.field}>
          <label style={s.fieldLabel}>Serving label</label>
          <input style={s.input} value={form.servingLabel} onChange={e => f('servingLabel', e.target.value)} placeholder="e.g. 1 scoop" />
        </div>
      </div>

      <div style={s.macroSection}>
        <span style={s.macroSectionLabel}>Per 100g</span>
        <div style={s.macroEditGrid}>
          {[
            { key: 'calories', label: 'Calories', unit: 'kcal', color: 'var(--text-primary)'  },
            { key: 'protein',  label: 'Protein',  unit: 'g',    color: 'var(--macro-protein)' },
            { key: 'carbs',    label: 'Carbs',    unit: 'g',    color: 'var(--macro-carbs)'   },
            { key: 'fat',      label: 'Fat',      unit: 'g',    color: 'var(--macro-fat)'     },
            { key: 'fibre',    label: 'Fibre',    unit: 'g',    color: 'var(--macro-fibre)'   },
            { key: 'sodium',   label: 'Sodium',   unit: 'mg',   color: 'var(--text-secondary)'},
          ].map(({ key, label, unit, color }) => (
            <div key={key} style={s.macroEditField}>
              <label style={{ ...s.fieldLabel, color }}>{label}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input style={{ ...s.input, flex: 1, textAlign: 'right' }} type="number" inputMode="decimal"
                  value={form[key]} onChange={e => f(key, e.target.value)} />
                <span style={s.unit}>{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p style={s.error}>{error}</p>}
      <div style={s.editActions}>
        <button style={s.cancelBtn2} onClick={onCancel}>Cancel</button>
        <button style={s.saveBtn} onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

const s = {
  container:       { display: 'flex', flexDirection: 'column', gap: '8px' },
  empty:           { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 0', gap: '6px' },
  emptyTitle:      { fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 },
  emptySub:        { fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center', margin: 0, lineHeight: '1.5', maxWidth: '260px' },
  card:            { background: 'var(--bg-surface)', border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' },
  cardTop:         { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' },
  cardInfo:        { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 },
  cardName:        { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardMeta:        { fontSize: '12px', color: 'var(--text-tertiary)' },
  cardActions:     { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
  editBtn:         { padding: '5px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  deleteBtn:       { width: '28px', height: '28px', background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  confirmBtn:      { padding: '5px 10px', background: 'var(--red)', border: 'none', borderRadius: 'var(--r-md)', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  cancelBtn:       { padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  macroRow:        { display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', overflow: 'hidden' },
  macroCell:       { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 4px', gap: '1px' },
  macroVal:        { fontSize: '13px', fontWeight: '600', fontFamily: 'var(--font-mono)' },
  macroLabel:      { fontSize: '9px', color: 'var(--text-tertiary)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.03em' },
  editForm:        { display: 'flex', flexDirection: 'column', gap: '12px' },
  fieldRow:        { display: 'flex', gap: '10px' },
  field:           { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
  fieldLabel:      { fontSize: '11px', fontWeight: '600', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  input:           { padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)', fontSize: '14px', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' },
  macroSection:    { display: 'flex', flexDirection: 'column', gap: '8px' },
  macroSectionLabel:{ fontSize: '11px', fontWeight: '700', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  macroEditGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' },
  macroEditField:  { display: 'flex', flexDirection: 'column', gap: '4px' },
  unit:            { fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 },
  error:           { fontSize: '13px', color: 'var(--red)', margin: 0 },
  editActions:     { display: 'flex', gap: '8px' },
  cancelBtn2:      { flex: 1, padding: '11px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-lg)', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500', cursor: 'pointer' },
  saveBtn:         { flex: 2, padding: '11px', background: 'var(--text-primary)', border: 'none', borderRadius: 'var(--r-lg)', color: 'var(--text-inverse)', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
}
