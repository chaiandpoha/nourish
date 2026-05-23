import { useState, useEffect } from 'react'
import { useAuth } from './useAuth.jsx'
import { db } from '../db/indexedDB.js'
import { AUTH } from '../config.js'

// ─── AuthGate ─────────────────────────────────────────────────────────────────
// Wraps the entire app — shows profile selector or PIN entry until unlocked

export default function AuthGate({ children }) {
  const { user, isLocked, isLoading } = useAuth()

  if (isLoading) return <SplashScreen />
  if (!user || isLocked) return <ProfileSelector />
  return children
}

// ─── Splash screen ────────────────────────────────────────────────────────────

function SplashScreen() {
  return (
    <div style={styles.center}>
      <div style={styles.logo}>🥗</div>
      <h1 style={styles.appName}>Nourish</h1>
    </div>
  )
}

// ─── Profile selector ─────────────────────────────────────────────────────────

function ProfileSelector() {
  const [profiles,       setProfiles]       = useState([])
  const [selectedId,     setSelectedId]     = useState(null)
  const [screen,         setScreen]         = useState('select') // select | pin | biometric
  const [loading,        setLoading]        = useState(true)
  const { loginWithPin, loginWithBiometric } = useAuth()

  useEffect(() => {
    db.users.toArray().then(users => {
      setProfiles(users)
      setLoading(false)
    })
  }, [])

  if (loading) return <SplashScreen />

  // No profiles yet — go to onboarding (handled in App.jsx routing)
  if (profiles.length === 0) {
    window.location.hash = '#/onboarding'
    return null
  }

  if (screen === 'pin') {
    return (
      <PinEntry
        userId={selectedId}
        onBack={() => setScreen('select')}
      />
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>🥗</div>
        <h1 style={styles.appName}>Nourish</h1>
        <p style={styles.subtitle}>Who's logging today?</p>
      </div>

      <div style={styles.profileGrid}>
        {profiles.map(profile => (
          <button
            key={profile.id}
            style={styles.profileCard}
            onClick={() => {
              setSelectedId(profile.id)
              setScreen('pin')
            }}
          >
            <div style={styles.avatar}>
              {profile.avatarInitials || profile.name.slice(0, 2).toUpperCase()}
            </div>
            <span style={styles.profileName}>{profile.name}</span>
          </button>
        ))}

        <button
          style={{ ...styles.profileCard, ...styles.addProfile }}
          onClick={() => { window.location.hash = '#/onboarding' }}
        >
          <div style={{ ...styles.avatar, ...styles.addAvatar }}>+</div>
          <span style={styles.profileName}>Add Profile</span>
        </button>
      </div>
    </div>
  )
}

// ─── PIN entry ────────────────────────────────────────────────────────────────

function PinEntry({ userId, onBack }) {
  const [pin,          setPin]          = useState('')
  const [passphrase,   setPassphrase]   = useState('')
  const [error,        setError]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [showPass,     setShowPass]     = useState(false)
  const [profile,      setProfile]      = useState(null)
  const [showBiometric, setShowBiometric] = useState(false)

  const { loginWithPin, loginWithBiometric, lockoutUntil } = useAuth()

  useEffect(() => {
    db.users.get(userId).then(p => {
      setProfile(p)
      // Offer biometric if registered and available
      if (p?.biometricCredentialId && window.PublicKeyCredential) {
        setShowBiometric(true)
      }
    })
  }, [userId])

  const isLockedOut = lockoutUntil && Date.now() < lockoutUntil

  async function handlePinSubmit() {
    if (pin.length < AUTH.pinMinLength) {
      setError(`PIN must be at least ${AUTH.pinMinLength} digits`)
      return
    }
    if (!passphrase.trim()) {
      setError('Passphrase required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await loginWithPin(userId, pin, passphrase)
    } catch (e) {
      setError(e.message)
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  async function handleBiometric() {
    if (!passphrase.trim()) {
      setError('Enter your passphrase first')
      return
    }
    setLoading(true)
    setError('')
    try {
      await loginWithBiometric(userId, passphrase)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleKeypad(digit) {
    if (pin.length >= AUTH.pinMaxLength) return
    setPin(p => p + digit)
  }

  function handleDelete() {
    setPin(p => p.slice(0, -1))
  }

  return (
    <div style={styles.container}>
      <button style={styles.backBtn} onClick={onBack}>← Back</button>

      <div style={styles.header}>
        <div style={styles.avatar}>
          {profile?.avatarInitials || '??'}
        </div>
        <h2 style={styles.profileName}>{profile?.name}</h2>
      </div>

      {/* PIN dots */}
      <div style={styles.pinDots}>
        {Array.from({ length: AUTH.pinMaxLength }).map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.dot,
              ...(i < pin.length ? styles.dotFilled : {})
            }}
          />
        ))}
      </div>

      {/* Passphrase field */}
      <div style={styles.passphraseRow}>
        <input
          type={showPass ? 'text' : 'password'}
          placeholder="Encryption passphrase"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          style={styles.passphraseInput}
          autoComplete="off"
        />
        <button
          style={styles.showPassBtn}
          onClick={() => setShowPass(p => !p)}
        >
          {showPass ? '🙈' : '👁️'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {isLockedOut && (
        <p style={styles.error}>
          Locked out until {new Date(lockoutUntil).toLocaleTimeString()}
        </p>
      )}

      {/* Keypad */}
      <div style={styles.keypad}>
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((key, i) => (
          <button
            key={i}
            style={{
              ...styles.keypadBtn,
              ...(key === '' ? styles.keypadEmpty : {})
            }}
            onClick={() => {
              if (key === '⌫') handleDelete()
              else if (key !== '') handleKeypad(String(key))
            }}
            disabled={loading || isLockedOut || key === ''}
          >
            {key}
          </button>
        ))}
      </div>

      <button
        style={{
          ...styles.submitBtn,
          opacity: loading || isLockedOut ? 0.6 : 1
        }}
        onClick={handlePinSubmit}
        disabled={loading || isLockedOut}
      >
        {loading ? 'Unlocking…' : 'Unlock'}
      </button>

      {showBiometric && (
        <button
          style={styles.biometricBtn}
          onClick={handleBiometric}
          disabled={loading}
        >
          Use Face ID / Touch ID
        </button>
      )}

      <button
        style={styles.forgotBtn}
        onClick={() => { window.location.hash = '#/recover' }}
      >
        Forgot PIN?
      </button>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  center: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    height:         '100dvh',
    background:     '#0f0f0f',
    color:          '#fff',
  },
  container: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    minHeight:      '100dvh',
    background:     '#0f0f0f',
    color:          '#fff',
    padding:        '24px 16px',
    boxSizing:      'border-box',
  },
  header: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    marginBottom:   '32px',
    marginTop:      '16px',
  },
  logo: {
    fontSize:       '56px',
    marginBottom:   '8px',
  },
  appName: {
    fontSize:       '32px',
    fontWeight:     '700',
    margin:         '0 0 4px',
    letterSpacing:  '-0.5px',
  },
  subtitle: {
    fontSize:       '16px',
    color:          '#888',
    margin:         0,
  },
  profileGrid: {
    display:        'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap:            '16px',
    width:          '100%',
    maxWidth:       '320px',
  },
  profileCard: {
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            '8px',
    padding:        '20px 16px',
    background:     '#1a1a1a',
    border:         '1px solid #2a2a2a',
    borderRadius:   '16px',
    cursor:         'pointer',
    color:          '#fff',
  },
  addProfile: {
    border:         '1px dashed #333',
    background:     'transparent',
  },
  avatar: {
    width:          '56px',
    height:         '56px',
    borderRadius:   '50%',
    background:     '#2a5a3a',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    fontSize:       '20px',
    fontWeight:     '700',
    color:          '#4ecdc4',
  },
  addAvatar: {
    background:     '#1a1a1a',
    border:         '2px dashed #333',
    color:          '#555',
    fontSize:       '28px',
    fontWeight:     '300',
  },
  profileName: {
    fontSize:       '14px',
    fontWeight:     '500',
    color:          '#ddd',
  },
  backBtn: {
    alignSelf:      'flex-start',
    background:     'none',
    border:         'none',
    color:          '#4ecdc4',
    fontSize:       '16px',
    cursor:         'pointer',
    padding:        '4px 0',
    marginBottom:   '8px',
  },
  pinDots: {
    display:        'flex',
    gap:            '12px',
    marginBottom:   '24px',
  },
  dot: {
    width:          '14px',
    height:         '14px',
    borderRadius:   '50%',
    border:         '2px solid #444',
    background:     'transparent',
    transition:     'background 0.1s',
  },
  dotFilled: {
    background:     '#4ecdc4',
    border:         '2px solid #4ecdc4',
  },
  passphraseRow: {
    display:        'flex',
    alignItems:     'center',
    width:          '100%',
    maxWidth:       '320px',
    marginBottom:   '12px',
    gap:            '8px',
  },
  passphraseInput: {
    flex:           1,
    padding:        '12px 14px',
    background:     '#1a1a1a',
    border:         '1px solid #2a2a2a',
    borderRadius:   '12px',
    color:          '#fff',
    fontSize:       '16px',
    outline:        'none',
  },
  showPassBtn: {
    background:     'none',
    border:         'none',
    fontSize:       '20px',
    cursor:         'pointer',
    padding:        '4px',
  },
  error: {
    color:          '#ff6b6b',
    fontSize:       '14px',
    marginBottom:   '12px',
    textAlign:      'center',
  },
  keypad: {
    display:        'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap:            '12px',
    width:          '100%',
    maxWidth:       '280px',
    marginBottom:   '20px',
  },
  keypadBtn: {
    height:         '64px',
    background:     '#1a1a1a',
    border:         '1px solid #2a2a2a',
    borderRadius:   '16px',
    color:          '#fff',
    fontSize:       '24px',
    fontWeight:     '500',
    cursor:         'pointer',
  },
  keypadEmpty: {
    background:     'transparent',
    border:         'none',
    cursor:         'default',
  },
  submitBtn: {
    width:          '100%',
    maxWidth:       '280px',
    padding:        '16px',
    background:     '#4ecdc4',
    border:         'none',
    borderRadius:   '16px',
    color:          '#0f0f0f',
    fontSize:       '17px',
    fontWeight:     '700',
    cursor:         'pointer',
    marginBottom:   '12px',
  },
  biometricBtn: {
    width:          '100%',
    maxWidth:       '280px',
    padding:        '14px',
    background:     'transparent',
    border:         '1px solid #4ecdc4',
    borderRadius:   '16px',
    color:          '#4ecdc4',
    fontSize:       '16px',
    cursor:         'pointer',
    marginBottom:   '12px',
  },
  forgotBtn: {
    background:     'none',
    border:         'none',
    color:          '#555',
    fontSize:       '14px',
    cursor:         'pointer',
    marginTop:      '8px',
  },
}