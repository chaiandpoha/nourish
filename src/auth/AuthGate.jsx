import { useState, useEffect } from "react"
import { useAuth } from "./useAuth.jsx"
import { db } from "../db/indexedDB.js"
import { AUTH } from "../config.js"

export default function AuthGate({ children }) {
  const { user, isLocked, isLoading } = useAuth()
  if (isLoading) return <SplashScreen />
  if (!user || isLocked) return <ProfileSelector />
  return children
}

function SplashScreen() {
  return (
    <div style={s.center}>
      <div style={s.logo}>🥗</div>
      <h1 style={s.appName}>Nourish</h1>
    </div>
  )
}

function ProfileSelector() {
  const [profiles,   setProfiles]   = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [screen,     setScreen]     = useState("select")
  const [loading,    setLoading]    = useState(true)
  const { loginWithPin } = useAuth()

  useEffect(() => {
    db.users.toArray().then(users => {
      setProfiles(users)
      setLoading(false)
      if (users.length === 1 && (users[0].skipPin || !users[0].pinHash)) {
        loginWithPin(users[0].id, "", "nourish-no-encryption").catch(console.error)
      }
    })
  }, [])

  if (loading) return <SplashScreen />

  if (profiles.length === 0) {
    window.location.hash = "#/onboarding"
    return null
  }

  if (screen === "pin") {
    return <PinEntry userId={selectedId} onBack={() => setScreen("select")} />
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.logo}>🥗</div>
        <h1 style={s.appName}>Nourish</h1>
        <p style={s.subtitle}>Who is logging today?</p>
      </div>
      <div style={s.profileGrid}>
        {profiles.map(profile => (
          <button
            key={profile.id}
            style={s.profileCard}
            onClick={async () => {
              setSelectedId(profile.id)
              if (profile.skipPin || !profile.pinHash) {
                try {
                  await loginWithPin(profile.id, "", "nourish-no-encryption")
                } catch(e) {
                  console.error("Auto login failed:", e)
                  setScreen("pin")
                }
              } else {
                setScreen("pin")
              }
            }}
          >
            <div style={s.avatar}>
              {profile.avatarInitials || profile.name.slice(0,2).toUpperCase()}
            </div>
            <span style={s.profileName}>{profile.name}</span>
          </button>
        ))}
        <button
          style={{ ...s.profileCard, ...s.addProfile }}
          onClick={() => { window.location.hash = "#/onboarding" }}
        >
          <div style={{ ...s.avatar, ...s.addAvatar }}>+</div>
          <span style={s.profileName}>Add Profile</span>
        </button>
      </div>
    </div>
  )
}

function PinEntry({ userId, onBack }) {
  const [pin,     setPin]     = useState("")
  const [error,   setError]   = useState("")
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState(null)
  const { loginWithPin, lockoutUntil } = useAuth()

  useEffect(() => {
    db.users.get(userId).then(p => {
      setProfile(p)
      if (p && (p.skipPin || !p.pinHash)) {
        loginWithPin(userId, "", "nourish-no-encryption").catch(console.error)
      }
    })
  }, [userId])

  const isLockedOut = lockoutUntil && Date.now() < lockoutUntil

  async function handlePinSubmit() {
    if (pin.length < AUTH.pinMinLength) {
      setError("PIN must be at least " + AUTH.pinMinLength + " digits")
      return
    }
    setLoading(true)
    setError("")
    try {
      await loginWithPin(userId, pin, "nourish-no-encryption")
    } catch(e) {
      setError(e.message)
      setPin("")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.container}>
      <button style={s.backBtn} onClick={onBack}>Back</button>
      <div style={s.header}>
        <div style={s.avatar}>{profile?.avatarInitials || "??"}</div>
        <h2 style={s.profileName}>{profile?.name}</h2>
      </div>
      <div style={s.pinDots}>
        {Array.from({ length: AUTH.pinMaxLength }).map((_, i) => (
          <div key={i} style={{ ...s.dot, ...(i < pin.length ? s.dotFilled : {}) }} />
        ))}
      </div>
      {error && <p style={s.error}>{error}</p>}
      {isLockedOut && <p style={s.error}>Locked out until {new Date(lockoutUntil).toLocaleTimeString()}</p>}
      <div style={s.keypad}>
        {[1,2,3,4,5,6,7,8,9,"",0,"x"].map((key, i) => (
          <button
            key={i}
            style={{ ...s.keypadBtn, ...(key === "" ? s.keypadEmpty : {}) }}
            onClick={() => {
              if (key === "x") setPin(p => p.slice(0,-1))
              else if (key !== "") setPin(p => p.length < AUTH.pinMaxLength ? p + key : p)
            }}
            disabled={loading || isLockedOut || key === ""}
          >
            {key}
          </button>
        ))}
      </div>
      <button
        style={{ ...s.submitBtn, opacity: loading || isLockedOut ? 0.6 : 1 }}
        onClick={handlePinSubmit}
        disabled={loading || isLockedOut}
      >
        {loading ? "Unlocking..." : "Unlock"}
      </button>
      <button style={s.forgotBtn} onClick={() => { window.location.hash = "#/recover" }}>
        Forgot PIN?
      </button>
    </div>
  )
}

