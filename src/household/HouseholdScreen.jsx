import { useState, useEffect } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import {
  sbCreateHousehold, sbJoinHousehold, sbFetchHousehold,
  sbUpdateHousehold, sbLeaveHousehold,
} from '../db/supabase.js'

export default function HouseholdScreen() {
  const { user, refreshUser } = useAuth()
  if (!user.householdId) {
    return <HouseholdSetup user={user} onDone={refreshUser} />
  }
  return <HouseholdManager user={user} onDone={refreshUser} />
}

// ─── Setup: create or join ────────────────────────────────────────────────────

function HouseholdSetup({ user, onDone }) {
  const [tab,     setTab]     = useState('create')
  const [name,    setName]    = useState('')
  const [code,    setCode]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleCreate() {
    if (!name.trim()) { setError('Enter a household name'); return }
    setLoading(true); setError('')
    try {
      const h = await sbCreateHousehold(name.trim(), user.email, user.name)
      await db.users.update(user.id, { householdId: h.id, dirty: 1, updatedAt: new Date().toISOString() })
      await onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (code.trim().length < 6) { setError('Enter a valid 6-character code'); return }
    setLoading(true); setError('')
    try {
      const h = await sbJoinHousehold(code.trim(), user.email, user.name)
      await db.users.update(user.id, { householdId: h.id, dirty: 1, updatedAt: new Date().toISOString() })
      await onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.screen}>
      <h1 style={s.title}>Your Household</h1>
      <p style={s.sub}>Create a new household or join one with a code from an existing member.</p>

      <div style={s.tabRow}>
        {[['create','Create'],['join','Join with code']].map(([id, lbl]) => (
          <button
            key={id}
            style={{ ...s.tab, ...(tab === id ? s.tabActive : {}) }}
            onClick={() => { setTab(id); setError('') }}
          >
            {lbl}
          </button>
        ))}
      </div>

      <div style={s.card}>
        {tab === 'create' ? (
          <>
            <label style={s.label}>Household name</label>
            <input
              style={s.input}
              placeholder="e.g. The Shah Kitchen"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </>
        ) : (
          <>
            <label style={s.label}>6-character code</label>
            <input
              style={{ ...s.input, textTransform:'uppercase', letterSpacing:'0.2em', fontFamily:'var(--font-mono)', fontSize:'22px', textAlign:'center' }}
              placeholder="ABC123"
              value={code}
              maxLength={6}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
            />
          </>
        )}

        {error && <p style={s.error}>{error}</p>}

        <button
          style={{ ...s.btn, opacity: loading ? 0.6 : 1 }}
          onClick={tab === 'create' ? handleCreate : handleJoin}
          disabled={loading}
        >
          {loading
            ? (tab === 'create' ? 'Creating…' : 'Joining…')
            : (tab === 'create' ? 'Create Household' : 'Join Household')
          }
        </button>
      </div>
    </div>
  )
}

// ─── Manager: view members, share code, transfer, leave ──────────────────────

function HouseholdManager({ user, onDone }) {
  const [household,    setHousehold]    = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [copied,       setCopied]       = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferTo,   setTransferTo]   = useState('')
  const [showLeave,    setShowLeave]    = useState(false)
  const [working,      setWorking]      = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const h = await sbFetchHousehold(user.householdId)
      // If removed from members, clear householdId automatically
      if (!h.members.some(m => m.email === user.email)) {
        await db.users.update(user.id, { householdId: null, dirty: 1, updatedAt: new Date().toISOString() })
        await onDone()
        return
      }
      setHousehold(h)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isAdmin        = household?.adminEmail === user.email
  const otherMembers   = household?.members.filter(m => m.email !== user.email) ?? []
  const isSoleMember   = household?.members.length === 1

  async function copyCode() {
    await navigator.clipboard.writeText(household.code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function removeMember(email) {
    setWorking(true); setError('')
    try {
      const updated = await sbUpdateHousehold({
        ...household,
        members: household.members.filter(m => m.email !== email),
      })
      setHousehold(updated)
    } catch (e) {
      setError(e.message)
    } finally {
      setWorking(false)
    }
  }

  async function transferAdmin() {
    if (!transferTo) return
    setWorking(true); setError('')
    try {
      setHousehold(await sbUpdateHousehold({ ...household, adminEmail: transferTo }))
      setShowTransfer(false); setTransferTo('')
    } catch (e) {
      setError(e.message)
    } finally {
      setWorking(false)
    }
  }

  async function leaveHousehold() {
    setWorking(true); setError('')
    try {
      if (isSoleMember) {
        // Last member — dissolve by emptying members list
        await sbUpdateHousehold({ ...household, members: [] })
      } else {
        await sbLeaveHousehold(household.id, user.email)
      }
      await db.users.update(user.id, { householdId: null, dirty: 1, updatedAt: new Date().toISOString() })
      await onDone()
    } catch (e) {
      setError(e.message)
      setWorking(false)
    }
  }

  if (loading) return <div style={s.screen}><p style={s.sub}>Loading…</p></div>

  if (!household) {
    return (
      <div style={s.screen}>
        <p style={s.error}>{error || 'Household not found.'}</p>
        <button style={s.secondaryBtn} onClick={async () => {
          await db.users.update(user.id, { householdId: null, dirty: 1, updatedAt: new Date().toISOString() })
          await onDone()
        }}>
          Reset & rejoin
        </button>
      </div>
    )
  }

  return (
    <div style={s.screen}>
      {/* Household card with share code */}
      <div style={s.houseCard}>
        <div style={s.houseName}>{household.name}</div>
        <div style={s.codeRow}>
          <span style={s.codeLabel}>Share code</span>
          <span style={s.codeValue}>{household.code}</span>
          <button style={s.copyBtn} onClick={copyCode}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {error && <p style={s.error}>{error}</p>}

      {/* Members list */}
      <div style={s.sectionLabel}>Members ({household.members.length}/4)</div>
      <div style={s.memberCard}>
        {household.members.map((m, i) => {
          const isLast  = i === household.members.length - 1
          const isOwner = m.email === household.adminEmail
          return (
            <div
              key={m.email}
              style={{ ...s.memberRow, borderBottom: isLast ? 'none' : '0.5px solid var(--border-subtle)' }}
            >
              <div style={s.memberAvatar}>
                {(m.name || m.email).slice(0, 2).toUpperCase()}
              </div>
              <div style={s.memberInfo}>
                <span style={s.memberName}>{m.name}</span>
                <span style={s.memberEmail}>{m.email}</span>
              </div>
              {isOwner && <span style={s.adminBadge}>Admin</span>}
              {isAdmin && !isOwner && (
                <button
                  style={s.removeBtn}
                  onClick={() => removeMember(m.email)}
                  disabled={working}
                >
                  Remove
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Transfer admin role (admin only, needs other members) */}
      {isAdmin && otherMembers.length > 0 && (
        <>
          <div style={s.sectionLabel}>Admin</div>
          {!showTransfer ? (
            <button style={s.secondaryBtn} onClick={() => setShowTransfer(true)}>
              Transfer Admin Role
            </button>
          ) : (
            <div style={s.actionCard}>
              <label style={s.label}>Transfer admin to</label>
              <select
                style={s.select}
                value={transferTo}
                onChange={e => setTransferTo(e.target.value)}
              >
                <option value="">Select member…</option>
                {otherMembers.map(m => (
                  <option key={m.email} value={m.email}>{m.name}</option>
                ))}
              </select>
              <div style={s.btnRow}>
                <button style={s.btn} onClick={transferAdmin} disabled={!transferTo || working}>
                  {working ? 'Transferring…' : 'Transfer'}
                </button>
                <button style={s.secondaryBtn} onClick={() => { setShowTransfer(false); setTransferTo('') }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Leave household */}
      <div>
        {isAdmin && !isSoleMember ? (
          <p style={s.leaveNote}>Transfer admin role to another member before leaving.</p>
        ) : !showLeave ? (
          <button style={s.dangerBtn} onClick={() => setShowLeave(true)}>
            {isSoleMember ? 'Leave & dissolve household' : 'Leave Household'}
          </button>
        ) : (
          <div style={s.actionCard}>
            <p style={s.confirmText}>
              {isSoleMember
                ? `Leave and dissolve ${household.name}? Batches will remain.`
                : `Leave ${household.name}? You'll need a code to rejoin.`
              }
            </p>
            <div style={s.btnRow}>
              <button style={s.dangerBtnSolid} onClick={leaveHousehold} disabled={working}>
                {working ? 'Leaving…' : 'Leave'}
              </button>
              <button style={s.secondaryBtn} onClick={() => setShowLeave(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  screen:        { display:'flex', flexDirection:'column', gap:'14px', paddingBottom:'32px' },
  title:         { fontSize:'22px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.02em', margin:0 },
  sub:           { fontSize:'14px', color:'var(--text-secondary)', margin:0 },
  tabRow:        { display:'flex', gap:'6px' },
  tab:           { flex:1, padding:'9px 14px', background:'var(--bg-elevated)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-full)', fontSize:'14px', fontWeight:'500', color:'var(--text-secondary)', cursor:'pointer' },
  tabActive:     { background:'var(--text-primary)', color:'var(--text-inverse)', borderColor:'var(--text-primary)' },
  card:          { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'12px' },
  actionCard:    { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px', display:'flex', flexDirection:'column', gap:'12px' },
  label:         { fontSize:'12px', fontWeight:'600', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' },
  input:         { padding:'12px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'16px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box' },
  select:        { padding:'12px 14px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', fontSize:'15px', color:'var(--text-primary)', outline:'none', width:'100%', boxSizing:'border-box' },
  error:         { fontSize:'13px', color:'var(--red)', margin:0 },
  btn:           { padding:'13px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'15px', fontWeight:'600', cursor:'pointer', flex:1 },
  secondaryBtn:  { padding:'12px 16px', background:'var(--bg-elevated)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', color:'var(--text-primary)', fontSize:'14px', fontWeight:'500', cursor:'pointer' },
  dangerBtn:     { width:'100%', padding:'12px', background:'rgba(200,80,64,0.08)', border:'none', borderRadius:'var(--r-lg)', color:'var(--red)', fontSize:'14px', fontWeight:'600', cursor:'pointer' },
  dangerBtnSolid:{ padding:'12px 16px', background:'var(--red)', border:'none', borderRadius:'var(--r-lg)', color:'#fff', fontSize:'14px', fontWeight:'600', cursor:'pointer' },
  btnRow:        { display:'flex', gap:'8px', alignItems:'center' },
  houseCard:     { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'16px 18px', display:'flex', flexDirection:'column', gap:'10px' },
  houseName:     { fontSize:'20px', fontWeight:'700', color:'var(--text-primary)', letterSpacing:'-0.02em', fontFamily:'var(--font-serif)', fontStyle:'italic' },
  codeRow:       { display:'flex', alignItems:'center', gap:'10px' },
  codeLabel:     { fontSize:'12px', color:'var(--text-tertiary)', fontWeight:'500', flexShrink:0 },
  codeValue:     { fontSize:'18px', fontWeight:'700', fontFamily:'var(--font-mono)', color:'var(--text-primary)', letterSpacing:'0.15em', flex:1 },
  copyBtn:       { padding:'6px 14px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer', flexShrink:0 },
  sectionLabel:  { fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em', paddingTop:'4px' },
  memberCard:    { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', overflow:'hidden' },
  memberRow:     { display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px' },
  memberAvatar:  { width:'36px', height:'36px', borderRadius:'50%', background:'var(--text-primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:'600', color:'var(--text-inverse)', flexShrink:0 },
  memberInfo:    { flex:1, display:'flex', flexDirection:'column', gap:'2px' },
  memberName:    { fontSize:'14px', fontWeight:'600', color:'var(--text-primary)' },
  memberEmail:   { fontSize:'12px', color:'var(--text-tertiary)' },
  adminBadge:    { fontSize:'10px', fontWeight:'700', background:'var(--accent-dim)', color:'var(--accent)', padding:'3px 8px', borderRadius:'var(--r-full)', letterSpacing:'0.06em', textTransform:'uppercase' },
  removeBtn:     { padding:'5px 10px', background:'rgba(200,80,64,0.08)', border:'none', borderRadius:'var(--r-sm)', color:'var(--red)', fontSize:'12px', fontWeight:'600', cursor:'pointer' },
  leaveNote:     { fontSize:'13px', color:'var(--text-tertiary)', margin:0, fontStyle:'italic' },
  confirmText:   { fontSize:'14px', color:'var(--text-secondary)', margin:0 },
}
