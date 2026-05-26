import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { sha256, deriveKey, generateId } from './crypto.js'
import { db } from '../db/indexedDB.js'
import { initStorage, teardownStorage, flushDirtyRecords } from '../db/db.js'
import { AUTH } from '../config.js'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null)
  const [isLocked,      setIsLocked]      = useState(true)
  const [isLoading,     setIsLoading]     = useState(true)
  const [pinAttempts,   setPinAttempts]   = useState(0)
  const [lockoutUntil,  setLockoutUntil]  = useState(null)
  const [encryptionKey, setEncryptionKey] = useState(null)

  const autoLockTimer  = useRef(null)
  const activityEvents = ['touchstart', 'mousedown', 'keydown']

  useEffect(() => {
    // Restore Drive token from sessionStorage on app start
    import('../db/driveApi.js').then(({ restoreToken }) => {
      restoreToken()
    })
    setIsLoading(false)
  }, [])

  const resetAutoLockTimer = useCallback(() => {
    if (autoLockTimer.current) clearTimeout(autoLockTimer.current)
    const minutes = user?.settings?.autoLockMinutes ?? AUTH.autoLockMinutes
    if (minutes === 0) return
    autoLockTimer.current = setTimeout(() => lock(), minutes * 60 * 1000)
  }, [user])

  useEffect(() => {
    if (!user || isLocked) return
    activityEvents.forEach(e => window.addEventListener(e, resetAutoLockTimer))
    resetAutoLockTimer()
    return () => {
      activityEvents.forEach(e => window.removeEventListener(e, resetAutoLockTimer))
      if (autoLockTimer.current) clearTimeout(autoLockTimer.current)
    }
  }, [user, isLocked, resetAutoLockTimer])

  useEffect(() => {
    let hiddenAt = null
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (hiddenAt) {
        const minutesAway = (Date.now() - hiddenAt) / 1000 / 60
        if (minutesAway >= AUTH.backgroundLockMinutes) lock()
        hiddenAt = null
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  async function loginWithPin(userId, pin, passphrase) {
    const profile = await db.users.get(userId)
    if (!profile) throw new Error('Profile not found')

    if (!profile.skipPin && profile.pinHash) {
      if (lockoutUntil && Date.now() < lockoutUntil) {
        const seconds = Math.ceil((lockoutUntil - Date.now()) / 1000)
        throw new Error(`Locked out. Try again in ${seconds}s`)
      }
      const pinHash = await sha256(pin)
      if (pinHash !== profile.pinHash) {
        const attempts = pinAttempts + 1
        setPinAttempts(attempts)
        if (attempts >= AUTH.maxPinAttempts) {
          const lockSeconds = AUTH.lockoutBaseSeconds * Math.pow(2, attempts - AUTH.maxPinAttempts)
          setLockoutUntil(Date.now() + lockSeconds * 1000)
          setPinAttempts(0)
          throw new Error(`Too many attempts. Locked for ${lockSeconds}s`)
        }
        throw new Error(`Incorrect PIN. ${AUTH.maxPinAttempts - attempts} attempts remaining`)
      }
    }

    const key = await deriveKey(passphrase || 'nourish-no-encryption', profile.encryptionSalt)
    await completeLogin(profile, key)
    setPinAttempts(0)
    setLockoutUntil(null)
    return profile
  }

  async function loginWithBiometric(userId, passphrase) {
    const profile = await db.users.get(userId)
    if (!profile?.biometricCredentialId) throw new Error('No biometric registered')
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge:        crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ id: base64ToBuffer(profile.biometricCredentialId), type: 'public-key' }],
          userVerification: 'required',
          timeout:          60000,
        }
      })
    } catch (e) {
      throw new Error('Biometric failed — use PIN instead')
    }
    const key = await deriveKey(passphrase || 'nourish-no-encryption', profile.encryptionSalt)
    await completeLogin(profile, key)
    return profile
  }

  async function registerBiometric(userId) {
    const profile = await db.users.get(userId)
    if (!profile) throw new Error('Profile not found')
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge:        crypto.getRandomValues(new Uint8Array(32)),
        rp:               { name: 'Nourish', id: window.location.hostname },
        user:             { id: new TextEncoder().encode(userId), name: profile.email || userId, displayName: profile.name },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000,
      }
    })
    const credentialId = bufferToBase64(credential.rawId)
    await db.users.update(userId, { biometricCredentialId: credentialId, dirty: 1, updatedAt: new Date().toISOString() })
    return credentialId
  }

  async function completeLogin(profile, key) {
    setEncryptionKey(key)
    setUser(profile)
    setIsLocked(false)
    try {
      const { isTokenValid, restoreToken } = await import('../db/driveApi.js')
      // Try to restore token if not already valid
      if (!isTokenValid()) restoreToken()
      if (isTokenValid()) {
        console.log('Drive token valid — initializing storage')
        await initStorage(profile.id, key)
      } else {
        console.warn('No Drive token — offline mode')
      }
    } catch (e) {
      console.warn('Storage init error:', e.message)
    }
  }

  function logout() {
    if (user && encryptionKey) {
      flushDirtyRecords(user.id, encryptionKey).catch(() => {})
    }
    setUser(null)
    setEncryptionKey(null)
    setIsLocked(true)
    teardownStorage()
    if (autoLockTimer.current) clearTimeout(autoLockTimer.current)
    sessionStorage.setItem('nourish_logged_out', 'true')
    window.location.reload()
  }

  function lock() {
    if (user && encryptionKey) {
      flushDirtyRecords(user.id, encryptionKey).catch(() => {})
    }
    setUser(null)
    setEncryptionKey(null)
    setIsLocked(true)
    teardownStorage()
    if (autoLockTimer.current) clearTimeout(autoLockTimer.current)
    // Force route to profile selector
    window.location.hash = '#/'
  }

  async function createProfile({ name, email, pin, passphrase, avatarInitials, height, startWeight, macroGoals, supplements, skipPin }) {
    const id             = generateId()
    const pinHash        = (skipPin || !pin) ? null : await sha256(pin)
    const encryptionSalt = generateId()

    const profile = {
      id,
      name,
      email:          email || '',
      avatarInitials: avatarInitials || name.slice(0, 2).toUpperCase(),
      pinHash,
      skipPin:        skipPin || false,
      encryptionSalt,
      biometricCredentialId: null,
      height,
      startWeight,
      macroGoals: macroGoals || { calories: 2000, protein: 150, carbs: 200, fat: 65, fibre: 30 },
      supplements: supplements || [],
      aiInstructions: 'Suggest vegetarian Indian meals. Prioritise high protein foods like paneer, dal, curd, sprouts and eggs. Keep suggestions practical and easy to make.',
      settings: {
        autoLockMinutes:      skipPin ? 0 : 15,
        shareFoodNamesWithAI: true,
        shareMedNamesWithAI:  false,
        wifiOnlyPhotos:       true,
      },
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
      dirty:      1,
    }

    await db.users.put(profile)
    return profile
  }

  async function resetPin(userId, recoveryKey, newPin) {
    const profile = await db.users.get(userId)
    if (!profile) throw new Error('Profile not found')
    const recoveryHash = await sha256(recoveryKey)
    if (recoveryHash !== profile.recoveryKeyHash) throw new Error('Invalid recovery key')
    const newPinHash = await sha256(newPin)
    await db.users.update(userId, { pinHash: newPinHash, dirty: 1, updatedAt: new Date().toISOString() })
  }

  async function refreshUser() {
    if (!user) return
    const updated = await db.users.get(user.id)
    if (updated) setUser(updated)
  }

  const value = {
    user, isLocked, isLoading, encryptionKey, pinAttempts, lockoutUntil,
    loginWithPin, loginWithBiometric, registerBiometric, createProfile, resetPin, lock, logout, refreshUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

function bufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
}

function base64ToBuffer(base64) {
  const binary = atob(base64)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
  return buffer.buffer
}