const s = {
  center:      { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100dvh", background:"var(--bg-base)", color:"var(--text-primary)" },
  container:   { display:"flex", flexDirection:"column", alignItems:"center", minHeight:"100dvh", background:"var(--bg-base)", color:"var(--text-primary)", padding:"24px 16px", boxSizing:"border-box" },
  header:      { display:"flex", flexDirection:"column", alignItems:"center", marginBottom:"32px", marginTop:"16px" },
  logo:        { fontSize:"52px", marginBottom:"8px" },
  appName:     { fontSize:"28px", fontWeight:"300", margin:"0 0 4px", letterSpacing:"-0.03em", fontFamily:"Georgia, serif", fontStyle:"italic", color:"var(--text-primary)" },
  subtitle:    { fontSize:"15px", color:"var(--text-secondary)", margin:0 },
  profileGrid: { display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:"12px", width:"100%", maxWidth:"320px" },
  profileCard: { display:"flex", flexDirection:"column", alignItems:"center", gap:"10px", padding:"20px 16px", background:"var(--bg-surface)", border:"0.5px solid var(--border-subtle)", borderRadius:"var(--r-xl)", cursor:"pointer", color:"var(--text-primary)" },
  addProfile:  { border:"1px dashed var(--border-default)", background:"transparent" },
  avatar:      { width:"52px", height:"52px", borderRadius:"50%", background:"var(--text-primary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px", fontWeight:"600", color:"var(--text-inverse)" },
  addAvatar:   { background:"transparent", border:"1.5px dashed var(--border-strong)", color:"var(--text-tertiary)", fontSize:"24px", fontWeight:"300" },
  profileName: { fontSize:"14px", fontWeight:"500", color:"var(--text-primary)" },
  backBtn:     { alignSelf:"flex-start", background:"none", border:"none", color:"var(--accent)", fontSize:"15px", cursor:"pointer", padding:"4px 0", marginBottom:"8px" },
  pinDots:     { display:"flex", gap:"10px", marginBottom:"24px" },
  dot:         { width:"12px", height:"12px", borderRadius:"50%", border:"1.5px solid var(--border-strong)", background:"transparent", transition:"background 0.1s" },
  dotFilled:   { background:"var(--text-primary)", border:"1.5px solid var(--text-primary)" },
  error:       { color:"var(--red)", fontSize:"13px", marginBottom:"10px", textAlign:"center" },
  keypad:      { display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"10px", width:"100%", maxWidth:"280px", marginBottom:"20px" },
  keypadBtn:   { height:"60px", background:"var(--bg-surface)", border:"0.5px solid var(--border-subtle)", borderRadius:"var(--r-lg)", color:"var(--text-primary)", fontSize:"22px", fontWeight:"400", cursor:"pointer" },
  keypadEmpty: { background:"transparent", border:"none", cursor:"default" },
  submitBtn:   { width:"100%", maxWidth:"280px", padding:"15px", background:"var(--text-primary)", border:"none", borderRadius:"var(--r-lg)", color:"var(--text-inverse)", fontSize:"16px", fontWeight:"500", cursor:"pointer", marginBottom:"12px" },
  forgotBtn:   { background:"none", border:"none", color:"var(--text-tertiary)", fontSize:"13px", cursor:"pointer", marginTop:"8px" },
}
