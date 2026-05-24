import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/useAuth.jsx'
import { BannerProvider, useBanners } from './shared/Banner.jsx'
import AuthGate from './auth/AuthGate.jsx'
import Onboarding from './auth/Onboarding.jsx'
import BottomNav from './shared/BottomNav.jsx'
import { runMigrations } from './db/migrations.js'
import { db } from './db/indexedDB.js'
import { DRIVE } from './config.js'
import HomeScreen from './screens/Home.jsx'
import BatchList from './batches/BatchList.jsx'
import WeightLog from './progress/WeightLog.jsx'
import WeeklySummary from './progress/WeeklySummary.jsx'
import BloodWork from './progress/BloodWork.jsx'
import MoodLog from './progress/MoodLog.jsx'
import CalendarView from './calendar/CalendarView.jsx'
import AdminPanel from './admin/AdminPanel.jsx'
import HouseholdSetup, { getHouseholdCode } from './auth/HouseholdSetup.jsx'
import ProgramManager from './workout/ProgramManager.jsx'
import WorkoutLog from './workout/WorkoutLog.jsx'

export default function App() {
  const [migrationsRun,   setMigrationsRun]   = useState(false)
  const [migrationsError, setMigrationsError] = useState(null)

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('access_token')) {
      import('./db/driveApi.js').then(async ({ parseOAuthCallback, ensureFolderStructure, isTokenValid }) => {
        try {
          parseOAuthCallback()
          console.log('OAuth token parsed, valid:', isTokenValid())
        } catch (e) {
          console.error('OAuth error:', e)
        }
        window.location.replace(window.location.origin + '/#/onboarding?googled=1')
      })
      return
    }
    runMigrations()
      .then(() => setMigrationsRun(true))
      .catch(e => {
        console.error('Migration failed:', e)
        setMigrationsError(e.message)
      })
  }, [])

  if (!migrationsRun && !migrationsError) {
    return (
      <div style={styles.splash}>
        <div style={styles.splashLogo}>🥗</div>
        <p style={styles.splashText}>Starting up…</p>
      </div>
    )
  }

  if (migrationsError) {
    return (
      <div style={styles.splash}>
        <div style={styles.splashLogo}>⚠️</div>
        <p style={styles.splashText}>Startup error</p>
        <p style={styles.splashSub}>{migrationsError}</p>
        <button style={styles.retryBtn} onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  return (
    <AuthProvider>
      <BannerProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </BannerProvider>
    </AuthProvider>
  )
}

function AppRoutes() {
  const { isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={styles.splash}>
        <div style={styles.splashLogo}>🥗</div>
      </div>
    )
  }

  // Check household code
  const hasHousehold = !!localStorage.getItem('nourish_household_code')

  if (!hasHousehold && !window.location.hash.includes('onboarding')) {
    return (
      <HouseholdSetup
        onJoined={() => window.location.reload()}
      />
    )
  }

  return (
    <>
      <ReminderChecker />
      <QuotaChecker />
      <Routes>
        <Route path="/onboarding" element={<Onboarding onComplete={() => { window.location.hash = '#/' }} />} />
        <Route path="/auth/callback" element={<AuthCallbackScreen />} />
        <Route path="/recover" element={<RecoverScreen />} />
        <Route path="/*" element={<AuthGate><ProtectedApp /></AuthGate>} />
      </Routes>
    </>
  )
}

