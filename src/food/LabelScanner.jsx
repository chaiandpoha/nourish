import { useState, useRef } from 'react'
import { saveFood } from './FoodDB.js'
import { generateId } from '../auth/crypto.js'
import { AI } from '../config.js'

// ─── LabelScanner ─────────────────────────────────────────────────────────────
// 1. User picks photo or takes a picture
// 2. Image drawn to canvas — EXIF stripped
// 3. Sent to Claude Sonnet via /api/ai proxy
// 4. User reviews extracted macros
// 5. Saved to shared food database

export default function LabelScanner({ onSaved, onCancel, userId }) {
  const [screen,    setScreen]    = useState('pick')   // pick | review | saving
  const [extracted, setExtracted] = useState(null)
  const [edited,    setEdited]    = useState(null)
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const canvasRef = useRef(null)

  // ── Step 1 — pick image ────────────────────────────────────────────────────
  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setLoading(true)

    try {
      const base64 = await fileToBase64(file)
      await scanLabel(base64)
    } catch (err) {
      setError(err.message || 'Failed to scan label')
      setLoading(false)
    }
  }

  // ── Step 2 — strip EXIF + convert to base64 ────────────────────────────────
  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)

      img.onload = () => {
        const canvas = canvasRef.current
        const MAX    = 1200
        let { width, height } = img

        // Resize if too large
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX }
          else                { width  = Math.round(width  * MAX / height); height = MAX }
        }

        canvas.width  = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // JPEG at 85% — EXIF stripped automatically by canvas
        const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
        URL.revokeObjectURL(url)
        resolve(base64)
      }

      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = url
    })
  }

  // ── Step 3 — send to Claude Sonnet ────────────────────────────────────────
  async function scanLabel(base64) {
    const prompt = `Extract nutrition information from this food label. Return ONLY a JSON object with these exact fields:
{
  "name": "product name",
  "brand": "brand name or null",
  "per100g": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "sugar": number,
    "fat": number,
    "saturatedFat": number,
    "fibre": number,
    "sodium": number
  },
  "servingSize": number (in grams),
  "servingLabel": "e.g. 1 scoop, 1 cup"
}
All numeric values per 100g. If a value is not listed, use 0. Return only the JSON, no explanation.`

    const res = await fetch('/api/ai', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId:    userId || 'anonymous',
        type:      'vision',
        model:     AI.visionModel,
        maxTokens: 1000,
        messages: [{
          role:    'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            { type: 'text',  text: prompt }
          ]
        }]
      })
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'AI scan failed')
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not extract nutrition data from label')

    const parsed = JSON.parse(jsonMatch[0])
    setExtracted(parsed)
    setEdited({
      name:         parsed.name        || '',
      brand:        parsed.brand       || '',
      servingSize:  String(parsed.servingSize  || 100),
      servingLabel: parsed.servingLabel || '100g',
      calories:     String(parsed.per100g?.calories     || 0),
      protein:      String(parsed.per100g?.protein      || 0),
      carbs:        String(parsed.per100g?.carbs        || 0),
      fat:          String(parsed.per100g?.fat          || 0),
      fibre:        String(parsed.per100g?.fibre        || 0),
      sodium:       String(parsed.per100g?.sodium       || 0),
    })
    setScreen('review')
    setLoading(false)
  }

  // ── Step 4 — save to food database ────────────────────────────────────────
  async function handleSave() {
    if (!edited.name.trim()) { setError('Food name is required'); return }
    setScreen('saving')

    try {
      const food = {
        id:           generateId(),
        name:         edited.brand
          ? `${edited.name.trim()}, ${edited.brand.trim()}`
          : edited.name.trim(),
        source:       'scanned',
        barcode:      null,
        servingSize:  parseFloat(edited.servingSize)  || 100,
        servingLabel: edited.servingLabel || '100g',
        per100g: {
          calories:    parseFloat(edited.calories)    || 0,
          protein:     parseFloat(edited.protein)     || 0,
          carbs:       parseFloat(edited.carbs)       || 0,
          fat:         parseFloat(edited.fat)         || 0,
          fibre:       parseFloat(edited.fibre)       || 0,
          sodium:      parseFloat(edited.sodium)      || 0,
          sugar:       0,
          saturatedFat:0,
        },
        updatedAt: new Date().toISOString(),
      }

      await saveFood(food)
      onSaved?.(food)
    } catch (e) {
      setError(e.message)
      setScreen('review')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={st.container}>

      {/* Hidden canvas for EXIF stripping */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Header */}
      <div style={st.header}>
        <button style={st.backBtn} onClick={onCancel}>← Back</button>
        <span style={st.title}>Scan Label</span>
        <div style={{ width: 60 }} />
      </div>

      {/* Pick screen */}
      {screen === 'pick' && (
        <div style={st.pickScreen}>
          {!loading ? (
            <>
              <div style={st.scanIcon}>📷</div>
              <p style={st.pickTitle}>Photo a nutrition label</p>
              <p style={st.pickSub}>
                Take a photo or choose from your gallery.
                AI will extract the macros automatically.
              </p>

              <label style={{ ...st.cameraBtn, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                📸 Take Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                />
              </label>

              <label style={{ ...st.galleryBtn, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                🖼 Choose from Gallery
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                />
              </label>

              {error && <p style={st.error}>{error}</p>}
            </>
          ) : (
            <div style={st.loadingState}>
              <div style={st.spinner}>⏳</div>
              <p style={st.loadingText}>Reading nutrition label…</p>
              <p style={st.loadingSub}>This takes a few seconds</p>
            </div>
          )}
        </div>
      )}

      {/* Review screen */}
      {screen === 'review' && edited && (
        <div style={st.reviewScreen}>
          <p style={st.reviewNote}>
            Review and edit the extracted values before saving.
          </p>

          {/* Name + brand */}
          <div style={st.fieldGroup}>
            <div style={st.field}>
              <label style={st.label}>Food name</label>
              <input
                style={st.input}
                value={edited.name}
                onChange={e => setEdited(v => ({ ...v, name: e.target.value }))}
                placeholder="e.g. Whey Protein"
              />
            </div>
            <div style={st.field}>
              <label style={st.label}>Brand (optional)</label>
              <input
                style={st.input}
                value={edited.brand}
                onChange={e => setEdited(v => ({ ...v, brand: e.target.value }))}
                placeholder="e.g. Optimum Nutrition"
              />
            </div>
          </div>

          {/* Serving */}
          <div style={st.fieldRow}>
            <div style={st.field}>
              <label style={st.label}>Serving size (g)</label>
              <input
                style={st.input}
                type="number"
                inputMode="decimal"
                value={edited.servingSize}
                onChange={e => setEdited(v => ({ ...v, servingSize: e.target.value }))}
              />
            </div>
            <div style={st.field}>
              <label style={st.label}>Serving label</label>
              <input
                style={st.input}
                value={edited.servingLabel}
                onChange={e => setEdited(v => ({ ...v, servingLabel: e.target.value }))}
                placeholder="e.g. 1 scoop"
              />
            </div>
          </div>

          {/* Macros per 100g */}
          <div style={st.macroSection}>
            <div style={st.macroSectionLabel}>Per 100g</div>
            <div style={st.macroGrid}>
              {[
                { key: 'calories', label: 'Calories',  unit: 'kcal', color: 'var(--text-primary)'  },
                { key: 'protein',  label: 'Protein',   unit: 'g',    color: 'var(--macro-protein)' },
                { key: 'carbs',    label: 'Carbs',     unit: 'g',    color: 'var(--macro-carbs)'   },
                { key: 'fat',      label: 'Fat',       unit: 'g',    color: 'var(--macro-fat)'     },
                { key: 'fibre',    label: 'Fibre',     unit: 'g',    color: 'var(--macro-fibre)'   },
                { key: 'sodium',   label: 'Sodium',    unit: 'mg',   color: 'var(--text-secondary)'},
              ].map(({ key, label, unit, color }) => (
                <div key={key} style={st.macroField}>
                  <label style={{ ...st.label, color }}>{label}</label>
                  <div style={st.macroInputRow}>
                    <input
                      style={st.macroInput}
                      type="number"
                      inputMode="decimal"
                      value={edited[key]}
                      onChange={e => setEdited(v => ({ ...v, [key]: e.target.value }))}
                    />
                    <span style={st.macroUnit}>{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p style={st.error}>{error}</p>}

          <div style={st.actions}>
            <button style={st.rescanBtn} onClick={() => { setScreen('pick'); setError('') }}>
              Rescan
            </button>
            <button style={st.saveBtn} onClick={handleSave}>
              Save to Foods
            </button>
          </div>
        </div>
      )}

      {/* Saving screen */}
      {screen === 'saving' && (
        <div style={st.loadingState}>
          <div style={st.spinner}>💾</div>
          <p style={st.loadingText}>Saving to food database…</p>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '16px',
    paddingBottom: '8px',
  },
  header: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
  },
  backBtn: {
    background:      'none',
    border:          'none',
    color:           'var(--accent)',
    fontSize:        '15px',
    cursor:          'pointer',
    padding:         0,
    width:           60,
  },
  title: {
    fontSize:        '17px',
    fontWeight:      '600',
    color:           'var(--text-primary)',
    letterSpacing:   '-0.02em',
  },
  pickScreen: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             '12px',
    padding:         '24px 0',
  },
  scanIcon: {
    fontSize:        '56px',
    marginBottom:    '8px',
  },
  pickTitle: {
    fontSize:        '18px',
    fontWeight:      '600',
    color:           'var(--text-primary)',
    margin:          0,
    letterSpacing:   '-0.02em',
  },
  pickSub: {
    fontSize:        '14px',
    color:           'var(--text-secondary)',
    textAlign:       'center',
    margin:          '0 0 8px',
    lineHeight:      '1.5',
  },
  cameraBtn: {
    width:           '100%',
    padding:         '14px',
    background:      'var(--text-primary)',
    border:          'none',
    borderRadius:    'var(--r-lg)',
    color:           'var(--text-inverse)',
    fontSize:        '16px',
    fontWeight:      '600',
    cursor:          'pointer',
  },
  galleryBtn: {
    width:           '100%',
    padding:         '13px',
    background:      'transparent',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-lg)',
    color:           'var(--text-secondary)',
    fontSize:        '15px',
    fontWeight:      '500',
    cursor:          'pointer',
  },
  loadingState: {
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    gap:             '12px',
    padding:         '48px 0',
  },
  spinner: {
    fontSize:        '48px',
    animation:       'spin 1s linear infinite',
  },
  loadingText: {
    fontSize:        '16px',
    fontWeight:      '600',
    color:           'var(--text-primary)',
    margin:          0,
  },
  loadingSub: {
    fontSize:        '13px',
    color:           'var(--text-secondary)',
    margin:          0,
  },
  reviewScreen: {
    display:         'flex',
    flexDirection:   'column',
    gap:             '14px',
  },
  reviewNote: {
    fontSize:        '13px',
    margin:          0,
    padding:         '10px 14px',
    background:      'var(--accent-dim)',
    borderRadius:    'var(--r-md)',
    color:           'var(--accent)',
  },
  fieldGroup: {
    display:         'flex',
    flexDirection:   'column',
    gap:             '10px',
  },
  fieldRow: {
    display:         'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:             '10px',
  },
  field: {
    display:         'flex',
    flexDirection:   'column',
    gap:             '5px',
  },
  label: {
    fontSize:        '11px',
    fontWeight:      '600',
    color:           'var(--text-tertiary)',
    textTransform:   'uppercase',
    letterSpacing:   '0.07em',
  },
  input: {
    padding:         '11px 12px',
    background:      'var(--bg-elevated)',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-md)',
    fontSize:        '15px',
    color:           'var(--text-primary)',
    outline:         'none',
    width:           '100%',
    boxSizing:       'border-box',
  },
  macroSection: {
    background:      'var(--bg-surface)',
    border:          '0.5px solid var(--border-subtle)',
    borderRadius:    'var(--r-lg)',
    padding:         '14px',
    display:         'flex',
    flexDirection:   'column',
    gap:             '12px',
  },
  macroSectionLabel: {
    fontSize:        '11px',
    fontWeight:      '700',
    color:           'var(--text-tertiary)',
    textTransform:   'uppercase',
    letterSpacing:   '0.08em',
  },
  macroGrid: {
    display:         'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap:             '10px',
  },
  macroField: {
    display:         'flex',
    flexDirection:   'column',
    gap:             '4px',
  },
  macroInputRow: {
    display:         'flex',
    alignItems:      'center',
    gap:             '4px',
  },
  macroInput: {
    flex:            1,
    padding:         '9px 10px',
    background:      'var(--bg-elevated)',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-sm)',
    fontSize:        '15px',
    fontWeight:      '500',
    color:           'var(--text-primary)',
    outline:         'none',
    textAlign:       'right',
    minWidth:        0,
  },
  macroUnit: {
    fontSize:        '11px',
    color:           'var(--text-tertiary)',
    flexShrink:      0,
  },
  error: {
    fontSize:        '13px',
    color:           'var(--red)',
    margin:          0,
  },
  actions: {
    display:         'flex',
    gap:             '10px',
    marginTop:       '4px',
  },
  rescanBtn: {
    flex:            1,
    padding:         '14px',
    background:      'transparent',
    border:          '1px solid var(--border-default)',
    borderRadius:    'var(--r-lg)',
    color:           'var(--text-secondary)',
    fontSize:        '15px',
    fontWeight:      '500',
    cursor:          'pointer',
  },
  saveBtn: {
    flex:            2,
    padding:         '14px',
    background:      'var(--text-primary)',
    border:          'none',
    borderRadius:    'var(--r-lg)',
    color:           'var(--text-inverse)',
    fontSize:        '15px',
    fontWeight:      '600',
    cursor:          'pointer',
  },
}