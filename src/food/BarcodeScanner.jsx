import { useState, useEffect, useRef } from 'react'
import { getFoodByBarcode, saveFood } from './FoodDB.js'
import { generateId } from '../auth/crypto.js'

export default function BarcodeScanner({ onFound, onCancel }) {
  const [screen,  setScreen]  = useState(() => 'BarcodeDetector' in window ? 'scanning' : 'unsupported')
  const [error,   setError]   = useState('')
  const [barcode, setBarcode] = useState('')

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
      const res  = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`)
      const data = await res.json()
      if (data.status === 1 && data.product) {
        const food = mapProduct(data.product, code)
        await saveFood(food)
        onFound(food)
        return
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

  // ─── Unsupported ──────────────────────────────────────────────────────────
  if (screen === 'unsupported') {
    return (
      <div style={st.container}>
        <Hdr onCancel={onCancel} />
        <div style={st.center}>
          <div style={st.icon}>📵</div>
          <p style={st.bigTitle}>Not supported</p>
          <p style={st.sub}>{error || 'Barcode scanning requires Chrome on Android or Safari 17+.'}</p>
          <button style={st.outlineBtn} onClick={onCancel}>Go Back</button>
        </div>
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
          <p style={st.sub}>Barcode {barcode} wasn't found. Try scanning the nutrition label instead.</p>
          <button style={st.primaryBtn} onClick={() => setScreen('scanning')}>Try Again</button>
          <button style={st.outlineBtn} onClick={onCancel}>Go Back</button>
        </div>
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
}
