import { useState, useEffect } from "react"
import { useAuth } from "./useAuth.jsx"
import { db } from "../db/indexedDB.js"

export default function AuthGate({ children }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <SplashScreen />
  if (!user) return <ProfileSelector />
  return children
}

function SplashScreen() {
  return (
    <div style={s.center}>
      <img src='/icons/icon-192.png' style={{ width:'64px', height:'64px', borderRadius:'16px', marginBottom:'8px' }} alt='Nourish' />
      <h1 style={s.appName}>Nourish</h1>
    </div>
  )
}

function ProfileSelector() {
  const [profiles, setProfiles] = useState([])
  const [loading,  setLoading]  = useState(true)
  const { loginWithPin } = useAuth()

  useEffect(() => {
    const loggedOut = sessionStorage.getItem("nourish_logged_out")
    db.users.toArray().then(users => {
      setProfiles(users)
      setLoading(false)

      if (users.length === 0) {
        window.location.hash = "#/onboarding"
        return
      }

      // Auto-login if not logged out
      if (!loggedOut && users.length >= 1) {
        const u = users[0]
        if (!u.pinHash || u.skipPin) {
          loginWithPin(u.id, "", "nourish-no-encryption").catch(console.error)
        }
      }
    })
  }, [])

  if (loading) return <SplashScreen />
  if (profiles.length === 0) return null

  // Non-admin with one profile — show single profile tap to login
  const isAdmin = profiles.some(p => p.isAdmin)

  return (
    <div style={s.container}>
      <div style={s.header}>
        <img src='/icons/icon-192.png' style={{ width:'64px', height:'64px', borderRadius:'16px', marginBottom:'8px' }} alt='Nourish' />
        <h1 style={s.appName}>Nourish</h1>
      </div>

      {/* Admin sees all profiles, regular user sees only theirs */}
      <div style={s.profileGrid}>
        {(isAdmin ? profiles : profiles.slice(0,1)).map(profile => (
          <button
            key={profile.id}
            style={s.profileCard}
            onClick={() => {
              sessionStorage.removeItem("nourish_logged_out")
              loginWithPin(profile.id, "", "nourish-no-encryption").catch(console.error)
            }}
          >
            <div style={s.avatar}>
              {profile.avatarInitials || profile.name.slice(0,2).toUpperCase()}
            </div>
            <span style={s.profileName}>{profile.name}</span>
            {profile.isAdmin && <span style={s.adminBadge}>Admin</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

const s = {
  center:      { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100dvh", background:"var(--bg-base)", color:"var(--text-primary)" },
  container:   { display:"flex", flexDirection:"column", alignItems:"center", minHeight:"100dvh", background:"var(--bg-base)", color:"var(--text-primary)", padding:"24px 16px", boxSizing:"border-box" },
  header:      { display:"flex", flexDirection:"column", alignItems:"center", marginBottom:"32px", marginTop:"16px" },
  logo:        { marginBottom:'8px' },
  appName:     { fontSize:"28px", fontWeight:"300", margin:"0 0 4px", letterSpacing:"-0.03em", fontFamily:"Georgia, serif", fontStyle:"italic", color:"var(--text-primary)" },
  profileGrid: { display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:"12px", width:"100%", maxWidth:"320px" },
  profileCard: { display:"flex", flexDirection:"column", alignItems:"center", gap:"10px", padding:"20px 16px", background:"var(--bg-surface)", border:"0.5px solid var(--border-subtle)", borderRadius:"var(--r-xl)", cursor:"pointer", color:"var(--text-primary)" },
  avatar:      { width:"52px", height:"52px", borderRadius:"50%", background:"var(--text-primary)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px", fontWeight:"600", color:"var(--text-inverse)" },
  profileName: { fontSize:"14px", fontWeight:"500", color:"var(--text-primary)" },
  adminBadge:  { fontSize:"10px", fontWeight:"700", background:"var(--accent-dim)", color:"var(--accent)", padding:"2px 8px", borderRadius:"99px", letterSpacing:"0.04em" },
}
