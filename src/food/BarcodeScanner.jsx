import { useState, useEffect, useRef } from 'react'
import { getFoodByBarcode, saveFood } from './FoodDB.js'
import { generateId } from '../auth/crypto.js'

export default function BarcodeScanner({ onFound, onCancel, householdId }) {
  const [screen,       setScreen]       = useState(() => 'BarcodeDetector' in window ? 'scanning' : 'manual')
  const [error,        setError]        = useState('')
  const [barcode,      setBarcode]      = useState('')
  const [manualInput,  setManualInput]  = useState('')
  const [manualError,  setManualError]  = useState('')

  const videoRef    = useRef(null)
  const streamRef   = useRef(null)
  const detectorRef = useRef(null)
  const rafRef      = useRef(null)
  const doneRef     = useRef(false)

  useEffect(() => {
    if (screen !== 'scanning') return
    doneRef.current = false
    startCamera()
    return stop
  }, [screen])

  async function startCamera() {
    try {
      detectorRef.current = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'],
      })
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      const v = videoRef.current
      if (!v) { stop(); return }
      v.srcObject = stream
      await v.play()
      tick()
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Camera access denied' : 'Could not access camera')
      setScreen('unsupported')
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current)
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
    if (local) { onFound(local); return }

    try {
      // Try global DB first, then India-specific DB for better local product coverage
      for (const base of ['https://world.openfoodfacts.org', 'https://in.openfoodfacts.org']) {
        const res  = await fetch(`${base}/api/v2/product/${code}.json`)
        const data = await res.json()
        if (data.status === 1 && data.product) {
          const food = mapProduct(data.product, code)
          await saveFood(food, householdId)
          onFound(food)
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

  // ─── Manual entry (fallback when BarcodeDetector unavailable) ─────────────
  if (screen === 'manual') {
    return (
      <div style={st.container}>
        <Hdr onCancel={onCancel} />
        <div style={st.center}>
          <div style={st.icon}>🔢</div>
          <p style={st.bigTitle}>Enter barcode</p>
          <p style={st.sub}>Camera barcode scanning isn't supported on this device. Type the barcode number from the product packaging.</p>
        </div>
        <input
          style={st.manualInput}
          type="number"
          inputMode="numeric"
          placeholder="e.g. 8901030851551"
          value={manualInput}
          onChange={e => { setManualInput(e.target.value); setManualError('') }}
          onKeyDown={e => e.key === 'Enter' && handleManualLookup()}
          autoFocus
        />
        {manualError && <p style={st.manualError}>{manualError}</p>}
        <button style={st.primaryBtn} onClick={handleManualLookup}>Look Up Product</button>
        <button style={st.outlineBtn} onClick={onCancel}>Go Back</button>
      </div>
    )
  }

  // ─── Looking up ───────────────────────────────────────────────────────────
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

  // ─── Not found ────────────────────────────────────────────────────────────
  if (screen === 'notfound') {
    return (
      <div style={st.container}>
        <Hdr onCancel={onCancel} />
        <div style={st.center}>
          <div style={st.icon}>🤷</div>
          <p style={st.bigTitle}>Product not found</p>
          <p style={st.sub}>Barcode {barcode} wasn't in the database. Try scanning the nutrition label instead.</p>
        </div>
        {'BarcodeDetector' in window && (
          <button style={st.primaryBtn} onClick={() => setScreen('scanning')}>Try Again</button>
        )}
        <button style={st.outlineBtn} onClick={() => { setManualInput(barcode); setScreen('manual') }}>Enter Manually</button>
        <button style={st.outlineBtn} onClick={onCancel}>Go Back</button>
      </div>
    )
  }

  // ─── Camera view ──────────────────────────────────────────────────────────
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
      <button style={st.outlineBtn} onClick={() => setScreen('manual')}>Enter barcode manually</button>
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
}
