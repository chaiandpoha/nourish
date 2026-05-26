import { useState, useEffect } from "react"
import { useAuth } from "./useAuth.jsx"
import { isTokenValid, getUserEmail, getUserName, initiateOAuthFlow } from "../db/driveApi.js"

export default function AuthGate({ children }) {
  const { user, isLoading, loginWithGoogle } = useAuth()
  const [autoLoggingIn, setAutoLoggingIn] = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    if (isLoading || user) return
    const email = getUserEmail()
    if (email && isTokenValid()) {
      setAutoLoggingIn(true)
      loginWithGoogle(email, getUserName())
        .catch(e => setError(e.message))
        .finally(() => setAutoLoggingIn(false))
    }
  }, [isLoading, user])

  if (isLoading || autoLoggingIn) return <SplashScreen />
  if (!user) return <GoogleSignInScreen error={error} />
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

function GoogleSignInScreen({ error }) {
  const [loading, setLoading] = useState(false)

  return (
    <div style={s.container}>
      <div style={s.header}>
        <img src='/icons/icon-192.png' style={{ width:'72px', height:'72px', borderRadius:'18px', marginBottom:'12px' }} alt='Nourish' />
        <h1 style={s.appName}>Nourish</h1>
        <p style={s.sub}>Your private health tracker</p>
      </div>

      <button
        style={{ ...s.googleBtn, opacity: loading ? 0.7 : 1 }}
        onClick={() => { setLoading(true); initiateOAuthFlow() }}
        disabled={loading}
      >
        <span style={s.googleG}>G</span>
        {loading ? 'Redirecting…' : 'Sign in with Google'}
      </button>

      {error && <p style={s.error}>{error}</p>}
    </div>
  )
}

const s = {
  center:    { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100dvh", background:"var(--bg-base)", color:"var(--text-primary)" },
  container: { display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100dvh", background:"var(--bg-base)", color:"var(--text-primary)", padding:"24px", boxSizing:"border-box", gap:"12px" },
  header:    { display:"flex", flexDirection:"column", alignItems:"center", marginBottom:"24px" },
  appName:   { fontSize:"32px", fontWeight:"300", margin:"0 0 6px", letterSpacing:"-0.03em", fontFamily:"Georgia, serif", fontStyle:"italic", color:"var(--text-primary)" },
  sub:       { fontSize:"15px", color:"var(--text-tertiary)", margin:0 },
  googleBtn: { display:"flex", alignItems:"center", gap:"10px", padding:"15px 28px", background:"var(--bg-surface)", border:"1px solid var(--border-default)", borderRadius:"var(--r-lg)", color:"var(--text-primary)", fontSize:"16px", fontWeight:"600", cursor:"pointer", width:"100%", maxWidth:"320px", justifyContent:"center" },
  googleG:   { fontWeight:"800", fontSize:"18px", color:"#4285F4" },
  error:     { fontSize:"13px", color:"var(--red)", margin:"8px 0 0", textAlign:"center" },
}
