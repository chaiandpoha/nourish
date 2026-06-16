import { useState, useEffect } from 'react'
import { db } from '../db/indexedDB.js'
import { localDate } from '../log/DayLog.jsx'

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return localDate(d)
}

function fmtWeek(weekStart) {
  const d = new Date(weekStart + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

async function resizeImage(file, maxPx = 800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width  * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = url
  })
}

export default function ProgressPhotos({ userId }) {
  const [photos,    setPhotos]    = useState([])
  const [compare,   setCompare]   = useState(null)   // { a: photo, b: photo|null }
  const [uploading, setUploading] = useState(false)

  useEffect(() => { if (userId) loadPhotos() }, [userId])

  async function loadPhotos() {
    const rows = await db.progressPhotos.where('userId').equals(userId).toArray()
    rows.sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    setPhotos(rows)
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploading(true)
    try {
      const dataUrl   = await resizeImage(file)
      const weekStart = getWeekStart()
      const existing  = await db.progressPhotos
        .where('userId').equals(userId)
        .and(r => r.weekStart === weekStart)
        .first()
      if (existing) {
        await db.progressPhotos.update(existing.id, { dataUrl, uploadedAt: new Date().toISOString(), dirty: 1 })
      } else {
        await db.progressPhotos.add({
          userId, weekStart, dataUrl,
          dirty: 1, uploadedAt: new Date().toISOString(),
        })
      }
      await loadPhotos()
    } catch (err) {
      console.error('Photo capture error:', err)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleDelete(photo) {
    await db.progressPhotos.delete(photo.id)
    setCompare(null)
    await loadPhotos()
  }

  // ── Comparison view ──────────────────────────────────────────────────────────
  if (compare) {
    const others = photos.filter(p => p.id !== compare.a.id)
    return (
      <div style={s.container}>
        <button style={s.backBtn} onClick={() => setCompare(null)}>← Back</button>
        <div style={s.compareTitle}>Compare</div>
        <div style={s.compareGrid}>
          <div style={s.compareSlot}>
            <img src={compare.a.dataUrl} style={s.compareImg} alt="A" />
            <div style={s.compareLabel}>{fmtWeek(compare.a.weekStart)}</div>
          </div>
          <div style={s.compareSlot}>
            {compare.b ? (
              <>
                <img src={compare.b.dataUrl} style={s.compareImg} alt="B" />
                <div style={s.compareLabel}>{fmtWeek(compare.b.weekStart)}</div>
              </>
            ) : (
              <div style={s.emptySlot}>Tap a photo below to compare</div>
            )}
          </div>
        </div>
        {others.length > 0 && (
          <>
            <div style={s.sectionLabel}>Select for comparison</div>
            <div style={s.grid}>
              {others.map(p => (
                <button
                  key={p.id}
                  style={{ ...s.photoBtn, ...(compare.b?.id === p.id ? s.photoBtnActive : {}) }}
                  onClick={() => setCompare(c => ({ ...c, b: c.b?.id === p.id ? null : p }))}
                >
                  <img src={p.dataUrl} style={s.thumb} alt={p.weekStart} />
                  <div style={s.thumbLabel}>{fmtWeek(p.weekStart)}</div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Main gallery view ────────────────────────────────────────────────────────
  return (
    <div style={s.container}>
      <div style={s.captureRow}>
        <label style={s.captureBtn}>
          📸 Take Photo
          <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={s.hiddenInput} />
        </label>
        <label style={s.captureBtn}>
          🖼 Gallery
          <input type="file" accept="image/*" onChange={handleFile} style={s.hiddenInput} />
        </label>
      </div>

      {uploading && <p style={s.hint}>Processing photo…</p>}

      {photos.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyIcon}>📷</div>
          <p style={s.emptyTitle}>No photos yet</p>
          <p style={s.emptyHint}>Take one photo per week to track your transformation</p>
        </div>
      ) : (
        <>
          <div style={s.sectionLabel}>{photos.length} week{photos.length !== 1 ? 's' : ''} logged</div>
          <div style={s.grid}>
            {photos.map((p, i) => (
              <div key={p.id} style={s.photoWrapper}>
                <button style={s.photoBtn} onClick={() => setCompare({ a: p, b: null })}>
                  <img src={p.dataUrl} style={s.thumb} alt={p.weekStart} />
                  <div style={s.thumbLabel}>{fmtWeek(p.weekStart)}</div>
                </button>
                {i === 0 && <div style={s.latestBadge}>Latest</div>}
                <button style={s.deleteBtn} onClick={() => handleDelete(p)}>✕</button>
              </div>
            ))}
          </div>
          {photos.length >= 2 && (
            <p style={s.hint}>Tap a photo to compare two weeks side-by-side</p>
          )}
        </>
      )}
    </div>
  )
}

const s = {
  container:     { display:'flex', flexDirection:'column', gap:'16px', paddingBottom:'32px' },
  backBtn:       { background:'none', border:'none', color:'var(--accent)', fontSize:'15px', cursor:'pointer', padding:0, alignSelf:'flex-start' },
  captureRow:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' },
  captureBtn:    { position:'relative', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'13px 10px', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', fontSize:'14px', fontWeight:'500', color:'var(--text-primary)', cursor:'pointer' },
  hiddenInput:   { position:'absolute', top:0, left:0, width:'100%', height:'100%', opacity:0, cursor:'pointer' },
  hint:          { fontSize:'13px', color:'var(--text-tertiary)', textAlign:'center', margin:0 },
  empty:         { display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', padding:'48px 0' },
  emptyIcon:     { fontSize:'48px' },
  emptyTitle:    { fontSize:'16px', fontWeight:'600', color:'var(--text-primary)', margin:0 },
  emptyHint:     { fontSize:'13px', color:'var(--text-tertiary)', margin:0, textAlign:'center', maxWidth:'220px' },
  sectionLabel:  { fontSize:'12px', fontWeight:'600', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em' },
  grid:          { display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'10px' },
  photoWrapper:  { position:'relative' },
  photoBtn:      { width:'100%', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', overflow:'hidden', padding:0, cursor:'pointer', display:'flex', flexDirection:'column', textAlign:'left' },
  photoBtnActive:{ border:'2px solid var(--accent)' },
  thumb:         { width:'100%', aspectRatio:'3/4', objectFit:'cover', display:'block' },
  thumbLabel:    { padding:'6px 8px', fontSize:'12px', color:'var(--text-secondary)', fontWeight:'500' },
  latestBadge:   { position:'absolute', top:'6px', left:'6px', background:'var(--accent)', color:'#fff', fontSize:'10px', fontWeight:'700', padding:'2px 7px', borderRadius:'20px', letterSpacing:'0.04em', pointerEvents:'none' },
  deleteBtn:     { position:'absolute', top:'6px', right:'6px', width:'22px', height:'22px', borderRadius:'50%', background:'rgba(0,0,0,0.55)', border:'none', color:'#fff', fontSize:'11px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 },
  compareTitle:  { fontSize:'20px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.03em' },
  compareGrid:   { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' },
  compareSlot:   { display:'flex', flexDirection:'column', gap:'6px' },
  compareImg:    { width:'100%', aspectRatio:'3/4', objectFit:'cover', borderRadius:'var(--r-lg)', display:'block' },
  compareLabel:  { fontSize:'12px', color:'var(--text-secondary)', textAlign:'center', fontWeight:'500' },
  emptySlot:     { aspectRatio:'3/4', background:'var(--bg-elevated)', borderRadius:'var(--r-lg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', color:'var(--text-tertiary)', textAlign:'center', padding:'16px', border:'1px dashed var(--border-strong)' },
}
