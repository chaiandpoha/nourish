import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { sha256 } from '../auth/crypto.js'
import { sbFetchBatches, sbCloseBatch, sbDeleteBatch } from '../db/supabase.js'

export default function AdminPanel() {
  const [tab,      setTab]      = useState('members')
  const [profiles, setProfiles] = useState([])
  const [usage,    setUsage]    = useState({})
  const [foods,    setFoods]    = useState([])
  const [batches,  setBatches]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const { user } = useAuth()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    let allBatches = []
    try {
      const remote = await sbFetchBatches(user?.householdId)
      // Safe merge: don't overwrite local batches with richer ingredient data
      if (remote.length) {
        const localRecords = await db.batches.bulkGet(remote.map(b => b.id))
        const toSave = remote.filter((r, i) => {
          const local = localRecords[i]
          if (!local) return true
          const localHasIng  = Array.isArray(local.ingredients)  && local.ingredients.length  > 0
          const remoteHasIng = Array.isArray(r.ingredients) && r.ingredients.length > 0
          return !(localHasIng && !remoteHasIng)
        })
        if (toSave.length) await db.batches.bulkPut(toSave)
      }
      allBatches = await db.batches.toArray()
    } catch {
      allBatches = await db.batches.toArray()
    }
    const [allUsers, allFoods] = await Promise.all([
      db.users.toArray(),
      db.foods.where('source').anyOf(['saved','scanned']).toArray(),
    ])
    setProfiles(allUsers)
    setFoods(allFoods)
    setBatches(allBatches)

    // Calculate usage per user
    const today    = new Date().toISOString().slice(0, 10)
    const thisMonth = today.slice(0, 7)
    const usageMap  = {}

    for (const u of allUsers) {
      const [foodLogs, workouts, weights] = await Promise.all([
        db.foodLogs.where('userId').equals(u.id).count(),
        db.workoutLogs.where('userId').equals(u.id).count(),
        db.weightLog.where('userId').equals(u.id).count(),
      ])
      usageMap[u.id] = { foodLogs, workouts, weights }
    }
    setUsage(usageMap)
    setLoading(false)
  }

  async function handleResetPin(userId, newPin) {
    if (!newPin || newPin.length < 4) return
    const pinHash = await sha256(newPin)
    await db.users.update(userId, {
      pinHash,
      skipPin:   false,
      dirty:     1,
      updatedAt: new Date().toISOString(),
    })
    alert('PIN reset successfully')
  }

  async function handleDeleteProfile(userId) {
    if (userId === user.id) return
    const tables = [
      'foodLogs','workoutLogs','workoutSets','programmes',
      'weightLog','bloodWork','supplementLog','moodLog',
      'progressPhotos','mealTemplates','reminders','measurements',
    ]
    for (const t of tables) {
      if (db[t]) await db[t].where('userId').equals(userId).delete()
    }
    await db.users.delete(userId)
    loadAll()
  }

  async function handleUpdateGoals(userId, goals) {
    await db.users.update(userId, {
      macroGoals: goals,
      dirty:      1,
      updatedAt:  new Date().toISOString(),
    })
    loadAll()
  }

  async function handleDeleteFood(id) {
    await db.foods.delete(id)
    loadAll()
  }

  async function handleCloseBatch(id) {
    await sbCloseBatch(id).catch(e => console.warn('Supabase close batch:', e))
    await db.batches.update(id, { closed: 1, updatedAt: new Date().toISOString() })
    loadAll()
  }

  async function handleDeleteBatch(id) {
    await sbDeleteBatch(id).catch(e => console.warn('Supabase delete batch:', e))
    await db.batches.delete(id)
    loadAll()
  }

  async function handleToggleAdmin(userId, currentVal) {
    await db.users.update(userId, {
      isAdmin:   !currentVal,
      dirty:     1,
      updatedAt: new Date().toISOString(),
    })
    loadAll()
  }

  const tabs = [
    { id:'members', label:'Members'  },
    { id:'usage',   label:'Usage'    },
    { id:'foods',   label:'Foods'    },
    { id:'batches', label:'Batches'  },
    { id:'danger',  label:'⚠ Danger' },
  ]

  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.loading}>Loading admin panel…</div>
      </div>
    )
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h2 style={s.title}>Admin</h2>
        <span style={s.adminBadge}>Admin</span>
      </div>

      <div style={s.tabBar}>
        {tabs.map(t => (
          <button
            key={t.id}
            style={{ ...s.tabBtn, ...(tab === t.id ? s.tabBtnActive : {}) }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Members */}
      {tab === 'members' && (
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <span style={s.sectionTitle}>
              {profiles.length} profile{profiles.length !== 1 ? 's' : ''}
            </span>
          </div>

          {profiles.map(profile => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              isCurrentUser={profile.id === user.id}
              usage={usage[profile.id]}
              onResetPin={handleResetPin}
              onDelete={handleDeleteProfile}
              onUpdateGoals={handleUpdateGoals}
              onToggleAdmin={handleToggleAdmin}
            />
          ))}
        </div>
      )}

      {/* Usage */}
      {tab === 'usage' && (
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <span style={s.sectionTitle}>Usage Statistics</span>
          </div>

          {profiles.map(profile => (
            <div key={profile.id} style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.avatar}>
                  {profile.avatarInitials || profile.name.slice(0,2).toUpperCase()}
                </div>
                <span style={s.profileName}>{profile.name}</span>
                {profile.isAdmin && <span style={s.adminBadge}>Admin</span>}
              </div>

              <div style={s.statsGrid}>
                <div style={s.statItem}>
                  <span style={s.statVal}>{usage[profile.id]?.foodLogs || 0}</span>
                  <span style={s.statLabel}>Food entries</span>
                </div>
                <div style={s.statItem}>
                  <span style={s.statVal}>{usage[profile.id]?.workouts || 0}</span>
                  <span style={s.statLabel}>Workouts</span>
                </div>
                <div style={s.statItem}>
                  <span style={s.statVal}>{usage[profile.id]?.weights || 0}</span>
                  <span style={s.statLabel}>Weight logs</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Foods */}
      {tab === 'foods' && (
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <span style={s.sectionTitle}>
              {foods.length} saved food{foods.length !== 1 ? 's' : ''}
            </span>
          </div>

          {foods.length === 0 && (
            <p style={s.empty}>No saved or scanned foods yet</p>
          )}

          {foods.map(food => (
            <div key={food.id} style={s.foodRow}>
              <div style={s.foodInfo}>
                <span style={s.foodName}>{food.name}</span>
                <span style={s.foodMeta}>
                  {food.per100g?.calories} kcal · {food.per100g?.protein}g P per 100g
                  {' · '}{food.source}
                </span>
              </div>
              <button
                style={s.deleteBtn}
                onClick={() => handleDeleteFood(food.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Danger zone */}
      {tab === 'danger' && (
        <FactoryReset />
      )}

      {/* Batches */}
      {tab === 'batches' && (
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <span style={s.sectionTitle}>
              {batches.length} batch{batches.length !== 1 ? 'es' : ''}
            </span>
          </div>

          {batches.length === 0 && (
            <p style={s.empty}>No batches yet</p>
          )}

          {batches.map(batch => (
            <div key={batch.id} style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.batchInfo}>
                  <span style={s.batchName}>{batch.name}</span>
                  <span style={s.batchMeta}>
                    {batch.macrosPer100g?.calories || 0} kcal ·{' '}
                    {batch.macrosPer100g?.protein  || 0}g P per 100g
                    {batch.shared ? ' · Shared' : ' · Personal'}
                    {batch.closed ? ' · Closed' : ' · Active'}
                  </span>
                </div>
              </div>
              <div style={s.batchActions}>
                {!batch.closed && (
                  <button
                    style={s.closeBtn}
                    onClick={() => handleCloseBatch(batch.id)}
                  >
                    Close
                  </button>
                )}
                <button
                  style={s.deleteBtn}
                  onClick={() => handleDeleteBatch(batch.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ProfileCard ──────────────────────────────────────────────────────────────

function ProfileCard({ profile, isCurrentUser, usage, onResetPin, onDelete, onUpdateGoals, onToggleAdmin }) {
  const [expanded,  setExpanded]  = useState(false)
  const [newPin,    setNewPin]    = useState('')
  const [editGoals, setEditGoals] = useState(false)
  const [goals,     setGoals]     = useState(profile.macroGoals || {})
  const [showDelete, setShowDelete] = useState(false)

  return (
    <div style={s.card}>
      <button style={s.cardHeader} onClick={() => setExpanded(e => !e)}>
        <div style={s.avatar}>
          {profile.avatarInitials || profile.name.slice(0,2).toUpperCase()}
        </div>
        <div style={s.profileInfo}>
          <span style={s.profileName}>{profile.name}</span>
          <span style={s.profileMeta}>
            {isCurrentUser ? 'You · ' : ''}
            {profile.isAdmin ? 'Admin · ' : ''}
            {usage?.foodLogs || 0} food entries
          </span>
        </div>
        <span style={s.chevron}>{expanded ? '˄' : '˅'}</span>
      </button>

      {expanded && (
        <div style={s.cardBody}>

          {/* Macro goals */}
          <div style={s.subsection}>
            <div style={s.subsectionHeader}>
              <span style={s.subsectionTitle}>Macro Goals</span>
              <button
                style={s.editBtn}
                onClick={() => setEditGoals(e => !e)}
              >
                {editGoals ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editGoals ? (
              <>
                <div style={s.goalsGrid}>
                  {['calories','protein','carbs','fat','fibre'].map(key => (
                    <div key={key} style={s.goalField}>
                      <label style={s.goalLabel}>{key}</label>
                      <input
                        style={s.goalInput}
                        type="number"
                        inputMode="numeric"
                        value={goals[key] || ''}
                        onChange={e => setGoals(g => ({ ...g, [key]: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                  ))}
                </div>
                <button
                  style={s.saveBtn}
                  onClick={() => { onUpdateGoals(profile.id, goals); setEditGoals(false) }}
                >
                  Save Goals
                </button>
              </>
            ) : (
              <div style={s.goalsDisplay}>
                <span style={s.goalPill}>{goals.calories} kcal</span>
                <span style={s.goalPill}>{goals.protein}g P</span>
                <span style={s.goalPill}>{goals.carbs}g C</span>
                <span style={s.goalPill}>{goals.fat}g F</span>
                <span style={s.goalPill}>{goals.fibre}g Fi</span>
              </div>
            )}
          </div>

          {/* PIN reset */}
          <div style={s.subsection}>
            <div style={s.subsectionHeader}>
              <span style={s.subsectionTitle}>Reset PIN</span>
            </div>
            <div style={s.pinRow}>
              <input
                style={s.pinInput}
                type="password"
                inputMode="numeric"
                placeholder="New PIN (4-8 digits)"
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g,'').slice(0,8))}
              />
              <button
                style={s.resetBtn}
                onClick={() => { onResetPin(profile.id, newPin); setNewPin('') }}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Admin toggle */}
          <div style={s.subsection}>
            <div style={s.subsectionHeader}>
              <span style={s.subsectionTitle}>Admin Access</span>
              <button
                style={{
                  ...s.toggleBtn,
                  background: profile.isAdmin ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  color:      profile.isAdmin ? 'var(--accent)'     : 'var(--text-secondary)',
                }}
                onClick={() => onToggleAdmin(profile.id, profile.isAdmin)}
                disabled={isCurrentUser}
              >
                {profile.isAdmin ? 'Admin ✓' : 'Make Admin'}
              </button>
            </div>
          </div>

          {/* Delete */}
          {!isCurrentUser && (
            <div style={s.subsection}>
              {!showDelete ? (
                <button
                  style={s.dangerBtn}
                  onClick={() => setShowDelete(true)}
                >
                  Delete Profile
                </button>
              ) : (
                <div style={s.confirmRow}>
                  <span style={s.confirmText}>Delete {profile.name}? Cannot be undone.</span>
                  <button style={s.confirmYes} onClick={() => onDelete(profile.id)}>
                    Yes, Delete
                  </button>
                  <button style={s.confirmNo} onClick={() => setShowDelete(false)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── FactoryReset ─────────────────────────────────────────────────────────────

function FactoryReset() {
  const [confirm,      setConfirm]      = useState(false)
  const [wipeDrive,    setWipeDrive]    = useState(true)
  const [wiping,       setWiping]       = useState(false)

  async function handleWipe() {
    setWiping(true)
    try {
      // Disconnect Drive token so old data isn't restored on next login
      if (wipeDrive) {
        const { clearAccessToken, clearAdminToken } = await import('../db/driveApi.js').catch(() => ({}))
        clearAccessToken?.()
        clearAdminToken?.()
      }

      const tables = [
        'users','foods','batches',
        'foodLogs','weightLog','supplementLog','moodLog','bloodWork',
        'workoutLogs','workoutSets','programmes','mealTemplates',
        'reminders','progressPhotos','measurements','syncState',
      ]
      for (const t of tables) {
        if (db[t]) await db[t].clear()
      }
      localStorage.clear()
      sessionStorage.clear()
      window.location.href = window.location.origin + '/'
    } catch (e) {
      alert('Wipe failed: ' + e.message)
      setWiping(false)
    }
  }

  return (
    <div style={s.section}>
      <div style={{ ...s.card, border:'1px solid rgba(200,80,64,0.3)' }}>
        <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:'12px' }}>
          <div style={{ fontSize:'15px', fontWeight:'600', color:'var(--red)' }}>Factory Reset</div>
          <p style={{ fontSize:'13px', color:'var(--text-secondary)', margin:0 }}>
            Wipes ALL data from this device. Enable the option below to also disconnect Drive so old data isn't automatically restored on next login.
          </p>

          {/* Disconnect Drive toggle */}
          <button
            style={{ display:'flex', alignItems:'center', gap:'10px', background: wipeDrive ? 'rgba(200,80,64,0.08)' : 'var(--bg-elevated)', border:`1px solid ${wipeDrive ? 'var(--red)' : 'var(--border-default)'}`, borderRadius:'var(--r-md)', padding:'10px 12px', cursor:'pointer', textAlign:'left' }}
            onClick={() => setWipeDrive(v => !v)}
          >
            <div style={{ width:'20px', height:'20px', borderRadius:'4px', background: wipeDrive ? 'var(--red)' : 'transparent', border: wipeDrive ? 'none' : '2px solid var(--border-strong)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              {wipeDrive && <span style={{ color:'#fff', fontSize:'12px', fontWeight:'700' }}>✓</span>}
            </div>
            <div>
              <div style={{ fontSize:'13px', fontWeight:'600', color:'var(--text-primary)' }}>Disconnect Google Drive</div>
              <div style={{ fontSize:'11px', color:'var(--text-tertiary)' }}>Prevents old data from being restored automatically</div>
            </div>
          </button>

          {!confirm ? (
            <button style={s.dangerBtn} onClick={() => setConfirm(true)}>
              Reset All Data…
            </button>
          ) : (
            <div style={s.confirmRow}>
              <span style={{ ...s.confirmText, color:'var(--red)', fontWeight:'600' }}>
                This cannot be undone. Are you sure?
              </span>
              <button style={s.confirmYes} onClick={handleWipe} disabled={wiping}>
                {wiping ? 'Wiping…' : 'Yes, Wipe Everything'}
              </button>
              <button style={s.confirmNo} onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  container:      { display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'24px' },
  header:         { display:'flex', alignItems:'center', justifyContent:'space-between' },
  title:          { fontSize:'22px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', margin:0 },
  adminBadge:     { fontSize:'10px', fontWeight:'700', background:'var(--accent-dim)', color:'var(--accent)', padding:'3px 10px', borderRadius:'var(--r-full)', letterSpacing:'0.06em', textTransform:'uppercase' },
  loading:        { textAlign:'center', padding:'48px 0', fontSize:'14px', color:'var(--text-tertiary)' },
  tabBar:         { display:'flex', gap:'6px', overflowX:'auto', paddingBottom:'4px' },
  tabBtn:         { padding:'8px 14px', background:'var(--bg-elevated)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-full)', fontSize:'13px', fontWeight:'500', color:'var(--text-secondary)', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 },
  tabBtnActive:   { background:'var(--text-primary)', color:'var(--text-inverse)', borderColor:'var(--text-primary)' },
  section:        { display:'flex', flexDirection:'column', gap:'10px' },
  sectionHeader:  { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 2px' },
  sectionTitle:   { fontSize:'12px', fontWeight:'600', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' },
  card:           { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  cardHeader:     { display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', background:'transparent', border:'none', width:'100%', cursor:'pointer', textAlign:'left' },
  cardBody:       { display:'flex', flexDirection:'column', gap:'0', borderTop:'0.5px solid var(--border-subtle)' },
  avatar:         { width:'38px', height:'38px', borderRadius:'50%', background:'var(--text-primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'600', color:'var(--text-inverse)', flexShrink:0 },
  profileInfo:    { flex:1, display:'flex', flexDirection:'column', gap:'2px' },
  profileName:    { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)' },
  profileMeta:    { fontSize:'12px', color:'var(--text-tertiary)' },
  chevron:        { fontSize:'14px', color:'var(--text-tertiary)' },
  subsection:     { padding:'14px 16px', borderBottom:'0.5px solid var(--border-subtle)' },
  subsectionHeader:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' },
  subsectionTitle:{ fontSize:'13px', fontWeight:'600', color:'var(--text-primary)' },
  editBtn:        { padding:'4px 10px', background:'var(--bg-elevated)', border:'none', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'12px', cursor:'pointer' },
  goalsGrid:      { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px', marginBottom:'10px' },
  goalField:      { display:'flex', flexDirection:'column', gap:'4px' },
  goalLabel:      { fontSize:'10px', fontWeight:'600', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.06em' },
  goalInput:      { padding:'8px 10px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'14px', color:'var(--text-primary)', outline:'none', textAlign:'center' },
  goalsDisplay:   { display:'flex', flexWrap:'wrap', gap:'6px' },
  goalPill:       { padding:'4px 10px', background:'var(--bg-elevated)', borderRadius:'var(--r-full)', fontSize:'12px', color:'var(--text-secondary)', fontWeight:'500' },
  saveBtn:        { width:'100%', padding:'10px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-md)', color:'var(--text-inverse)', fontSize:'14px', fontWeight:'600', cursor:'pointer' },
  pinRow:         { display:'flex', gap:'8px' },
  pinInput:       { flex:1, padding:'10px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'14px', color:'var(--text-primary)', outline:'none' },
  resetBtn:       { padding:'10px 16px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  toggleBtn:      { padding:'6px 14px', border:'none', borderRadius:'var(--r-full)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  dangerBtn:      { width:'100%', padding:'10px', background:'rgba(200,80,64,0.08)', border:'none', borderRadius:'var(--r-md)', color:'var(--red)', fontSize:'14px', fontWeight:'600', cursor:'pointer' },
  confirmRow:     { display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' },
  confirmText:    { flex:1, fontSize:'13px', color:'var(--text-secondary)' },
  confirmYes:     { padding:'6px 14px', background:'var(--red)', border:'none', borderRadius:'var(--r-md)', color:'#fff', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  confirmNo:      { padding:'6px 14px', background:'var(--bg-elevated)', border:'none', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'13px', cursor:'pointer' },
  statsGrid:      { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px' },
  statItem:       { display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', padding:'10px', background:'var(--bg-elevated)', borderRadius:'var(--r-md)' },
  statVal:        { fontSize:'20px', fontWeight:'300', color:'var(--text-primary)', letterSpacing:'-0.02em' },
  statLabel:      { fontSize:'10px', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.05em', textAlign:'center' },
  foodRow:        { display:'flex', alignItems:'center', gap:'10px', padding:'12px 0', borderBottom:'0.5px solid var(--border-subtle)' },
  foodInfo:       { flex:1, display:'flex', flexDirection:'column', gap:'2px' },
  foodName:       { fontSize:'14px', fontWeight:'500', color:'var(--text-primary)' },
  foodMeta:       { fontSize:'12px', color:'var(--text-tertiary)' },
  deleteBtn:      { padding:'6px 10px', background:'rgba(200,80,64,0.08)', border:'none', borderRadius:'var(--r-md)', color:'var(--red)', fontSize:'12px', fontWeight:'600', cursor:'pointer', flexShrink:0 },
  batchInfo:      { display:'flex', flexDirection:'column', gap:'3px' },
  batchName:      { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', fontStyle:'italic', fontFamily:'var(--font-serif)' },
  batchMeta:      { fontSize:'12px', color:'var(--text-tertiary)' },
  batchActions:   { display:'flex', gap:'8px', padding:'10px 16px', borderTop:'0.5px solid var(--border-subtle)' },
  closeBtn:       { padding:'6px 14px', background:'var(--bg-elevated)', border:'none', borderRadius:'var(--r-md)', color:'var(--text-secondary)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
  empty:          { fontSize:'14px', color:'var(--text-tertiary)', textAlign:'center', padding:'24px 0', margin:0 },
}