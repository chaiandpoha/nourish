import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { getMeasurements, saveMeasurement } from '../db/db.js'
import { localDate } from '../log/DayLog.jsx'

const FIELDS = [
  { key: 'waist',  label: 'Waist'  },
  { key: 'chest',  label: 'Chest'  },
  { key: 'arms',   label: 'Arms'   },
  { key: 'hips',   label: 'Hips'   },
  { key: 'thighs', label: 'Thighs' },
]

export default function Measurements() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [form,    setForm]    = useState({ waist:'', chest:'', arms:'', hips:'', thighs:'' })
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const today = localDate()
  const [entryDate, setEntryDate] = useState(today)

  useEffect(() => {
    if (!user) return
    load()
  }, [user?.id])

  useEffect(() => {
    const match = entries.find(e => e.date.startsWith(entryDate.slice(0, 7)))
    setForm(match ? {
      waist:  String(match.waist  || ''),
      chest:  String(match.chest  || ''),
      arms:   String(match.arms   || ''),
      hips:   String(match.hips   || ''),
      thighs: String(match.thighs || ''),
    } : { waist:'', chest:'', arms:'', hips:'', thighs:'' })
  }, [entryDate, entries])

  async function load() {
    const data = await getMeasurements(user.id)
    setEntries([...data].reverse()) // most recent first
  }

  async function handleSave() {
    if (!user) return
    const entry = {}
    for (const { key } of FIELDS) {
      const val = parseFloat(form[key])
      if (!isNaN(val) && val > 0) entry[key] = val
    }
    if (!Object.keys(entry).length) return
    setSaving(true)
    try {
      await saveMeasurement(user.id, { ...entry, date: entryDate })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const hasAny = FIELDS.some(f => form[f.key] !== '')

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={styles.sectionTitle}>Log Measurements (cm)</div>
          <input
            type="date"
            value={entryDate}
            max={today}
            onChange={e => setEntryDate(e.target.value)}
            style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-sm)', padding:'4px 8px', fontSize:'12px', color:'var(--text-secondary)', cursor:'pointer' }}
          />
        </div>
        <div style={styles.formGrid}>
          {FIELDS.map(({ key, label }) => (
            <div key={key} style={styles.fieldRow}>
              <label style={styles.fieldLabel}>{label}</label>
              <input
                style={styles.fieldInput}
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              />
              <span style={styles.unit}>cm</span>
            </div>
          ))}
        </div>
        <button
          style={{
            ...styles.saveBtn,
            opacity: (!hasAny || saving) ? 0.5 : 1,
            background: saved ? 'var(--accent)' : 'var(--text-primary)',
          }}
          onClick={handleSave}
          disabled={!hasAny || saving}
        >
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Measurements'}
        </button>
      </div>

      {entries.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>History</div>
          <div style={styles.historyTable}>
            <div style={styles.tableHeader}>
              <span style={styles.dateCol}>Date</span>
              {FIELDS.map(({ key, label }) => (
                <span key={key} style={styles.valCol}>{label}</span>
              ))}
            </div>
            {entries.map((entry, i) => {
              const prev = entries[i + 1]
              return (
                <div key={entry.id || entry.date} style={styles.tableRow}>
                  <span style={styles.dateCol}>{formatDate(entry.date)}</span>
                  {FIELDS.map(({ key }) => {
                    const val  = entry[key]
                    const pval = prev?.[key]
                    const delta = (val != null && pval != null) ? val - pval : null
                    return (
                      <span key={key} style={styles.valCol}>
                        {val != null ? val : '—'}
                        {delta != null && delta !== 0 && (
                          <span style={{ fontSize:'10px', color: delta < 0 ? 'var(--accent)' : 'var(--red)', marginLeft:'2px' }}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                          </span>
                        )}
                      </span>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div style={styles.empty}>
          No measurements yet. Log your first entry above.
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', {
    day:   'numeric',
    month: 'short',
    year:  '2-digit',
  })
}

const styles = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '16px',
    paddingTop:    '4px',
  },
  section: {
    background:    'var(--bg-surface)',
    border:        '0.5px solid var(--border-subtle)',
    borderRadius:  'var(--r-xl)',
    padding:       '16px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '12px',
  },
  sectionTitle: {
    fontSize:      '13px',
    fontWeight:    '600',
    color:         'var(--text-secondary)',
    letterSpacing: '0.02em',
  },
  formGrid: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },
  fieldRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        '10px',
  },
  fieldLabel: {
    fontSize:   '14px',
    fontWeight: '500',
    color:      'var(--text-primary)',
    width:      '56px',
    flexShrink: 0,
  },
  fieldInput: {
    flex:         1,
    padding:      '8px 10px',
    fontSize:     '15px',
    fontFamily:   'var(--font-mono)',
    borderRadius: 'var(--r-md)',
    border:       '1px solid var(--border-subtle)',
    background:   'var(--bg-elevated)',
    color:        'var(--text-primary)',
    outline:      'none',
  },
  unit: {
    fontSize:   '13px',
    color:      'var(--text-tertiary)',
    flexShrink: 0,
    width:      '24px',
  },
  saveBtn: {
    padding:       '11px',
    border:        'none',
    borderRadius:  'var(--r-lg)',
    color:         'var(--text-inverse)',
    fontSize:      '14px',
    fontWeight:    '600',
    cursor:        'pointer',
    transition:    'background 0.2s ease, opacity 0.2s ease',
  },
  historyTable: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '0',
    overflowX:     'auto',
  },
  tableHeader: {
    display:       'flex',
    padding:       '6px 0',
    borderBottom:  '0.5px solid var(--border-subtle)',
    marginBottom:  '2px',
  },
  tableRow: {
    display:       'flex',
    padding:       '8px 0',
    borderBottom:  '0.5px solid var(--border-subtle)',
  },
  dateCol: {
    width:      '70px',
    flexShrink: 0,
    fontSize:   '12px',
    fontWeight: '500',
    color:      'var(--text-tertiary)',
  },
  valCol: {
    flex:         1,
    fontSize:     '13px',
    fontWeight:   '600',
    fontFamily:   'var(--font-mono)',
    color:        'var(--text-primary)',
    textAlign:    'center',
    minWidth:     '48px',
  },
  empty: {
    textAlign:  'center',
    fontSize:   '14px',
    color:      'var(--text-tertiary)',
    padding:    '24px 0',
  },
}
