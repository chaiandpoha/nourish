// Google Drive API wrapper
// Admin's Drive is the central store for all users' data.
// Admin token is persisted in localStorage so sync works even when
// non-admin users are logged in. Non-admin Google tokens are used
// only for identity (fetchUserInfo), never for Drive operations.

const DRIVE_API    = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'

// ─── Identity (current session — not used for Drive ops) ─────────────────────
let _accessToken = null
let _tokenExpiry = 0
let _userEmail   = null
let _userName    = null

export function getUserEmail() { return _userEmail }
export function getUserName()  { return _userName  }

export function setAccessToken(token, expiresInSeconds) {
  _accessToken = token
  _tokenExpiry = Date.now() + (expiresInSeconds - 60) * 1000
  sessionStorage.setItem('drive_token',        token)
  sessionStorage.setItem('drive_token_expiry', String(_tokenExpiry))
  // Also persist expiry so we can detect stale tokens after PWA relaunch
  localStorage.setItem('drive_token_expiry', String(_tokenExpiry))
}

// ─── Admin token (central Drive — persisted in localStorage) ─────────────────
let _adminToken  = null
let _adminExpiry = 0

function _loadAdminToken() {
  const token  = localStorage.getItem('drive_admin_token')
  const expiry = parseInt(localStorage.getItem('drive_admin_expiry') || '0')
  if (token && expiry > Date.now() + 30_000) {
    _adminToken  = token
    _adminExpiry = expiry
    return true
  }
  return false
}

function _saveAdminToken(token, expiry) {
  _adminToken  = token
  _adminExpiry = expiry
  localStorage.setItem('drive_admin_token',  token)
  localStorage.setItem('drive_admin_expiry', String(expiry))
}

/** Returns true if the admin Drive token is available and not expired */
export function isTokenValid() {
  if (_adminToken && Date.now() < _adminExpiry - 30_000) return true
  return _loadAdminToken()
}

/** Clear current user's session (does NOT clear admin Drive token) */
export function clearAccessToken() {
  _accessToken = null
  _tokenExpiry = 0
  _userEmail   = null
  _userName    = null
  sessionStorage.removeItem('drive_token')
  sessionStorage.removeItem('drive_token_expiry')
  sessionStorage.removeItem('drive_user_email')
  sessionStorage.removeItem('drive_user_name')
  localStorage.removeItem('drive_user_email')
  localStorage.removeItem('drive_user_name')
  localStorage.removeItem('drive_token_expiry')
}

/** Clear admin Drive token — only used during factory reset */
export function clearAdminToken() {
  _adminToken  = null
  _adminExpiry = 0
  localStorage.removeItem('drive_admin_token')
  localStorage.removeItem('drive_admin_expiry')
}

/** Restore tokens from storage on app startup */
export function restoreToken() {
  _loadAdminToken()
  // Prefer sessionStorage (same PWA session), fall back to localStorage (survived relaunch)
  const email = sessionStorage.getItem('drive_user_email') || localStorage.getItem('drive_user_email')
  const name  = sessionStorage.getItem('drive_user_name')  || localStorage.getItem('drive_user_name')
  if (email) { _userEmail = email; _userName = name || '' }
  const stored = sessionStorage.getItem('drive_token')
  const expiry = parseInt(sessionStorage.getItem('drive_token_expiry') || '0')
  if (stored && Date.now() < expiry) {
    _accessToken = stored
    _tokenExpiry = expiry
  }
  return isTokenValid()
}

/** Fetch user's email + name from Google.
 *  If this user is the admin, their token is saved as the persistent Drive token. */
export async function fetchUserInfo() {
  if (!_accessToken) return null
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: { Authorization: `Bearer ${_accessToken}` },
    })
    if (!res.ok) return null
    const info = await res.json()
    _userEmail = info.email || null
    _userName  = info.name  || null
    if (_userEmail) {
      sessionStorage.setItem('drive_user_email', _userEmail)
      localStorage.setItem('drive_user_email', _userEmail)
    }
    if (_userName) {
      sessionStorage.setItem('drive_user_name', _userName)
      localStorage.setItem('drive_user_name', _userName)
    }

    // Persist admin's token as the central Drive token
    const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || '').toLowerCase()
    if (_userEmail?.toLowerCase() === adminEmail && _accessToken) {
      _saveAdminToken(_accessToken, _tokenExpiry)
    }

    return info
  } catch {
    return null
  }
}

// ─── OAuth flow ───────────────────────────────────────────────────────────────

export function initiateOAuthFlow() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID not set')
  const params = new URLSearchParams({
    client_id:              clientId,
    redirect_uri:           `${window.location.origin}/auth/callback`,
    response_type:          'token',
    scope:                  SCOPES,
    include_granted_scopes: 'true',
  })
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function parseOAuthCallback() {
  const params    = new URLSearchParams(window.location.hash.slice(1))
  const token     = params.get('access_token')
  const expiresIn = parseInt(params.get('expires_in') || '3600', 10)
  const error     = params.get('error')
  if (error) throw new Error(`OAuth error: ${error}`)
  if (!token) throw new Error('No access token in callback URL')
  setAccessToken(token, expiresIn)
  window.history.replaceState(null, '', window.location.pathname)
  return token
}

