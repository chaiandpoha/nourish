// Google Sign-In — identity only (email + profile), no Drive access
const SCOPES       = 'openid email profile'
const REDIRECT_URI = `${window.location.origin}/auth/callback`

let _accessToken = null
let _userEmail   = null
let _userName    = null

export function getUserEmail() {
  return _userEmail || sessionStorage.getItem('auth_user_email') || null
}
export function getUserName() {
  return _userName || sessionStorage.getItem('auth_user_name') || null
}

export function initiateOAuthFlow() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID not set')
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  REDIRECT_URI,
    response_type: 'token',
    scope:         SCOPES,
    prompt:        'select_account',
  })
  window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params
}

export function parseOAuthCallback() {
  const hash   = window.location.hash.slice(1)
  const params = new URLSearchParams(hash)
  const token  = params.get('access_token')
  if (!token) throw new Error('No access token in OAuth callback')
  const expiresIn = parseInt(params.get('expires_in') || '3600')
  _accessToken = token
  sessionStorage.setItem('auth_access_token',        token)
  sessionStorage.setItem('auth_token_expiry', String(Date.now() + expiresIn * 1000))
}

export async function fetchUserInfo() {
  const token = _accessToken || sessionStorage.getItem('auth_access_token')
  if (!token) throw new Error('No access token available')
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`userinfo ${res.status}`)
  const info = await res.json()
  _userEmail = (info.email || '').toLowerCase()
  _userName  = info.name  || ''
  sessionStorage.setItem('auth_user_email', _userEmail)
  sessionStorage.setItem('auth_user_name',  _userName)
  return info
}
