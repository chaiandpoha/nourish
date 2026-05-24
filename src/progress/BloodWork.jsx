import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { generateId } from '../auth/crypto.js'

const DEFAULT_MARKERS = [
  { name: 'Vitamin D',      unit: 'ng/mL', low: 30,   high: 100  },
  { name: 'B12',            unit: 'pg/mL', low: 200,  high: 900  },
  { name: 'Hemoglobin',     unit: 'g/dL',  low: 13.5, high: 17.5 },
  { name: 'Ferritin',       unit: 'ng/mL', low: 30,   high: 400  },
  { name: 'TSH',            unit: 'mIU/L', low: 0.4,  high: 4.0  },
  { name: 'Total Cholesterol', unit: 'mg/dL', low: 0, high: 200  },
  { name: 'HDL',            unit: 'mg/dL', low: 40,   high: 999  },
  { name: 'LDL',            unit: 'mg/dL', low: 0,    high: 100  },
  { name: 'Triglycerides',  unit: 'mg/dL', low: 0,    high: 150  },
  { name: 'Fasting Glucose',unit: 'mg/dL', low: 70,   high: 100  },
  { name: 'HbA1c',          unit: '%',     low: 0,    high: 5.7  },
  { name: 'Creatinine',     unit: 'mg/dL', low: 0.7,  high: 1.3  },
  { name: 'Testosterone',   unit: 'ng/dL', low: 300,  high: 1000 },
  { name: 'Cortisol',       unit: 'μg/dL', low: 6,    high: 23   },
  { name: 'Iron',           unit: 'μg/dL', low: 60,   high: 170  },
]

