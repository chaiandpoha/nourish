import { useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { generateRecoveryKey, sha256 } from './crypto.js'
import { initiateOAuthFlow } from '../db/driveApi.js'
import { AUTH } from '../config.js'

const TOTAL_STEPS = 10

export default function Onboarding({ onComplete }) {
  const [step,       setStep]       = useState(1)
  const [data,       setData]       = useState({
    name:            '',
    avatarInitials:  '',
    pin:             '',
    pinConfirm:      '',
    passphrase:      '',
    passphraseConfirm: '',
    recoveryKey:     '',
    recoveryConfirmed: false,
    height:          '',
    startWeight:     '',
    macroGoals: {
      calories: 2000,
      protein:  150,
      carbs:    200,
      fat:      65,
      fibre:    30,
    },
    supplements:     [],
    enableBiometric: false,
  })
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const { createProfile, registerBiometric } = useAuth()

  function update(fields) {
    setData(d => ({ ...d, ...fields }))
    setError('')
  }

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)) }
  function back() { setStep(s => Math.max(s - 1, 1)); setError('') }

  async function handleFinish() {
    setLoading(true)
    setError('')
    try {
      const profile = await createProfile({
        name:           data.name,
        avatarInitials: data.avatarInitials || data.name.slice(0, 2).toUpperCase(),
        pin:            data.pin,
        passphrase:     data.passphrase,
        height:         parseFloat(data.height),
        startWeight:    parseFloat(data.startWeight),
        macroGoals:     data.macroGoals,
        supplements:    data.supplements,
      })

      // Store recovery key hash on profile
      const recoveryHash = await sha256(data.recoveryKey)
      const { db } = await import('../db/indexedDB.js')
      await db.users.update(profile.id, { recoveryKeyHash: recoveryHash })

      if (data.enableBiometric && window.PublicKeyCredential) {
        try { await registerBiometric(profile.id) } catch {}
      }

      onComplete()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const stepProps = { data, update, next, back, error, setError, loading }

  return (
    <div style={styles.container}>
      {/* Progress bar */}
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${(step / TOTAL_STEPS) * 100}%` }} />
      </div>

      {step === 1  && <StepWelcome       {...stepProps} />}
      {step === 2  && <StepGoogleSignIn  {...stepProps} />}
      {step === 3  && <StepCreateProfile {...stepProps} />}
      {step === 4  && <StepSetPin        {...stepProps} />}
      {step === 5  && <StepPassphrase    {...stepProps} />}
      {step === 6  && <StepRecoveryKey   {...stepProps} onGenerateKey={() => {
        update({ recoveryKey: generateRecoveryKey() })
      }} />}
      {step === 7  && <StepBodyStats     {...stepProps} />}
      {step === 8  && <StepMacroGoals    {...stepProps} />}
      {step === 9  && <StepSupplements   {...stepProps} />}
      {step === 10 && <StepFinish        {...stepProps} onFinish={handleFinish} />}
    </div>
  )
}

// ─── Step 1 — Welcome ─────────────────────────────────────────────────────────
function StepWelcome({ next }) {
  return (
    <div style={styles.step}>
      <div style={styles.emoji}>🥗</div>
      <h1 style={styles.title}>Welcome to Nourish</h1>
      <p style={styles.body}>
        Your private health tracker. Track food, workouts, and progress —
        everything encrypted and stored in your own Google Drive.
      </p>
      <p style={styles.note}>
        📶 Internet required for first-time setup.
      </p>
      <button style={styles.primaryBtn} onClick={next}>Get Started</button>
    </div>
  )
}

// ─── Step 2 — Google Sign In ──────────────────────────────────────────────────
function StepGoogleSignIn({ next }) {
  return (
    <div style={styles.step}>
      <div style={styles.emoji}>🔗</div>
      <h2 style={styles.title}>Connect Google Drive</h2>
      <p style={styles.body}>
        Nourish stores your data in your own Google Drive — not our servers.
        We only request access to files Nourish creates.
      </p>
      <button style={styles.googleBtn} onClick={initiateOAuthFlow}>
        <span style={styles.googleIcon}>G</span>
        Sign in with Google
      </button>
      <button style={styles.ghostBtn} onClick={next}>
        Skip for now (offline mode)
      </button>
    </div>
  )
}

// ─── Step 3 — Create Profile ──────────────────────────────────────────────────
function StepCreateProfile({ data, update, next, error, setError }) {
  function validate() {
    if (!data.name.trim()) { setError('Name is required'); return }
    next()
  }
  return (
    <div style={styles.step}>
      <div style={styles.emoji}>👤</div>
      <h2 style={styles.title}>Create Your Profile</h2>

      <label style={styles.label}>Your name</label>
      <input
        style={styles.input}
        placeholder="e.g. Akshay"
        value={data.name}
        onChange={e => update({ name: e.target.value })}
        autoFocus
      />

      <label style={styles.label}>Initials (shown on profile card)</label>
      <input
        style={styles.input}
        placeholder={data.name ? data.name.slice(0, 2).toUpperCase() : 'AK'}
        value={data.avatarInitials}
        onChange={e => update({ avatarInitials: e.target.value.toUpperCase().slice(0, 2) })}
        maxLength={2}
      />

      {error && <p style={styles.error}>{error}</p>}
      <button style={styles.primaryBtn} onClick={validate}>Continue</button>
    </div>
  )
}

// ─── Step 4 — Set PIN ─────────────────────────────────────────────────────────
function StepSetPin({ data, update, next, back, error, setError }) {
  function validate() {
    if (data.skipPin) { next(); return }
    if (data.pin.length < AUTH.pinMinLength) {
      setError(`PIN must be at least ${AUTH.pinMinLength} digits`); return
    }
    if (data.pin !== data.pinConfirm) {
      setError('PINs do not match'); return
    }
    next()
  }
  return (
    <div style={styles.step}>
      <div style={styles.emoji}>🔢</div>
      <h2 style={styles.title}>Set a PIN</h2>
      <p style={styles.body}>Adds a lock screen when you open the app. You can skip this and enable it later in Settings.</p>

      {/* Skip toggle */}
      <button
        style={{
          ...styles.optionRow,
          background: data.skipPin ? 'var(--accent-dim)' : 'var(--bg-elevated)',
          border: data.skipPin ? '1px solid var(--accent)' : '1px solid var(--border-default)',
        }}
        onClick={() => update({ skipPin: !data.skipPin })}
      >
        <div style={styles.optionText}>
          <span style={styles.optionLabel}>Skip PIN for now</span>
          <span style={styles.optionSub}>Open app without a lock screen</span>
        </div>
        <div style={{
          width: '22px', height: '22px', borderRadius: '50%',
          background: data.skipPin ? 'var(--accent)' : 'transparent',
          border: data.skipPin ? 'none' : '2px solid var(--border-strong)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {data.skipPin && <span style={{ color: '#fff', fontSize: '13px', fontWeight: '700' }}>✓</span>}
        </div>
      </button>

      {!data.skipPin && (
        <>
          <label style={styles.label}>PIN</label>
          <input
            style={styles.input}
            type="password"
            inputMode="numeric"
            placeholder="Enter PIN"
            value={data.pin}
            onChange={e => update({ pin: e.target.value.replace(/\D/g, '').slice(0, AUTH.pinMaxLength) })}
          />
          <label style={styles.label}>Confirm PIN</label>
          <input
            style={styles.input}
            type="password"
            inputMode="numeric"
            placeholder="Confirm PIN"
            value={data.pinConfirm}
            onChange={e => update({ pinConfirm: e.target.value.replace(/\D/g, '').slice(0, AUTH.pinMaxLength) })}
          />
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}
      <button style={styles.primaryBtn} onClick={validate}>Continue</button>
      <button style={styles.ghostBtn} onClick={back}>Back</button>
    </div>
  )
}

// ─── Step 5 — Passphrase ──────────────────────────────────────────────────────
function StepPassphrase({ data, update, next, back, error, setError }) {
  const [show, setShow] = useState(false)
  function validate() {
    if (data.passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters'); return
    }
    if (data.passphrase !== data.passphraseConfirm) {
      setError('Passphrases do not match'); return
    }
    next()
  }
  return (
    <div style={styles.step}>
      <div style={styles.emoji}>🔐</div>
      <h2 style={styles.title}>Encryption Passphrase</h2>
      <p style={styles.body}>
        This encrypts all your personal data on Drive.
        Different from your PIN — make it strong and memorable.
        <strong> You cannot recover your data without this.</strong>
      </p>

      <label style={styles.label}>Passphrase</label>
      <div style={styles.inputRow}>
        <input
          style={{ ...styles.input, flex: 1 }}
          type={show ? 'text' : 'password'}
          placeholder="Min 8 characters"
          value={data.passphrase}
          onChange={e => update({ passphrase: e.target.value })}
        />
        <button style={styles.eyeBtn} onClick={() => setShow(s => !s)}>
          {show ? '🙈' : '👁️'}
        </button>
      </div>

      <label style={styles.label}>Confirm passphrase</label>
      <input
        style={styles.input}
        type="password"
        placeholder="Repeat passphrase"
        value={data.passphraseConfirm}
        onChange={e => update({ passphraseConfirm: e.target.value })}
      />

      {error && <p style={styles.error}>{error}</p>}
      <button style={styles.primaryBtn} onClick={validate}>Continue</button>
      <button style={styles.ghostBtn}   onClick={back}>Back</button>
    </div>
  )
}

// ─── Step 6 — Recovery Key ────────────────────────────────────────────────────
function StepRecoveryKey({ data, update, next, back, onGenerateKey, error, setError }) {
  function validate() {
    if (!data.recoveryKey) { setError('Generate your recovery key first'); return }
    if (!data.recoveryConfirmed) { setError('Confirm you have saved the key'); return }
    next()
  }
  return (
    <div style={styles.step}>
      <div style={styles.emoji}>🗝️</div>
      <h2 style={styles.title}>Recovery Key</h2>
      <p style={styles.body}>
        If you forget your PIN, this key lets you reset it.
        Save it somewhere safe — it will not be shown again.
      </p>

      {!data.recoveryKey ? (
        <button style={styles.primaryBtn} onClick={onGenerateKey}>
          Generate Recovery Key
        </button>
      ) : (
        <>
          <div style={styles.recoveryKeyBox}>
            <code style={styles.recoveryKeyText}>{data.recoveryKey}</code>
          </div>
          <p style={styles.note}>📋 Screenshot this or write it down now.</p>

          <button
  style={{
    display:       'flex',
    alignItems:    'center',
    gap:           '12px',
    width:         '100%',
    padding:       '13px 16px',
    background:    data.recoveryConfirmed ? 'var(--accent-dim)' : 'var(--bg-elevated)',
    border:        data.recoveryConfirmed ? '1px solid var(--accent)' : '1px solid var(--border-default)',
    borderRadius:  'var(--r-lg)',
    cursor:        'pointer',
    textAlign:     'left',
    marginTop:     '4px',
  }}
  onClick={() => update({ recoveryConfirmed: !data.recoveryConfirmed })}
>
  <div style={{
    width:           '24px',
    height:          '24px',
    borderRadius:    '6px',
    background:      data.recoveryConfirmed ? 'var(--accent)' : 'transparent',
    border:          data.recoveryConfirmed ? 'none' : '2px solid var(--border-strong)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
    transition:      'all 0.15s',
  }}>
    {data.recoveryConfirmed && (
      <span style={{ color: '#fff', fontSize: '14px', fontWeight: '700' }}>✓</span>
    )}
  </div>
  <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: '500' }}>
    I have saved my recovery key
  </span>
</button>
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}
      <button style={styles.primaryBtn} onClick={validate}>Continue</button>
      <button style={styles.ghostBtn}   onClick={back}>Back</button>
    </div>
  )
}

// ─── Step 7 — Body Stats ──────────────────────────────────────────────────────
function StepBodyStats({ data, update, next, back, error, setError }) {
  function validate() {
    if (!data.height || isNaN(parseFloat(data.height))) {
      setError('Enter your height in cm'); return
    }
    if (!data.startWeight || isNaN(parseFloat(data.startWeight))) {
      setError('Enter your starting weight in kg'); return
    }
    next()
  }
  return (
    <div style={styles.step}>
      <div style={styles.emoji}>📏</div>
      <h2 style={styles.title}>Body Stats</h2>
      <p style={styles.body}>Used to calculate your macro recommendations.</p>

      <label style={styles.label}>Height (cm)</label>
      <input
        style={styles.input}
        type="number"
        inputMode="decimal"
        placeholder="e.g. 175"
        value={data.height}
        onChange={e => update({ height: e.target.value })}
      />

      <label style={styles.label}>Starting weight (kg)</label>
      <input
        style={styles.input}
        type="number"
        inputMode="decimal"
        placeholder="e.g. 80"
        value={data.startWeight}
        onChange={e => update({ startWeight: e.target.value })}
      />

      {error && <p style={styles.error}>{error}</p>}
      <button style={styles.primaryBtn} onClick={validate}>Continue</button>
      <button style={styles.ghostBtn}   onClick={back}>Back</button>
    </div>
  )
}

// ─── Step 8 — Macro Goals ─────────────────────────────────────────────────────
function StepMacroGoals({ data, update, next, back }) {
  const { macroGoals } = data
  function setGoal(key, val) {
    update({ macroGoals: { ...macroGoals, [key]: parseInt(val) || 0 } })
  }
  const fields = [
    { key: 'calories', label: 'Calories (kcal)', placeholder: '2000' },
    { key: 'protein',  label: 'Protein (g)',     placeholder: '150'  },
    { key: 'carbs',    label: 'Carbs (g)',        placeholder: '200'  },
    { key: 'fat',      label: 'Fat (g)',          placeholder: '65'   },
    { key: 'fibre',    label: 'Fibre (g)',        placeholder: '30'   },
  ]
  return (
    <div style={styles.step}>
      <div style={styles.emoji}>🎯</div>
      <h2 style={styles.title}>Daily Macro Goals</h2>
      <p style={styles.body}>You can change these anytime in Settings.</p>

      {fields.map(f => (
        <div key={f.key}>
          <label style={styles.label}>{f.label}</label>
          <input
            style={styles.input}
            type="number"
            inputMode="numeric"
            placeholder={f.placeholder}
            value={macroGoals[f.key] || ''}
            onChange={e => setGoal(f.key, e.target.value)}
          />
        </div>
      ))}

      <button style={styles.primaryBtn} onClick={next}>Continue</button>
      <button style={styles.ghostBtn}   onClick={back}>Back</button>
    </div>
  )
}

// ─── Step 9 — Supplements ─────────────────────────────────────────────────────
function StepSupplements({ data, update, next, back }) {
  const [input, setInput] = useState('')

  function addSupplement() {
    const name = input.trim()
    if (!name) return
    if (data.supplements.includes(name)) return
    update({ supplements: [...data.supplements, name] })
    setInput('')
  }

  function removeSupplement(name) {
    update({ supplements: data.supplements.filter(s => s !== name) })
  }

  const suggestions = ['Creatine', 'Vitamin D3', 'B12', 'Omega-3', 'Magnesium', 'Zinc']

  return (
    <div style={styles.step}>
      <div style={styles.emoji}>💊</div>
      <h2 style={styles.title}>Supplement Stack</h2>
      <p style={styles.body}>
        These appear as a daily checklist on your dashboard.
        Add anything you take regularly.
      </p>

      <div style={styles.suggestions}>
        {suggestions.map(s => (
          <button
            key={s}
            style={{
              ...styles.chip,
              ...(data.supplements.includes(s) ? styles.chipActive : {})
            }}
            onClick={() => data.supplements.includes(s)
              ? removeSupplement(s)
              : update({ supplements: [...data.supplements, s] })
            }
          >
            {s}
          </button>
        ))}
      </div>

      <div style={styles.inputRow}>
        <input
          style={{ ...styles.input, flex: 1, marginBottom: 0 }}
          placeholder="Add custom supplement"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSupplement()}
        />
        <button style={styles.addBtn} onClick={addSupplement}>Add</button>
      </div>

      {data.supplements.length > 0 && (
        <div style={styles.pillList}>
          {data.supplements.map(s => (
            <div key={s} style={styles.pill}>
              {s}
              <button style={styles.pillRemove} onClick={() => removeSupplement(s)}>×</button>
            </div>
          ))}
        </div>
      )}

      <button style={styles.primaryBtn} onClick={next}>Continue</button>
      <button style={styles.ghostBtn}   onClick={back}>Back</button>
    </div>
  )
}

// ─── Step 10 — Finish ─────────────────────────────────────────────────────────
function StepFinish({ data, onFinish, back, error, loading }) {
  const [addedToHome, setAddedToHome] = useState(false)

  return (
    <div style={styles.step}>
      <div style={styles.emoji}>🎉</div>
      <h2 style={styles.title}>You're all set, {data.name}!</h2>

      <div style={styles.summaryCard}>
        <p style={styles.summaryRow}>🎯 {data.macroGoals.calories} kcal · {data.macroGoals.protein}g protein</p>
        <p style={styles.summaryRow}>💊 {data.supplements.length} supplement{data.supplements.length !== 1 ? 's' : ''} added</p>
        <p style={styles.summaryRow}>📏 {data.height}cm · {data.startWeight}kg starting</p>
      </div>

      {/* Add to Home Screen prompt */}
      {!addedToHome && (
        <div style={styles.pwaCard}>
          <p style={styles.pwaTitle}>📱 Add to Home Screen</p>
          <p style={styles.pwaBody}>
            iOS: tap the Share button → "Add to Home Screen"<br />
            Android: tap the browser menu → "Install app"
          </p>
          <button style={styles.ghostBtn} onClick={() => setAddedToHome(true)}>
            I'll do it later
          </button>
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      <button
        style={{ ...styles.primaryBtn, opacity: loading ? 0.6 : 1 }}
        onClick={onFinish}
        disabled={loading}
      >
        {loading ? 'Setting up…' : 'Start Nourish'}
      </button>
      <button style={styles.ghostBtn} onClick={back}>Back</button>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  container: {
    minHeight:     '100dvh',
    background:    '#0f0f0f',
    color:         '#fff',
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    boxSizing:     'border-box',
  },
  progressBar: {
    width:         '100%',
    height:        '3px',
    background:    '#1a1a1a',
    flexShrink:    0,
  },
  progressFill: {
    height:        '100%',
    background:    '#4ecdc4',
    transition:    'width 0.3s ease',
  },
  step: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    width:         '100%',
    maxWidth:      '400px',
    padding:       '32px 24px',
    boxSizing:     'border-box',
    gap:           '4px',
  },
  emoji: {
    fontSize:      '52px',
    marginBottom:  '8px',
  },
  title: {
    fontSize:      '26px',
    fontWeight:    '700',
    textAlign:     'center',
    margin:        '0 0 8px',
    letterSpacing: '-0.3px',
  },
  body: {
    fontSize:      '15px',
    color:         '#aaa',
    textAlign:     'center',
    lineHeight:    '1.5',
    margin:        '0 0 16px',
  },
  note: {
    fontSize:      '13px',
    color:         '#666',
    textAlign:     'center',
    margin:        '0 0 16px',
  },
  label: {
    fontSize:      '13px',
    color:         '#888',
    alignSelf:     'flex-start',
    marginBottom:  '4px',
    marginTop:     '8px',
  },
  input: {
    width:         '100%',
    padding:       '13px 14px',
    background:    '#1a1a1a',
    border:        '1px solid #2a2a2a',
    borderRadius:  '12px',
    color:         '#fff',
    fontSize:      '16px',
    outline:       'none',
    boxSizing:     'border-box',
    marginBottom:  '4px',
  },
  inputRow: {
    display:       'flex',
    alignItems:    'center',
    gap:           '8px',
    width:         '100%',
  },
  eyeBtn: {
    background:    'none',
    border:        'none',
    fontSize:      '20px',
    cursor:        'pointer',
    flexShrink:    0,
  },
  primaryBtn: {
    width:         '100%',
    padding:       '15px',
    background:    '#4ecdc4',
    border:        'none',
    borderRadius:  '14px',
    color:         '#0f0f0f',
    fontSize:      '17px',
    fontWeight:    '700',
    cursor:        'pointer',
    marginTop:     '12px',
  },
  ghostBtn: {
    width:         '100%',
    padding:       '13px',
    background:    'transparent',
    border:        '1px solid #2a2a2a',
    borderRadius:  '14px',
    color:         '#888',
    fontSize:      '15px',
    cursor:        'pointer',
    marginTop:     '8px',
  },
  googleBtn: {
    width:         '100%',
    padding:       '14px',
    background:    '#fff',
    border:        'none',
    borderRadius:  '14px',
    color:         '#111',
    fontSize:      '16px',
    fontWeight:    '600',
    cursor:        'pointer',
    display:       'flex',
    alignItems:    'center',
    justifyContent:'center',
    gap:           '10px',
    marginTop:     '8px',
  },
  googleIcon: {
    fontWeight:    '800',
    fontSize:      '18px',
    color:         '#4285F4',
  },
  error: {
    color:         '#ff6b6b',
    fontSize:      '14px',
    textAlign:     'center',
    margin:        '4px 0',
  },
  recoveryKeyBox: {
    width:         '100%',
    padding:       '20px',
    background:    '#1a1a1a',
    border:        '1px solid #2a2a2a',
    borderRadius:  '12px',
    textAlign:     'center',
    margin:        '8px 0',
    boxSizing:     'border-box',
  },
  recoveryKeyText: {
    fontSize:      '18px',
    letterSpacing: '2px',
    color:         '#4ecdc4',
    fontFamily:    'monospace',
    wordBreak:     'break-all',
  },
  checkRow: {
    display:       'flex',
    alignItems:    'center',
    fontSize:      '14px',
    color:         '#aaa',
    cursor:        'pointer',
    margin:        '8px 0',
  },
  suggestions: {
    display:       'flex',
    flexWrap:      'wrap',
    gap:           '8px',
    marginBottom:  '12px',
    justifyContent:'center',
  },
  chip: {
    padding:       '8px 14px',
    background:    '#1a1a1a',
    border:        '1px solid #2a2a2a',
    borderRadius:  '20px',
    color:         '#aaa',
    fontSize:      '14px',
    cursor:        'pointer',
  },
  chipActive: {
    background:    '#1a3a38',
    border:        '1px solid #4ecdc4',
    color:         '#4ecdc4',
  },
  addBtn: {
    padding:       '13px 18px',
    background:    '#1a3a38',
    border:        '1px solid #4ecdc4',
    borderRadius:  '12px',
    color:         '#4ecdc4',
    fontSize:      '15px',
    cursor:        'pointer',
    flexShrink:    0,
  },
  pillList: {
    display:       'flex',
    flexWrap:      'wrap',
    gap:           '8px',
    marginTop:     '8px',
    width:         '100%',
  },
  pill: {
    display:       'flex',
    alignItems:    'center',
    gap:           '6px',
    padding:       '6px 12px',
    background:    '#1a3a38',
    border:        '1px solid #4ecdc4',
    borderRadius:  '20px',
    color:         '#4ecdc4',
    fontSize:      '13px',
  },
  pillRemove: {
    background:    'none',
    border:        'none',
    color:         '#4ecdc4',
    fontSize:      '16px',
    cursor:        'pointer',
    padding:       '0',
    lineHeight:    '1',
  },
  summaryCard: {
    width:         '100%',
    padding:       '16px 20px',
    background:    '#1a1a1a',
    border:        '1px solid #2a2a2a',
    borderRadius:  '14px',
    margin:        '8px 0 16px',
    boxSizing:     'border-box',
  },
  summaryRow: {
    margin:        '4px 0',
    fontSize:      '14px',
    color:         '#ccc',
  },
  pwaCard: {
    width:         '100%',
    padding:       '16px 20px',
    background:    '#1a1a2a',
    border:        '1px solid #2a2a4a',
    borderRadius:  '14px',
    margin:        '0 0 8px',
    boxSizing:     'border-box',
    textAlign:     'center',
  },
  pwaTitle: {
    fontSize:      '15px',
    fontWeight:    '600',
    margin:        '0 0 6px',
    color:         '#aac',
  },
  pwaBody: {
    fontSize:      '13px',
    color:         '#778',
    lineHeight:    '1.6',
    margin:        '0 0 8px',
  },
optionRow: {
  display:       'flex',
  alignItems:    'center',
  gap:           '12px',
  width:         '100%',
  padding:       '13px 16px',
  borderRadius:  'var(--r-lg)',
  cursor:        'pointer',
  textAlign:     'left',
  marginBottom:  '8px',
},
optionText: {
  flex:          1,
  display:       'flex',
  flexDirection: 'column',
  gap:           '2px',
},
optionLabel: {
  fontSize:      '14px',
  fontWeight:    '600',
  color:         'var(--text-primary)',
},
optionSub: {
  fontSize:      '12px',
  color:         'var(--text-secondary)',
},
}