function ProtectedApp() {
  return (
    <div style={styles.appShell}>
      <main style={styles.main}>
        <Routes>
          <Route path="/"         element={<HomeScreen />} />
          <Route path="/food"     element={<FoodScreen />} />
          <Route path="/workout"  element={<WorkoutScreen />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

function ReminderChecker() {
  const { user } = useAuth()
  const { addBanner } = useBanners()
  useEffect(() => {
    if (!user) return
    checkReminders(user.id, addBanner)
  }, [user?.id])
  return null
}

async function checkReminders(userId, addBanner) {
  try {
    const reminders = await db.reminders.where('userId').equals(userId).toArray()
    if (!reminders.length) return
    const now     = new Date()
    const today   = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase()
    const lastOpenKey = `lastOpen_${userId}`
    const lastOpen    = parseInt(localStorage.getItem(lastOpenKey) || '0', 10)
    localStorage.setItem(lastOpenKey, String(Date.now()))
    for (const reminder of reminders) {
      if (!reminder.days?.includes(today)) continue
      const [h, m]     = (reminder.time || '09:00').split(':').map(Number)
      const reminderMs = new Date().setHours(h, m, 0, 0)
      if (reminderMs > lastOpen && reminderMs <= Date.now()) {
        addBanner({ type: 'reminder', message: reminder.label, autoDismiss: null, onDismiss: () => {} })
        break
      }
    }
  } catch (e) {
    console.warn('Reminder check error:', e)
  }
}

function QuotaChecker() {
  const { user, encryptionKey } = useAuth()
  const { addBanner } = useBanners()
  useEffect(() => {
    if (!user || !encryptionKey) return
    import('./db/driveApi.js').then(({ checkQuota, isTokenValid }) => {
      if (!isTokenValid()) return
      checkQuota().then(quota => {
        const availableMB = quota.available / 1024 / 1024
        if (availableMB < DRIVE.quotaWarningMB) {
          addBanner({ type: 'quota', message: `Google Drive storage low — ${availableMB.toFixed(0)}MB remaining`, onDismiss: () => {} })
        }
      }).catch(() => {})
    })
  }, [user?.id])
  return null
}

function FoodScreen() {
  return (
    <div style={styles.screen}>
      <h1 style={styles.screenTitle}>Food & Batches</h1>
      <BatchList />
    </div>
  )
}

function WorkoutScreen() {
  const [screen,    setScreen]    = useState('programmes') // programmes | logging
  const [activeProg, setActiveProg] = useState(null)
  const [activeDay,  setActiveDay]  = useState(null)

  function handleStartWorkout(programme, day) {
    setActiveProg(programme)
    setActiveDay(day)
    setScreen('logging')
  }

  function handleFinish(summary) {
    setScreen('programmes')
    setActiveProg(null)
    setActiveDay(null)
  }

  if (screen === 'logging') {
    return (
      <div style={styles.screen}>
        <WorkoutLog
          programme={activeProg}
          day={activeDay}
          onFinish={handleFinish}
          onCancel={() => setScreen('programmes')}
        />
      </div>
    )
  }

  return (
    <div style={styles.screen}>
      <ProgramManager onStartWorkout={handleStartWorkout} />
    </div>
  )
}

function CalendarScreen() {
  return (
    <div style={styles.screen}>
      <CalendarView />
    </div>
  )
}

function SettingsScreen() {
  const { user, lock } = useAuth()
  const [tab,          setTab]          = useState('profile')
  const [instructions, setInstructions] = useState(
    user?.aiInstructions || 'Suggest vegetarian Indian meals. Prioritise high protein foods like paneer, dal, curd, sprouts and eggs.'
  )
  const [saved, setSaved] = useState(false)

  async function saveInstructions() {
    const { db } = await import('./db/indexedDB.js')
    await db.users.update(user.id, {
      aiInstructions: instructions,
      dirty: 1,
      updatedAt: new Date().toISOString(),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const tabs = [
    { id:'profile',  label:'Profile'  },
    { id:'progress', label:'Progress' },
    { id:'mood',     label:'Mood'     },
    { id:'blood',    label:'Blood'    },
    { id:'ai',       label:'AI'       },
    { id:'admin',    label:'Admin'    },
  ]

  return (
    <div style={styles.screen}>
      <h1 style={styles.screenTitle}>Settings</h1>

      {/* Tab bar */}
      <div style={styles.tabBar}>
        {tabs.map(t => (
          <button
            key={t.id}
            style={{ ...styles.tabBtn, ...(tab === t.id ? styles.tabBtnActive : {}) }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <>
          <div style={styles.settingsCard}>
            <p style={styles.settingsRow}>👤 {user?.name}</p>
            <p style={styles.settingsRow}>🎯 {user?.macroGoals?.calories} kcal · {user?.macroGoals?.protein}g protein</p>
            <p style={styles.settingsRow}>💊 {user?.supplements?.length || 0} supplements</p>
            <p style={styles.settingsRow}>📏 {user?.height ? Math.round(user.height) + 'cm' : 'Height not set'}</p>
          </div>
          <button style={styles.lockBtnFull} onClick={lock}>🔒 Lock App</button>


        </>
      )}

      {tab === 'progress' && (
        <WeightLog />
      )}

      {tab === 'mood' && (
        <MoodLog />
      )}

      {tab === 'blood' && (
        <BloodWork />
      )}

      {tab === 'admin' && user?.isAdmin && (
        <AdminPanel />
      )}

      {tab === 'admin' && !user?.isAdmin && (
        <div style={{ textAlign:'center', padding:'48px 0' }}>
          <p style={{ fontSize:'16px', color:'var(--text-tertiary)' }}>
            Admin access required
          </p>
          <p style={{ fontSize:'13px', color:'var(--text-tertiary)', marginTop:'8px' }}>
            Ask your household admin to grant you access
          </p>
        </div>
      )}

      {tab === 'ai' && (
        <div style={styles.settingsSection}>
          <div style={styles.settingsSectionHeader}>
            <span style={styles.settingsSectionTitle}>AI Instructions</span>
            <span style={styles.settingsSectionSub}>Tell the AI your food preferences and restrictions</span>
          </div>
          <textarea
            style={styles.instructionsInput}
            value={instructions}
            onChange={e => { setInstructions(e.target.value); setSaved(false) }}
            rows={6}
            placeholder="e.g. I am vegetarian. Suggest Indian meals. I prefer high protein foods..."
          />
          <button
            style={{ ...styles.saveInstructionsBtn, background: saved ? 'var(--accent)' : 'var(--text-primary)' }}
            onClick={saveInstructions}
          >
            {saved ? '✓ Saved' : 'Save Instructions'}
          </button>
        </div>
      )}
    </div>
  )
}

function AuthCallbackScreen() {
  return (
    <div style={styles.splash}>
      <div style={styles.splashLogo}>🥗</div>
      <p style={styles.splashText}>Connecting to Google Drive…</p>
    </div>
  )
}

function RecoverScreen() {
  const [userId,      setUserId]      = useState('')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [newPin,      setNewPin]      = useState('')
  const [confirmPin,  setConfirmPin]  = useState('')
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)
  const { resetPin } = useAuth()

  async function handleReset() {
    if (newPin !== confirmPin) { setError('PINs do not match'); return }
    if (newPin.length < 4)     { setError('PIN too short'); return }
    try {
      await resetPin(userId, recoveryKey, newPin)
      setSuccess(true)
    } catch (e) {
      setError(e.message)
    }
  }

  if (success) {
    return (
      <div style={styles.splash}>
        <div style={styles.splashLogo}>✅</div>
        <p style={styles.splashText}>PIN reset successfully</p>
        <button style={styles.retryBtn} onClick={() => { window.location.hash = '#/' }}>Back to login</button>
      </div>
    )
  }

  return (
    <div style={styles.recoverContainer}>
      <button style={styles.backBtn} onClick={() => { window.location.hash = '#/' }}>← Back</button>
      <h2 style={styles.screenTitle}>Reset PIN</h2>
      <label style={styles.label}>User ID</label>
      <input style={styles.input} placeholder="Your user ID" value={userId} onChange={e => setUserId(e.target.value)} />
      <label style={styles.label}>Recovery key</label>
      <input style={styles.input} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" value={recoveryKey} onChange={e => setRecoveryKey(e.target.value.toUpperCase())} />
      <label style={styles.label}>New PIN</label>
      <input style={styles.input} type="password" inputMode="numeric" placeholder="4-8 digits" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
      <label style={styles.label}>Confirm new PIN</label>
      <input style={styles.input} type="password" inputMode="numeric" placeholder="Repeat PIN" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
      {error && <p style={styles.error}>{error}</p>}
      <button style={styles.primaryBtn} onClick={handleReset}>Reset PIN</button>
    </div>
  )
}

const styles = {
  splash: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg-base)', color: 'var(--text-primary)', gap: '12px' },
  splashLogo:  { fontSize: '64px' },
  splashText:  { fontSize: '18px', color: 'var(--text-secondary)', margin: 0 },
  splashSub:   { fontSize: '13px', color: 'var(--text-tertiary)', margin: 0, textAlign: 'center', padding: '0 32px' },
  retryBtn:    { marginTop: '16px', padding: '12px 24px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--r-lg)', color: '#fff', fontSize: '16px', fontWeight: '700', cursor: 'pointer' },
  appShell:    { display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg-base)', color: 'var(--text-primary)' },
  main:        { flex: 1, overflowY: 'auto' },
  screen:      { padding: '24px 16px 16px', minHeight: '100%' },
  screenTitle: { fontSize: '26px', fontWeight: '600', margin: '0 0 20px', letterSpacing: '-0.03em', color: 'var(--text-primary)' },
  tabBar: {
    display:        'flex',
    gap:            '4px',
    overflowX:      'auto',
    paddingBottom:  '4px',
    marginBottom:   '4px',
  },
  tabBtn: {
    padding:        '8px 14px',
    background:     'var(--bg-elevated)',
    border:         '0.5px solid var(--border-subtle)',
    borderRadius:   'var(--r-full)',
    fontSize:       '13px',
    fontWeight:     '500',
    color:          'var(--text-secondary)',
    cursor:         'pointer',
    whiteSpace:     'nowrap',
    flexShrink:     0,
  },
  tabBtnActive: {
    background:     'var(--text-primary)',
    color:          'var(--text-inverse)',
    borderColor:    'var(--text-primary)',
  },
  settingsSection: {
    background:    'var(--bg-surface)',
    border:        '0.5px solid var(--border-subtle)',
    borderRadius:  'var(--r-xl)',
    padding:       '16px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },
  settingsSectionHeader: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '2px',
  },
  settingsSectionTitle: {
    fontSize:      '15px',
    fontWeight:    '600',
    color:         'var(--text-primary)',
    letterSpacing: '-0.01em',
  },
  settingsSectionSub: {
    fontSize:      '12px',
    color:         'var(--text-tertiary)',
  },
  instructionsInput: {
    width:         '100%',
    padding:       '12px 14px',
    background:    'var(--bg-elevated)',
    border:        '1px solid var(--border-default)',
    borderRadius:  'var(--r-md)',
    fontSize:      '14px',
    color:         'var(--text-primary)',
    outline:       'none',
    resize:        'vertical',
    fontFamily:    'var(--font-sans)',
    lineHeight:    '1.5',
    boxSizing:     'border-box',
  },
  saveInstructionsBtn: {
    padding:       '12px',
    border:        'none',
    borderRadius:  'var(--r-lg)',
    color:         'var(--text-inverse)',
    fontSize:      '15px',
    fontWeight:    '600',
    cursor:        'pointer',
    transition:    'background 0.2s',
  },
  lockBtnFull: { width: '100%', padding: '14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-lg)', color: 'var(--red)', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginTop: '16px' },
  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', background: 'var(--bg-elevated)', borderRadius: 'var(--r-xl)', border: '1px dashed var(--border-default)' },
  placeholderText: { fontSize: '16px', color: 'var(--text-secondary)', margin: '0 0 8px' },
  placeholderSub:  { fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 },
  settingsCard:    { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: '16px 20px', marginBottom: '16px' },
  settingsRow:     { fontSize: '15px', color: 'var(--text-primary)', margin: '6px 0' },
  recoverContainer:{ display: 'flex', flexDirection: 'column', padding: '24px 20px', minHeight: '100dvh', background: 'var(--bg-base)', color: 'var(--text-primary)', boxSizing: 'border-box' },
  backBtn:     { background: 'none', border: 'none', color: 'var(--accent)', fontSize: '16px', cursor: 'pointer', padding: '0 0 16px', alignSelf: 'flex-start' },
  label:       { fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px', marginTop: '12px' },
  input:       { width: '100%', padding: '13px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)', color: 'var(--text-primary)', fontSize: '16px', outline: 'none', boxSizing: 'border-box' },
  error:       { color: 'var(--red)', fontSize: '14px', margin: '8px 0' },
  primaryBtn:  { width: '100%', padding: '15px', background: 'var(--text-primary)', border: 'none', borderRadius: 'var(--r-lg)', color: 'var(--text-inverse)', fontSize: '17px', fontWeight: '700', cursor: 'pointer', marginTop: '16px' },
  screenHeader:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' },
  lockBtn:     { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer' },
}
