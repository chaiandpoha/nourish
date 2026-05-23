// Google Drive API wrapper
// Handles OAuth tokens, folder structure, file read/write, and token refresh

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const SCOPES = 'https://www.googleapis.com/auth/drive.file'

// ─── Token storage (in-memory only — never persisted to disk) ────────────────
let _accessToken = null
let _tokenExpiry = null  // timestamp ms

export function setAccessToken(token, expiresInSeconds) {
  _accessToken = token
  _tokenExpiry = Date.now() + (expiresInSeconds - 60) * 1000 // 60s buffer
}

export function clearAccessToken() {
  _accessToken = null
  _tokenExpiry = null
}

export function isTokenValid() {
  return _accessToken !== null && Date.now() < _tokenExpiry
}

// ─── OAuth flow ──────────────────────────────────────────────────────────────

/** Kick off Google OAuth — redirects browser to Google consent screen */
export function initiateOAuthFlow() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID not set')

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  `${window.location.origin}/auth/callback`,
    response_type: 'token',         // implicit flow — token returned in URL hash
    scope:         SCOPES,
    include_granted_scopes: 'true',
  })

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

/** Parse token from URL hash after OAuth redirect */
export function parseOAuthCallback() {
  const hash = window.location.hash.slice(1)
  const params = new URLSearchParams(hash)
  const token      = params.get('access_token')
  const expiresIn  = parseInt(params.get('expires_in') || '3600', 10)
  const error      = params.get('error')

  if (error) throw new Error(`OAuth error: ${error}`)
  if (!token) throw new Error('No access token in callback URL')

  setAccessToken(token, expiresIn)

  // Clean hash from URL — don't leave token in browser history
  window.history.replaceState(null, '', window.location.pathname)

  return token
}

// ─── Auth headers ────────────────────────────────────────────────────────────

function authHeaders(extra = {}) {
  if (!isTokenValid()) throw new Error('No valid access token — re-authenticate')
  return {
    Authorization: `Bearer ${_accessToken}`,
    ...extra,
  }
}

// ─── Folder management ───────────────────────────────────────────────────────

/** Find a folder by name under a parent — returns fileId or null */
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
  const data = await res.json()
  return data.files?.[0]?.id || null
}

/** Create a folder — returns fileId */
export async function createFolder(name, parentId = 'root') {
  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  if (!res.ok) throw new Error(`Drive createFolder failed: ${res.status}`)
  const data = await res.json()
  return data.id
}

/** Find or create a folder — returns fileId */
export async function ensureFolder(name, parentId = 'root') {
  const existing = await findFolder(name, parentId)
  if (existing) return existing
  return createFolder(name, parentId)
}

/**
 * Build full Nourish folder structure on first login:
 * Nourish/
 *   shared/
 *     foods.json
 *     batches.json
 *   users/
 *     [userId]/
 *       profile.json
 *       foodLogs/
 *       workoutLogs/
 *       progress/
 */
export async function ensureFolderStructure(userId) {
  const root    = await ensureFolder('Nourish')
  const shared  = await ensureFolder('shared', root)
  const users   = await ensureFolder('users', root)
  const userDir = await ensureFolder(userId, users)
  const foodLogsDir    = await ensureFolder('foodLogs', userDir)
  const workoutLogsDir = await ensureFolder('workoutLogs', userDir)
  const progressDir    = await ensureFolder('progress', userDir)

  return { root, shared, users, userDir, foodLogsDir, workoutLogsDir, progressDir }
}

// ─── File operations ─────────────────────────────────────────────────────────

/** Find a file by name under a parent — returns { id, name } or null */
export async function findFile(name, parentId) {
  const q = [
    `name='${name}'`,
    `'${parentId}' in parents`,
    `trashed=false`,
  ].join(' and ')

  const res = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,size)`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`Drive findFile failed: ${res.status}`)
  const data = await res.json()
  return data.files?.[0] || null
}

/** Read a file by fileId — returns parsed JSON */
export async function readFile(fileId) {
  const res = await fetch(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`Drive readFile failed: ${res.status}`)
  return res.json()
}

/** Write JSON to Drive — creates or updates file in parent folder */
export async function writeFile(name, data, parentId, existingFileId = null) {
  const json = JSON.stringify(data)
  const blob = new Blob([json], { type: 'application/json' })

  if (existingFileId) {
    // Update existing file — PATCH with media upload
    const res = await fetch(
      `${DRIVE_UPLOAD}/files/${existingFileId}?uploadType=media`,
      {
        method:  'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body:    blob,
      }
    )
    if (!res.ok) throw new Error(`Drive writeFile (update) failed: ${res.status}`)
    return existingFileId
  }

  // Create new file — multipart upload with metadata + content
  const metadata = JSON.stringify({ name, parents: [parentId] })
  const boundary = 'nourish_boundary_' + Date.now()
  const multipart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    json,
    `--${boundary}--`,
  ].join('\r\n')

  const res = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`,
    {
      method:  'POST',
      headers: authHeaders({
        'Content-Type': `multipart/related; boundary=${boundary}`,
      }),
      body: multipart,
    }
  )
  if (!res.ok) throw new Error(`Drive writeFile (create) failed: ${res.status}`)
  const result = await res.json()
  return result.id
}

/** Upload a binary blob (progress photo) — returns fileId */
export async function uploadBlob(name, blob, parentId, existingFileId = null) {
  if (existingFileId) {
    const res = await fetch(
      `${DRIVE_UPLOAD}/files/${existingFileId}?uploadType=media`,
      {
        method:  'PATCH',
        headers: authHeaders({ 'Content-Type': blob.type }),
        body:    blob,
      }
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
    {
      method:  'POST',
      headers: authHeaders(),
      body,
    }
  )
  if (!res.ok) throw new Error(`Drive uploadBlob failed: ${res.status}`)
  const result = await res.json()
  return result.id
}

/** Check Drive storage quota — returns { used, limit, available } in bytes */
export async function checkQuota() {
  const res = await fetch(
    `${DRIVE_API}/about?fields=storageQuota`,
    { headers: authHeaders() }
  )
  if (!res.ok) throw new Error(`Drive checkQuota failed: ${res.status}`)
  const data = await res.json()
  const { usage, limit } = data.storageQuota
  return {
    used:      parseInt(usage, 10),
    limit:     parseInt(limit, 10),
    available: parseInt(limit, 10) - parseInt(usage, 10),
  }
}

/** Delete a file by fileId */
export async function deleteFile(fileId) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method:  'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive deleteFile failed: ${res.status}`)
  }
}