export default function BloodWork() {
  const [entries,    setEntries]    = useState([])
  const [screen,     setScreen]     = useState('list') // list | add | scan
  const [form,       setForm]       = useState({ marker:'', value:'', unit:'', low:'', high:'', date: new Date().toISOString().slice(0,10) })
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [scanning,   setScanning]   = useState(false)
  const [markerQuery, setMarkerQuery] = useState('')
  const { user } = useAuth()

  useEffect(() => { loadEntries() }, [user])

  async function loadEntries() {
    if (!user) return
    const all = await db.bloodWork
      .where('userId').equals(user.id)
      .toArray()
    setEntries(all.sort((a, b) => b.date.localeCompare(a.date)))
  }

  async function handleSave() {
    if (!form.marker.trim() || !form.value) {
      setError('Marker name and value are required')
      return
    }
    setSaving(true)
    try {
      await db.bloodWork.add({
        id:        generateId(),
        userId:    user.id,
        date:      form.date,
        marker:    form.marker.trim(),
        value:     parseFloat(form.value),
        unit:      form.unit.trim(),
        low:       parseFloat(form.low) || null,
        high:      parseFloat(form.high) || null,
        dirty:     1,
        updatedAt: new Date().toISOString(),
      })
      setForm({ marker:'', value:'', unit:'', low:'', high:'', date: new Date().toISOString().slice(0,10) })
      setScreen('list')
      loadEntries()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    await db.bloodWork.delete(id)
    loadEntries()
  }

  function selectMarker(m) {
    setForm(f => ({ ...f, marker: m.name, unit: m.unit, low: String(m.low), high: String(m.high) }))
    setMarkerQuery('')
  }

  function getStatus(entry) {
    if (!entry.low && !entry.high) return 'unknown'
    if (entry.low  && entry.value < entry.low)  return 'low'
    if (entry.high && entry.value > entry.high) return 'high'
    return 'normal'
  }

  // Group entries by marker
  const byMarker = {}
  for (const entry of entries) {
    if (!byMarker[entry.marker]) byMarker[entry.marker] = []
    byMarker[entry.marker].push(entry)
  }

  if (screen === 'add') {
    const filteredMarkers = DEFAULT_MARKERS.filter(m =>
      m.name.toLowerCase().includes(markerQuery.toLowerCase())
    )

    return (
      <div style={s.container}>
        <button style={s.backBtn} onClick={() => setScreen('list')}>← Back</button>
        <h2 style={s.title}>Add Blood Work</h2>

        {/* Date */}
        <div style={s.field}>
          <label style={s.label}>Date</label>
          <input
            style={s.input}
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          />
        </div>

        {/* Marker search */}
        <div style={s.field}>
          <label style={s.label}>Marker</label>
          <input
            style={s.input}
            placeholder="Search or type marker name…"
            value={form.marker || markerQuery}
            onChange={e => {
              setMarkerQuery(e.target.value)
              setForm(f => ({ ...f, marker: e.target.value }))
            }}
          />
          {markerQuery.length > 0 && (
            <div style={s.suggestions}>
              {filteredMarkers.map(m => (
                <button
                  key={m.name}
                  style={s.suggestion}
                  onClick={() => selectMarker(m)}
                >
                  <span style={s.suggName}>{m.name}</span>
                  <span style={s.suggUnit}>{m.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Value + Unit */}
        <div style={s.row}>
          <div style={{ ...s.field, flex: 2 }}>
            <label style={s.label}>Value</label>
            <input
              style={s.input}
              type="number"
              inputMode="decimal"
              placeholder="0.0"
              value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
            />
          </div>
          <div style={{ ...s.field, flex: 1 }}>
            <label style={s.label}>Unit</label>
            <input
              style={s.input}
              placeholder="mg/dL"
              value={form.unit}
              onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
            />
          </div>
        </div>

        {/* Reference range */}
        <div style={s.row}>
          <div style={{ ...s.field, flex: 1 }}>
            <label style={s.label}>Low</label>
            <input
              style={s.input}
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={form.low}
              onChange={e => setForm(f => ({ ...f, low: e.target.value }))}
            />
          </div>
          <div style={{ ...s.field, flex: 1 }}>
            <label style={s.label}>High</label>
            <input
              style={s.input}
              type="number"
              inputMode="decimal"
              placeholder="100"
              value={form.high}
              onChange={e => setForm(f => ({ ...f, high: e.target.value }))}
            />
          </div>
        </div>

        {error && <p style={s.error}>{error}</p>}

        <button
          style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Result'}
        </button>
      </div>
    )
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h2 style={s.title}>Blood Work</h2>
        <button style={s.addBtn} onClick={() => setScreen('add')}>+ Add</button>
      </div>

      {entries.length === 0 && (
        <div style={s.empty}>
          <div style={s.emptyIcon}>🩸</div>
          <p style={s.emptyText}>No blood work logged yet</p>
          <p style={s.emptySub}>Track your lab results over time</p>
          <button style={s.createBtn} onClick={() => setScreen('add')}>
            Add First Result
          </button>
        </div>
      )}

      {Object.entries(byMarker).map(([marker, markerEntries]) => {
        const latest = markerEntries[0]
        const status = getStatus(latest)
        const statusColor = {
          normal:  'var(--accent)',
          low:     'var(--amber)',
          high:    'var(--red)',
          unknown: 'var(--text-tertiary)',
        }[status]

        return (
          <div key={marker} style={s.card}>
            <div style={s.cardHeader}>
              <div>
                <div style={s.markerName}>{marker}</div>
                <div style={s.markerDate}>
                  {new Date(latest.date + 'T00:00:00').toLocaleDateString('en-IN', {
                    day:'numeric', month:'short', year:'numeric'
                  })}
                </div>
              </div>
              <div style={s.markerRight}>
                <span style={{ ...s.markerVal, color: statusColor }}>
                  {latest.value} {latest.unit}
                </span>
                <span style={{ ...s.markerStatus, color: statusColor }}>
                  {status === 'normal' ? '✓ Normal' :
                   status === 'low'    ? '↓ Low'    :
                   status === 'high'   ? '↑ High'   : '—'}
                </span>
              </div>
            </div>

            {latest.low && latest.high && (
              <div style={s.rangeRow}>
                <span style={s.rangeLabel}>
                  Range: {latest.low} – {latest.high} {latest.unit}
                </span>
              </div>
            )}

            {markerEntries.length > 1 && (
              <div style={s.histRow}>
                {markerEntries.slice(0, 4).map((e, i) => (
                  <div key={i} style={s.histItem}>
                    <span style={s.histVal}>{e.value}</span>
                    <span style={s.histDate}>
                      {new Date(e.date + 'T00:00:00').toLocaleDateString('en-IN', { month:'short', day:'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              style={s.deleteBtn}
              onClick={() => handleDelete(latest.id)}
            >
              Delete latest
            </button>
          </div>
        )
      })}
    </div>
  )
}

const s = {
  container:   { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'24px' },
  header:      { display:'flex', alignItems:'center', justifyContent:'space-between' },
  title:       { fontSize:'22px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', margin:0 },
  addBtn:      { padding:'7px 14px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  backBtn:     { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0, alignSelf:'flex-start' },
  empty:       { display:'flex', flexDirection:'column', alignItems:'center', padding:'48px 16px', gap:'8px' },
  emptyIcon:   { fontSize:'48px', marginBottom:'8px' },
  emptyText:   { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', margin:0 },
  emptySub:    { fontSize:'14px', color:'var(--text-secondary)', textAlign:'center', margin:0 },
  createBtn:   { marginTop:'8px', padding:'12px 24px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'15px', fontWeight:'600', cursor:'pointer' },
  card:        { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'10px' },
  cardHeader:  { display:'flex', alignItems:'flex-start', justifyContent:'space-between' },
  markerName:  { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.01em' },
  markerDate:  { fontSize:'12px', color:'var(--text-tertiary)', marginTop:'2px' },
  markerRight: { display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'3px' },
  markerVal:   { fontSize:'20px', fontWeight:'300', letterSpacing:'-0.02em', fontFamily:'var(--font-mono)' },
  markerStatus:{ fontSize:'11px', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.05em' },
  rangeRow:    { padding:'6px 10px', background:'var(--bg-elevated)', borderRadius:'var(--r-md)' },
  rangeLabel:  { fontSize:'12px', color:'var(--text-tertiary)' },
  histRow:     { display:'flex', gap:'12px' },
  histItem:    { display:'flex', flexDirection:'column', alignItems:'center', gap:'2px' },
  histVal:     { fontSize:'14px', fontWeight:'600', color:'var(--text-primary)', fontFamily:'var(--font-mono)' },
  histDate:    { fontSize:'10px', color:'var(--text-tertiary)' },
  deleteBtn:   { padding:'6px 12px', background:'rgba(200,80,64,0.08)', border:'none', borderRadius:'var(--r-md)', color:'var(--red)', fontSize:'12px', fontWeight:'600', cursor:'pointer', alignSelf:'flex-start' },
  field:       { display:'flex', flexDirection:'column', gap:'5px' },
  row:         { display:'flex', gap:'10px' },
  label:       { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.07em' },
  input:       { padding:'11px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'15px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box' },
  suggestions: { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-md)', overflow:'hidden', marginTop:'4px' },
  suggestion:  { display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', padding:'10px 14px', background:'transparent', border:'none', borderBottom:'0.5px solid var(--border-subtle)', cursor:'pointer', textAlign:'left' },
  suggName:    { fontSize:'14px', color:'var(--text-primary)' },
  suggUnit:    { fontSize:'12px', color:'var(--text-tertiary)' },
  saveBtn:     { padding:'14px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'15px', fontWeight:'600', cursor:'pointer' },
  error:       { fontSize:'13px', color:'var(--red)', margin:0 },
}