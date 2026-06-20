import { useState, useEffect, useRef } from 'react'
import { getFoodByBarcode, saveFood } from './FoodDB.js'
import { generateId } from '../auth/crypto.js'
import ManualFoodCreator from './ManualFoodCreator.jsx'

const HAS_NATIVE = typeof window !== 'undefined' && 'BarcodeDetector' in window

// onFound(food) → add to log flow
// onSaved(food) → saved to library only, back to list
export default function BarcodeScanner({ onFound, onSaved, onCancel, householdId }) {
  const [screen,      setScreen]      = useState('scanning')
  const [error,       setError]       = useState('')
  const [barcode,     setBarcode]     = useState('')
  const [foundFood,   setFoundFood]   = useState(null)
  const [manualInput, setManualInput] = useState('')
  const [manualError, setManualError] = useState('')
  const [createName,  setCreateName]  = useState('')

  const videoRef    = useRef(null)
  const streamRef   = useRef(null)
  const detectorRef = useRef(null)
  const rafRef      = useRef(null)
  const doneRef     = useRef(false)
  const zxingRef    = useRef(null)

  useEffect(() => {
    if (screen !== 'scanning') return
    doneRef.current = false
    startCamera()
    return stop
  }, [screen])

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      const v = videoRef.current
      if (!v) { stop(); return }
      v.srcObject = stream
      await v.play()

      if (HAS_NATIVE) {
        detectorRef.current = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'],
        })
        tick()
      } else {
        // ZXing fallback for iOS Safari / Firefox (no native BarcodeDetector)
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        zxingRef.current = reader
        reader.decodeFromVideoElement(v, (result, _err) => {
          if (result && !doneRef.current) {
            doneRef.current = true
            stop()
            handleDetected(result.getText())
          }
        })
      }
    } catch (e) {
      setError(e.name === 'NotAllowedError'
        ? 'Camera access denied — please allow camera in Settings'
        : 'Could not access camera')
      setScreen('error')
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current)
    if (zxingRef.current) {
      try { zxingRef.current.reset() } catch {}
      zxingRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function tick() {
    if (doneRef.current) return
    const v = videoRef.current
    if (v && v.readyState >= 2) {
      try {
        const hits = await detectorRef.current.detect(v)
        if (hits.length && !doneRef.current) {
          doneRef.current = true
          stop()
          await handleDetected(hits[0].rawValue)
          return
        }
      } catch {}
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  async function handleDetected(code) {
    setBarcode(code)
    setScreen('looking')

    const local = await getFoodByBarcode(code)
    if (local) { setFoundFood(local); setScreen('found'); return }

    try {
      for (const base of ['https://world.openfoodfacts.org', 'https://us.openfoodfacts.org']) {
        const res  = await fetch(`${base}/api/v2/product/${code}.json`)
        const data = await res.json()
        if (data.status === 1 && data.product) {
          const food = mapProduct(data.product, code)
          await saveFood(food, householdId)
          setFoundFood(food)
          setScreen('found')
          return
        }
      }
    } catch {}

    setScreen('notfound')
  }

  function mapProduct(p, code) {
    const n   = p.nutriments || {}
    const cal = n['energy-kcal_100g'] ?? Math.round((n['energy_100g'] || 0) / 4.184)
    return {
      id:           generateId(),
      name:         (p.product_name || p.abbreviated_product_name || 'Unknown product').trim(),
      brand:        p.brands ? p.brands.split(',')[0].trim() : null,
      source:       'scanned',
      barcode:      code,
      tags:         [],
      servingSize:  parseFloat(p.serving_quantity) || 100,
      servingLabel: p.serving_size || '100g',
      per100g: {
        calories:    Math.round(cal || 0),
        protein:     Math.round((n['proteins_100g']       || 0) * 10) / 10,
        carbs:       Math.round((n['carbohydrates_100g']  || 0) * 10) / 10,
        fat:         Math.round((n['fat_100g']            || 0) * 10) / 10,
        fibre:       Math.round(((n['fiber_100g'] ?? n['fibre_100g']) || 0) * 10) / 10,
        sodium:      Math.round((n['sodium_100g']         || 0) * 1000),
        sugar:       Math.round((n['sugars_100g']         || 0) * 10) / 10,
        saturatedFat:Math.round((n['saturated-fat_100g'] || 0) * 10) / 10,
      },
      updatedAt: new Date().toISOString(),
    }
  }

  async function handleManualLookup() {
    const code = manualInput.trim().replace(/\s/g, '')
    if (!code) { setManualError('Enter a barcode number'); return }
    if (!/^\d{8,14}$/.test(code)) { setManualError('Barcode should be 8–14 digits'); return }
    setManualError('')
    await handleDetected(code)
  }

  // ─── Manual entry ─────────────────────────────────────────────────────────────
  if (screen === 'manual') {
    return (
      <div style={st.container}>
        <Hdr onCancel={onCancel} />
        <div style={st.center}>
          <div style={st.icon}>🔢</div>
          <p style={st.bigTitle}>Enter barcode</p>
          <p style={st.sub}>Type the barcode number from the product packaging.</p>
        </div>
        <input
          style={st.manualInput}
          type="number"
          inputMode="numeric"
          placeholder="e.g. 0123456789012"
          value={manualInput}
          onChange={e => { setManualInput(e.target.value); setManualError('') }}
          onKeyDown={e => e.key === 'Enter' && handleManualLookup()}
          autoFocus
        />
        {manualError && <p style={st.manualError}>{manualError}</p>}
        <button style={st.primaryBtn} onClick={handleManualLookup}>Look Up Product</button>
        <button style={st.outlineBtn} onClick={() => setScreen('scanning')}>Try Camera Again</button>
        <button style={st.outlineBtn} onClick={onCancel}>Go Back</button>
      </div>
    )
  }

  // ─── Camera error ─────────────────────────────────────────────────────────────
  if (screen === 'error') {
    return (
      <div style={st.container}>
        <Hdr onCancel={onCancel} />
        <div style={st.center}>
          <div style={st.icon}>📵</div>
          <p style={st.bigTitle}>Camera unavailable</p>
          <p style={st.sub}>{error}</p>
        </div>
        <button style={st.primaryBtn} onClick={() => { setManualInput(''); setScreen('manual') }}>Enter Barcode Manually</button>
        <button style={st.outlineBtn} onClick={onCancel}>Go Back</button>
      </div>
    )
  }

  // ─── Looking up ───────────────────────────────────────────────────────────────
  if (screen === 'looking') {
    return (
      <div style={st.container}>
        <Hdr onCancel={onCancel} />
        <div style={st.center}>
          <div style={st.icon}>🔍</div>
          <p style={st.bigTitle}>Looking up…</p>
          <p style={st.sub}>{barcode}</p>
        </div>
      </div>
    )
  }

  // ─── Not found ────────────────────────────────────────────────────────────────
  if (screen === 'notfound') {
    return (
      <div style={st.container}>
        <Hdr onCancel={onCancel} />
        <div style={st.center}>
          <div style={st.icon}>🤷</div>
          <p style={st.bigTitle}>Product not found</p>
          <p style={st.sub}>
            Barcode {barcode} wasn't in the database. Enter the nutrition info manually.
          </p>
        </div>
        <button style={st.primaryBtn} onClick={() => { setCreateName(''); setScreen('create') }}>Enter Nutrition Manually</button>
        <button style={st.outlineBtn} onClick={() => setScreen('scanning')}>Scan Again</button>
        <button style={st.outlineBtn} onClick={onCancel}>Go Back</button>
      </div>
    )
  }

  // ─── Manual food creator ──────────────────────────────────────────────────────
  if (screen === 'create') {
    return (
      <ManualFoodCreator
        householdId={householdId}
        prefillName={createName}
        onSaved={(food, addToLog) => addToLog ? onFound(food) : (onSaved?.(food), onCancel())}
        onCancel={() => setScreen('notfound')}
      />
    )
  }

  // ─── Found ───────────────────────────────────────────────────────────────────
  if (screen === 'found' && foundFood) {
    const srv = foundFood.servingSize || 100
    const p   = foundFood.per100g || {}
    const cal = Math.round((p.calories || 0) * srv / 100)
    const pro = Math.round((p.protein  || 0) * srv / 100)
    const crb = Math.round((p.carbs    || 0) * srv / 100)
    const fat = Math.round((p.fat      || 0) * srv / 100)
    return (
      <div style={st.container}>
        <Hdr onCancel={onCancel} />
        <div style={st.foundCard}>
          <div style={st.foundName}>{foundFood.name}</div>
          {foundFood.brand && <div style={st.foundBrand}>{foundFood.brand}</div>}
          <div style={st.foundServing}>{foundFood.servingLabel || `${Math.round(srv)}g`} per serving</div>
          <div style={st.macroRow}>
            {[
              { label: 'kcal', val: cal, color: 'var(--text-primary)' },
              { label: 'P',    val: pro, color: 'var(--macro-protein)' },
              { label: 'C',    val: crb, color: 'var(--macro-carbs)' },
              { label: 'F',    val: fat, color: 'var(--macro-fat)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={st.macroCell}>
                <span style={{ ...st.macroVal, color }}>{val}</span>
                <span style={st.macroLabel}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <button style={st.primaryBtn} onClick={() => onFound(foundFood)}>Add to Log</button>
        <button style={st.outlineBtn} onClick={() => { onSaved?.(foundFood); onCancel() }}>Save to Foods Only</button>
        <button style={st.ghostBtn}   onClick={() => setScreen('scanning')}>Scan Another</button>
      </div>
    )
  }

  // ─── Camera view ──────────────────────────────────────────────────────────────
  return (
    <div style={st.container}>
      <Hdr onCancel={onCancel} />
      <div style={st.videoBox}>
        <video ref={videoRef} style={st.video} playsInline muted />
        <div style={st.overlayLayer}>
          <div style={st.frame} />
        </div>
      </div>
      <p style={st.hint}>Point at a barcode to scan</p>
      <button style={st.outlineBtn} onClick={() => { stop(); setScreen('manual') }}>Enter barcode manually</button>
    </div>
  )
}

function Hdr({ onCancel }) {
  return (
    <div style={st.header}>
      <button style={st.backBtn} onClick={onCancel}>← Back</button>
      <span style={st.headTitle}>Scan Barcode</span>
      <div style={{ width: 60 }} />
    </div>
  )
}

const st = {
  container:    { display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '8px' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  backBtn:      { background: 'none', border: 'none', color: 'var(--accent)', fontSize: '15px', cursor: 'pointer', padding: 0, width: 60 },
  headTitle:    { fontSize: '17px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.02em' },
  videoBox:     { position: 'relative', borderRadius: 'var(--r-xl)', overflow: 'hidden', background: '#000', height: '260px', flexShrink: 0 },
  video:        { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  overlayLayer: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  frame:        { width: '72%', height: '38%', border: '2px solid rgba(255,255,255,0.85)', borderRadius: '8px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' },
  hint:         { fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 },
  center:       { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '32px 0' },
  icon:         { fontSize: '52px' },
  bigTitle:     { fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' },
  sub:          { fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', margin: 0, lineHeight: '1.5', maxWidth: '280px' },
  primaryBtn:   { width: '100%', padding: '14px', background: 'var(--text-primary)', border: 'none', borderRadius: 'var(--r-lg)', color: 'var(--text-inverse)', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
  outlineBtn:   { width: '100%', padding: '13px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-lg)', color: 'var(--text-secondary)', fontSize: '15px', fontWeight: '500', cursor: 'pointer' },
  manualInput:  { width: '100%', padding: '14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-lg)', fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', outline: 'none', textAlign: 'center', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', boxSizing: 'border-box' },
  manualError:  { fontSize: '13px', color: 'var(--red)', margin: '0', textAlign: 'center' },
  foundCard:    { background: 'var(--bg-surface)', border: '0.5px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' },
  foundName:    { fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  foundBrand:   { fontSize: '13px', color: 'var(--text-tertiary)' },
  foundServing: { fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' },
  macroRow:     { display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--r-md)', overflow: 'hidden' },
  macroCell:    { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 4px', gap: '2px' },
  macroVal:     { fontSize: '15px', fontWeight: '600', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' },
  macroLabel:   { fontSize: '9px', color: 'var(--text-tertiary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' },
  ghostBtn:     { width: '100%', padding: '10px', background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '14px', cursor: 'pointer' },
}
