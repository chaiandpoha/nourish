// Web Crypto API wrappers — all crypto stays in the browser
// Never use this for key storage — keys live in memory only

// ─── Hashing ──────────────────────────────────────────────────────────────────

/** SHA-256 hash — returns hex string. Used for PIN hashing. */
export async function sha256(text) {
  const encoder = new TextEncoder()
  const data    = encoder.encode(text)
  const hash    = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Key derivation ───────────────────────────────────────────────────────────

/**
 * Derive an AES-GCM key from a passphrase + salt using PBKDF2.
 * Used to derive the encryption key from the user's passphrase.
 */
export async function deriveKey(passphrase, salt) {
  const encoder  = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       encoder.encode(salt),
      iterations: 100000,
      hash:       'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,       // not extractable — key never leaves memory
    ['encrypt', 'decrypt']
  )
}

// ─── Encryption ───────────────────────────────────────────────────────────────

/**
 * Encrypt a string with AES-GCM.
 * Returns { iv, ciphertext } as base64 strings — safe to store as JSON.
 */
export async function encrypt(plaintext, key) {
  const encoder  = new TextEncoder()
  const iv       = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV
  const encoded  = encoder.encode(plaintext)

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  return {
    iv:         btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipherBuffer))),
  }
}

/**
 * Decrypt an { iv, ciphertext } object produced by encrypt().
 * Returns plaintext string.
 */
export async function decrypt(encrypted, key) {
  const iv         = Uint8Array.from(atob(encrypted.iv),         c => c.charCodeAt(0))
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0))

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(decrypted)
}

// ─── Recovery key ─────────────────────────────────────────────────────────────

/**
 * Generate a random 24-character recovery key.
 * Displayed once during onboarding — user must save it.
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */
export function generateRecoveryKey() {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I confusion
  const random = crypto.getRandomValues(new Uint8Array(24))
  const key    = Array.from(random)
    .map(b => chars[b % chars.length])
    .join('')
  return key.match(/.{4}/g).join('-') // XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
}

// ─── UUID ─────────────────────────────────────────────────────────────────────

/** Generate a cryptographically random UUID v4 */
export function generateId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 0x0f)
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
      })
}