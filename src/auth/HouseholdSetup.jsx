import { useState } from "react"

export default function HouseholdSetup({ onJoined, onCancel }) {
  const [inputCode,  setInputCode]  = useState("")
  const [error,      setError]      = useState("")
  const [screen,     setScreen]     = useState("join") // join | admin-auth | created
  const [code,       setCode]       = useState("")
  const [adminPass,  setAdminPass]  = useState("")
  const [passError,  setPassError]  = useState("")

  function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    const rand  = crypto.getRandomValues(new Uint8Array(12))
    const raw   = Array.from(rand).map(b => chars[b % chars.length]).join("")
    return "NOURISH-" + raw.slice(0,4) + "-" + raw.slice(4,8) + "-" + raw.slice(8,12)
  }

  async function handleAdminAuth(e) {
    e.preventDefault()
    setPassError("")
    try {
      const authRes = await fetch('/api/admin-auth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ password: adminPass }),
      })
      if (!authRes.ok) {
        setPassError("Incorrect admin password")
        return
      }
    } catch {
      setPassError("Could not reach server — try again")
      return
    }
    const newCode = generateCode()
    localStorage.setItem("nourish_household_code", newCode)
    localStorage.setItem("nourish_household_admin", "true")
    setCode(newCode)
    setScreen("created")
  }

  function handleJoin(e) {
    e?.preventDefault()
    const clean = inputCode.trim().toUpperCase()
    if (!clean.startsWith("NOURISH-")) {
      setError("Invalid code — should start with NOURISH-")
      return
    }
    localStorage.setItem("nourish_household_code", clean)
    localStorage.setItem("nourish_household_admin", "false")
    onJoined?.(clean)
  }

  if (screen === "created") {
    return (
      <div style={s.container}>
        <div style={s.emoji}>🏠</div>
        <h2 style={s.title}>Household Created</h2>
        <p style={s.body}>Share this code with family members so they can join:</p>
        <div style={s.codeBox}>
          <code style={s.codeText}>{code}</code>
        </div>
        <button style={s.copyBtn} onClick={() => navigator.clipboard.writeText(code).then(() => alert("Copied!"))}>
          Copy Code
        </button>
        <button style={s.primaryBtn} onClick={() => onJoined?.(code)}>
          Continue
        </button>
      </div>
    )
  }

  if (screen === "admin-auth") {
    return (
      <div style={s.container}>
        <div style={s.emoji}>🔐</div>
        <h2 style={s.title}>Admin Setup</h2>
        <p style={s.body}>Enter the admin password to create a new household.</p>
        <form onSubmit={handleAdminAuth} style={{ width:'100%', display:'flex', flexDirection:'column', gap:'10px' }}>
          <input
            style={s.input}
            type="password"
            placeholder="Admin password"
            value={adminPass}
            onChange={e => { setAdminPass(e.target.value); setPassError('') }}
            autoFocus
            autoComplete="current-password"
          />
          {passError && <p style={s.error}>{passError}</p>}
          <button type="submit" style={s.primaryBtn}>Create Household</button>
        </form>
        <button style={s.ghostBtn} onClick={() => { setScreen("join"); setAdminPass(''); setPassError('') }}>
          Back
        </button>
      </div>
    )
  }

  return (
    <div style={s.container}>
      <div style={s.emoji}>🏠</div>
      <h2 style={s.title}>Join Household</h2>
      <p style={s.body}>Enter the invite code from your household admin.</p>
      <form onSubmit={handleJoin} style={{ width:'100%', display:'flex', flexDirection:'column', gap:'10px' }}>
        <input
          style={s.input}
          placeholder="NOURISH-XXXX-XXXX-XXXX"
          value={inputCode}
          onChange={e => { setInputCode(e.target.value.toUpperCase()); setError('') }}
          autoCapitalize="characters"
          autoCorrect="off"
        />
        {error && <p style={s.error}>{error}</p>}
        <button type="submit" style={s.primaryBtn}>Join Household</button>
      </form>

      <div style={s.divider}><span style={s.dividerText}>or</span></div>

      <button style={s.ghostBtn} onClick={() => setScreen("admin-auth")}>
        Set up as admin
      </button>

      {onCancel && (
        <button style={s.cancelBtn} onClick={onCancel}>Skip for now</button>
      )}
    </div>
  )
}

export function getHouseholdCode() {
  return localStorage.getItem("nourish_household_code")
}

export function isHouseholdAdmin() {
  return localStorage.getItem("nourish_household_admin") === "true"
}

export function clearHousehold() {
  localStorage.removeItem("nourish_household_code")
  localStorage.removeItem("nourish_household_admin")
}

const s = {
  container:   { display:"flex", flexDirection:"column", alignItems:"center", gap:"14px", padding:"32px 24px", minHeight:"100dvh", background:"var(--bg-base)", boxSizing:"border-box" },
  emoji:       { fontSize:"52px", marginBottom:"8px" },
  title:       { fontSize:"24px", fontWeight:"600", color:"var(--text-primary)", letterSpacing:"-0.03em", margin:0, textAlign:"center" },
  body:        { fontSize:"15px", color:"var(--text-secondary)", textAlign:"center", lineHeight:"1.5", margin:0 },
  codeBox:     { width:"100%", padding:"20px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-lg)", textAlign:"center" },
  codeText:    { fontSize:"18px", letterSpacing:"2px", color:"var(--accent)", fontFamily:"var(--font-mono)", wordBreak:"break-all" },
  copyBtn:     { width:"100%", padding:"12px", background:"var(--accent-dim)", border:"none", borderRadius:"var(--r-lg)", color:"var(--accent)", fontSize:"15px", fontWeight:"600", cursor:"pointer" },
  input:       { width:"100%", padding:"14px", background:"var(--bg-elevated)", border:"1px solid var(--border-default)", borderRadius:"var(--r-lg)", fontSize:"16px", color:"var(--text-primary)", outline:"none", textAlign:"center", letterSpacing:"2px", fontFamily:"var(--font-mono)", boxSizing:"border-box" },
  error:       { color:"var(--red)", fontSize:"13px", margin:0 },
  primaryBtn:  { width:"100%", padding:"15px", background:"var(--accent)", border:"none", borderRadius:"var(--r-lg)", color:"var(--text-inverse)", fontSize:"16px", fontWeight:"600", cursor:"pointer" },
  divider:     { width:"100%", display:"flex", alignItems:"center", gap:"12px" },
  dividerText: { fontSize:"13px", color:"var(--text-tertiary)", flexShrink:0 },
  ghostBtn:    { width:"100%", padding:"13px", background:"transparent", border:"1px solid var(--border-default)", borderRadius:"var(--r-lg)", color:"var(--text-secondary)", fontSize:"15px", cursor:"pointer" },
  cancelBtn:   { background:"none", border:"none", color:"var(--text-tertiary)", fontSize:"13px", cursor:"pointer", padding:"4px" },
}
