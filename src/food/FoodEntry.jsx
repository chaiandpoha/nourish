import { useState, useEffect, useRef } from 'react'
import { calcMacros, calcBatchMacros, servingsToGrams, gramsToServings } from './macroCalc.js'
import { MACRO_COLORS } from '../config.js'

// ─── FoodEntry ────────────────────────────────────────────────────────────────
// Gram input + serving toggle + live macro preview
// Used inside MealEntry bottom sheet when user selects a food

export default function FoodEntry({ food, batch, initialGrams, onAdd, onCancel }) {
  const item          = food || batch
  const isBatch       = !!batch
  const defaultGrams  = initialGrams || item?.servingSize || 100

  const [grams,       setGrams]       = useState(String(defaultGrams))
  const [useServings, setUseServings] = useState(false)
  const [servings,    setServings]    = useState(String(gramsToServings(item, defaultGrams)))
  const [listening,   setListening]   = useState(false)
  const [error,       setError]       = useState('')
  const recogRef = useRef(null)

  const parsedGrams = parseFloat(grams) || 0

  const macros = isBatch
    ? calcBatchMacros(batch, parsedGrams)
    : calcMacros(food, parsedGrams)

  // Sync grams ↔ servings
  useEffect(() => {
    if (useServings) {
      const g = servingsToGrams(item, parseFloat(servings) || 0)
      setGrams(String(g))
    }
  }, [servings, useServings])

  useEffect(() => {
    if (!useServings) {
      const s = gramsToServings(item, parsedGrams)
      setServings(String(s))
    }
  }, [grams, useServings])

  // ── Voice input ────────────────────────────────────────────────────────────
  function handleVoice() {
    if (listening) {
      recogRef.current?.abort()
      recogRef.current = null
      setListening(false)
      return
    }
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Voice input not supported on this browser')
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SR()
    recognition.lang = 'en-IN'
    recognition.interimResults = false
    recogRef.current = recognition

    recognition.onstart  = () => setListening(true)
    recognition.onend    = () => { setListening(false); recogRef.current = null }
    recognition.onerror  = () => { setListening(false); recogRef.current = null; setError('Voice error — try again') }

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript.toLowerCase()
      const numMatch = transcript.match(/(\d+\.?\d*)/)
      if (numMatch) {
        setGrams(numMatch[1])
        setUseServings(false)
      }
    }
    recognition.start()
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  function handleAdd() {
    if (parsedGrams <= 0) { setError('Enter a valid amount'); return }

    const entry = {
      foodId:    isBatch ? null        : item.id,
      batchId:   isBatch ? item.id     : null,
      name:      item.name,
      grams:     parsedGrams,
      ...macros,
      source:    isBatch ? 'batch'     : (item.source || 'usda'),
    }
    onAdd(entry)
  }

  const hasServingLabel = item?.servingLabel && item?.servingSize

  return (
    <div style={styles.container}>

      {/* Food name */}
      <div style={styles.foodName}>{item?.name}</div>
      {isBatch && <div style={styles.batchTag}>From batch</div>}

      {/* Amount input */}
      <div style={styles.inputSection}>

        {hasServingLabel && (
          <div style={styles.toggle}>
            <button
              style={{ ...styles.toggleBtn, ...(! useServings ? styles.toggleActive : {}) }}
              onClick={() => setUseServings(false)}
            >
              Grams
            </button>
            <button
              style={{ ...styles.toggleBtn, ...(useServings ? styles.toggleActive : {}) }}
              onClick={() => setUseServings(true)}
            >
              {item.servingLabel}
            </button>
          </div>
        )}

        <div style={styles.inputRow}>
          <input
            style={styles.amountInput}
            type="number"
            inputMode="decimal"
            value={useServings ? servings : grams}
            onChange={e => {
              useServings
                ? setServings(e.target.value)
                : setGrams(e.target.value)
            }}
            autoFocus
          />
          <span style={styles.unit}>
            {useServings ? (item?.servingLabel || 'serving') : 'g'}
          </span>

          {/* Voice button */}
          <button
            style={{ ...styles.voiceBtn, ...(listening ? styles.voiceBtnActive : {}) }}
            onClick={handleVoice}
            title={listening ? 'Stop listening' : 'Voice input'}
            aria-label={listening ? 'Stop listening' : 'Voice input'}
          >
            {listening ? '⏹' : '🎙'}
          </button>
        </div>
        {listening && (
          <p style={{ fontSize:'12px', color:'var(--text-tertiary)', margin:'4px 0 0', textAlign:'center' }}>
            Listening… tap <strong>⏹</strong> to stop
          </p>
        )}

        {useServings && item?.servingSize && (
          <div style={styles.gramsEquiv}>
            = {parsedGrams}g
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </div>

      {/* Macro preview */}
      <div style={styles.macroGrid}>
        {[
          { key: 'calories', label: 'kcal',    val: macros.calories },
          { key: 'protein',  label: 'Protein', val: macros.protein  },
          { key: 'carbs',    label: 'Carbs',   val: macros.carbs    },
          { key: 'fat',      label: 'Fat',     val: macros.fat      },
          { key: 'fibre',    label: 'Fibre',   val: macros.fibre    },
        ].map(({ key, label, val }) => (
          <div key={key} style={styles.macroCell}>
            <div style={{ ...styles.macroVal, color: MACRO_COLORS[key] }}>
              {val}
            </div>
            <div style={styles.macroLabel}>{label}</div>
          </div>
        ))}
      </div>

      {/* Per 100g reference */}
      <div style={styles.per100}>
        Per 100g — {item?.per100g?.calories || item?.macrosPer100g?.calories || 0} kcal ·{' '}
        {item?.per100g?.protein  || item?.macrosPer100g?.protein  || 0}g P ·{' '}
        {item?.per100g?.carbs    || item?.macrosPer100g?.carbs    || 0}g C ·{' '}
        {item?.per100g?.fat      || item?.macrosPer100g?.fat      || 0}g F
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button style={styles.addBtn}    onClick={handleAdd}>Add to log</button>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '16px',
    paddingBottom: '8px',
  },
  foodName: {
    fontSize:      '18px',
    fontWeight:    '600',
    color:         'var(--text-primary)',
    letterSpacing: '-0.02em',
  },
  batchTag: {
    display:       'inline-block',
    fontSize:      '11px',
    fontWeight:    '600',
    background:    'var(--accent-dim)',
    color:         'var(--accent)',
    padding:       '3px 10px',
    borderRadius:  'var(--r-full)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    marginTop:     '-8px',
  },
  inputSection: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '8px',
  },
  toggle: {
    display:        'flex',
    background:     'var(--bg-elevated)',
    borderRadius:   'var(--r-md)',
    padding:        '3px',
    gap:            '2px',
  },
  toggleBtn: {
    flex:           1,
    padding:        '8px',
    background:     'transparent',
    border:         'none',
    borderRadius:   '9px',
    fontSize:       '13px',
    fontWeight:     '500',
    color:          'var(--text-secondary)',
    cursor:         'pointer',
  },
  toggleActive: {
    background:     'var(--bg-surface)',
    color:          'var(--text-primary)',
    boxShadow:      '0 1px 3px rgba(0,0,0,0.08)',
  },
  inputRow: {
    display:        'flex',
    alignItems:     'center',
    gap:            '8px',
  },
  amountInput: {
    flex:           1,
    fontSize:       '28px',
    fontWeight:     '300',
    letterSpacing:  '-0.03em',
    padding:        '10px 14px',
    background:     'var(--bg-elevated)',
    border:         '1px solid var(--border-default)',
    borderRadius:   'var(--r-md)',
    color:          'var(--text-primary)',
    outline:        'none',
  },
  unit: {
    fontSize:       '16px',
    color:          'var(--text-tertiary)',
    fontWeight:     '500',
    minWidth:       '24px',
  },
  voiceBtn: {
    width:          '44px',
    height:         '44px',
    borderRadius:   'var(--r-md)',
    background:     'var(--bg-elevated)',
    border:         '1px solid var(--border-default)',
    fontSize:       '20px',
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  voiceBtnActive: {
    background:     'var(--accent-dim)',
    borderColor:    'var(--accent)',
  },
  gramsEquiv: {
    fontSize:       '13px',
    color:          'var(--text-tertiary)',
    paddingLeft:    '4px',
  },
  error: {
    fontSize:       '13px',
    color:          'var(--red)',
    margin:         0,
  },
  macroGrid: {
    display:        'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    background:     'var(--bg-elevated)',
    borderRadius:   'var(--r-lg)',
    overflow:       'hidden',
  },
  macroCell: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    padding:        '12px 4px',
    gap:            '3px',
  },
  macroVal: {
    fontSize:       '16px',
    fontWeight:     '600',
    letterSpacing:  '-0.02em',
    fontFamily:     'var(--font-mono)',
  },
  macroLabel: {
    fontSize:       '10px',
    color:          'var(--text-tertiary)',
    fontWeight:     '500',
    textTransform:  'uppercase',
    letterSpacing:  '0.04em',
  },
  per100: {
    fontSize:       '12px',
    color:          'var(--text-tertiary)',
    textAlign:      'center',
  },
  actions: {
    display:        'flex',
    gap:            '10px',
    marginTop:      '4px',
  },
  cancelBtn: {
    flex:           1,
    padding:        '14px',
    background:     'transparent',
    border:         '1px solid var(--border-default)',
    borderRadius:   'var(--r-lg)',
    color:          'var(--text-secondary)',
    fontSize:       '15px',
    fontWeight:     '500',
    cursor:         'pointer',
  },
  addBtn: {
    flex:           2,
    padding:        '14px',
    background:     'var(--text-primary)',
    border:         'none',
    borderRadius:   'var(--r-lg)',
    color:          'var(--text-inverse)',
    fontSize:       '15px',
    fontWeight:     '600',
    cursor:         'pointer',
  },
}