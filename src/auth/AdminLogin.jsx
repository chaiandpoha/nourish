import { useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { db } from '../db/indexedDB.js'

const ADMIN_PASS  = import.meta.env.VITE_ADMIN_PASS  || 'nourish-admin'
const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase()

export default function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const { loginWithPin } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== ADMIN_PASS) { setError('Incorrect password'); return }
    setLoading(true)
    setError('')
    try {
      const users  = await db.users.toArray()
      if (users.length === 0) {
        // No profiles yet — go to main screen, Google sign-in will create one
        window.location.hash = '#/'
        return
      }

      // Find admin profile: prefer isAdmin flag, then email match, then first user
      const target =
        users.find(u => u.isAdmin) ||
        (ADMIN_EMAIL && users.find(u => (u.email || '').toLowerCase() === ADMIN_EMAIL)) ||
        users[0]

      if (!target.isAdmin) {
        await db.users.update(target.id, {
          isAdmin:   true,
          skipPin:   true,
          dirty:     1,
          updatedAt: new Date().toISOString(),
        })
      }

      sessionStorage.removeItem('nourish_logged_out')
      await loginWithPin(target.id, '', 'nourish-no-encryption')
      window.location.hash = '#/'
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.container}>
      <img src='/icons/icon-192.png' style={s.logo} alt='Nourish' />
      <h1 style={s.title}>Admin Access</h1>
      <p style={s.sub}>Breakglass login — admin only</p>
      <form onSubmit={handleSubmit} style={s.form}>
        <input
          type='password'
          placeholder='Admin password'
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          style={s.input}
          autoFocus
          autoComplete='current-password'
        />
        {error && <p style={s.error}>{error}</p>}
        <button type='submit' style={{ ...s.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
      <button style={s.back} onClick={() => { window.location.hash = '#/' }}>← Back</button>
    </div>
  )
}

const s = {
  container: { display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100dvh', background:'var(--bg-base)', padding:'24px', boxSizing:'border-box' },
  logo:      { width:'72px', height:'72px', borderRadius:'18px', marginBottom:'16px' },
  title:     { fontSize:'24px', fontWeight:'600', color:'var(--text-primary)', margin:'0 0 4px', letterSpacing:'-0.03em' },
  sub:       { fontSize:'13px', color:'var(--text-tertiary)', margin:'0 0 32px' },
  form:      { display:'flex', flexDirection:'column', gap:'12px', width:'100%', maxWidth:'320px' },
  input:     { padding:'13px 16px', fontSize:'16px', borderRadius:'var(--r-lg)', border:'1px solid var(--border-default)', background:'var(--bg-elevated)', color:'var(--text-primary)', outline:'none' },
  error:     { fontSize:'13px', color:'var(--red)', margin:'0', textAlign:'center' },
  btn:       { padding:'14px', background:'var(--text-primary)', color:'var(--text-inverse)', border:'none', borderRadius:'var(--r-lg)', fontSize:'15px', fontWeight:'600', cursor:'pointer' },
  back:      { marginTop:'24px', background:'none', border:'none', color:'var(--text-tertiary)', fontSize:'14px', cursor:'pointer' },
}
