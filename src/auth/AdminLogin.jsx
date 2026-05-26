import { useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { db } from '../db/indexedDB.js'

const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || 'nourish-admin'

export default function AdminLogin() {
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const { loginWithPin } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== ADMIN_PASS) {
      setError('Incorrect password')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Ensure household code exists
      if (!localStorage.getItem('nourish_household_code')) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        const rand  = crypto.getRandomValues(new Uint8Array(12))
        const raw   = Array.from(rand).map(b => chars[b % chars.length]).join('')
        localStorage.setItem('nourish_household_code',  'NOURISH-' + raw.slice(0,4) + '-' + raw.slice(4,8) + '-' + raw.slice(8,12))
        localStorage.setItem('nourish_household_admin', 'true')
      }

      const users  = await db.users.toArray()
      if (users.length === 0) {
        // No profiles yet — mark pending admin and go to onboarding
        localStorage.setItem('nourish_pending_admin', 'true')
        window.location.hash = '#/onboarding'
        return
      }

      // Prefer an existing admin profile, else promote the first
      const target = users.find(u => u.isAdmin) || users[0]
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
}