// ─── Auth headers — always uses admin token ───────────────────────────────────

function authHeaders(extra = {}) {
  if (!isTokenValid()) throw new Error('Drive not available — admin needs to sign in first')
  return { Authorization: `Bearer ${_adminToken}`, ...extra }
}

// ─── Folder management ────────────────────────────────────────────────────────

export async function findFolder(name, parentId = 'root') {
  const q = [
    `name='${name}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    `'${parentId}' in parents`,
    `trashed=false`,
  ].join(' and ')
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`Drive findFolder failed: ${res.status}`)
  return (await res.json()).files?.[0]?.id || null
}

export async function createFolder(name, parentId = 'root') {
  const res = await fetch(`${DRIVE_API}/files`, {
    method:  'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body:    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  if (!res.ok) throw new Error(`Drive createFolder failed: ${res.status}`)
  return (await res.json()).id
}

export async function ensureFolder(name, parentId = 'root') {
  return (await findFolder(name, parentId)) || (await createFolder(name, parentId))
}

/**
 * Build folder structure in admin's central Drive:
 *   Nourish/users/{userEmail}/
 *                              foodLogs/
 *                              workoutLogs/
 *                              progress/
 */
export async function ensureFolderStructure(userEmail) {
  const root    = await ensureFolder('Nourish')
  const users   = await ensureFolder('users', root)
  const userDir = await ensureFolder(userEmail, users)
  const foodLogsDir    = await ensureFolder('foodLogs', userDir)
  const workoutLogsDir = await ensureFolder('workoutLogs', userDir)
  const progressDir    = await ensureFolder('progress', userDir)
  return { root, users, userDir, foodLogsDir, workoutLogsDir, progressDir }
}

export async function listFolders(parentId) {
  const q = [`'${parentId}' in parents`, `mimeType='application/vnd.google-apps.folder'`, `trashed=false`].join(' and ')
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`Drive listFolders failed: ${res.status}`)
  return (await res.json()).files || []
}

export async function listFiles(parentId) {
  const q = [`'${parentId}' in parents`, `trashed=false`, `mimeType!='application/vnd.google-apps.folder'`].join(' and ')
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1000`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`Drive listFiles failed: ${res.status}`)
  return (await res.json()).files || []
}

export async function findFile(name, parentId) {
  const q = [`name='${name}'`, `'${parentId}' in parents`, `trashed=false`].join(' and ')
  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,size)`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`Drive findFile failed: ${res.status}`)
  return (await res.json()).files?.[0] || null
}

export async function readFile(fileId) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Drive readFile failed: ${res.status}`)
  return res.json()
}

export async function writeFile(name, data, parentId, existingFileId = null) {
  const json = JSON.stringify(data)
  const blob = new Blob([json], { type: 'application/json' })

  if (existingFileId) {
    const res = await fetch(
      `${DRIVE_UPLOAD}/files/${existingFileId}?uploadType=media`,
      { method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), body: blob }
    )
    if (!res.ok) throw new Error(`Drive writeFile (update) failed: ${res.status}`)
    return existingFileId
  }

  const metadata = JSON.stringify({ name, parents: [parentId] })
  const boundary = 'nourish_boundary_' + Date.now()
  const multipart = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', metadata,
    `--${boundary}`, 'Content-Type: application/json', '', json, `--${boundary}--`,
  ].join('\r\n')

  const res = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`,
    { method: 'POST', headers: authHeaders({ 'Content-Type': `multipart/related; boundary=${boundary}` }), body: multipart }
  )
  if (!res.ok) throw new Error(`Drive writeFile (create) failed: ${res.status}`)
  return (await res.json()).id
}

export async function uploadBlob(name, blob, parentId, existingFileId = null) {
  if (existingFileId) {
    const res = await fetch(
      `${DRIVE_UPLOAD}/files/${existingFileId}?uploadType=media`,
      { method: 'PATCH', headers: authHeaders({ 'Content-Type': blob.type }), body: blob }
    )
    if (!res.ok) throw new Error(`Drive uploadBlob (update) failed: ${res.status}`)
    return existingFileId
  }
  const metadata = JSON.stringify({ name, parents: [parentId] })
  const boundary = 'nourish_photo_' + Date.now()
  const body = new FormData()
  body.append('metadata', new Blob([metadata], { type: 'application/json' }))
  body.append('file', blob)
  const res = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`,
    { method: 'POST', headers: authHeaders(), body }
  )
  if (!res.ok) throw new Error(`Drive uploadBlob failed: ${res.status}`)
  return (await res.json()).id
}

export async function checkQuota() {
  const res = await fetch(`${DRIVE_API}/about?fields=storageQuota`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Drive checkQuota failed: ${res.status}`)
  const { storageQuota: { usage, limit } } = await res.json()
  return {
    used:      parseInt(usage, 10),
    limit:     parseInt(limit, 10),
    available: parseInt(limit, 10) - parseInt(usage, 10),
  }
}

export async function deleteFile(fileId) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok && res.status !== 404) throw new Error(`Drive deleteFile failed: ${res.status}`)
}
