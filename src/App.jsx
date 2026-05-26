import { useEffect, useState, useCallback } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/useAuth.jsx'
import { BannerProvider, useBanners } from './shared/Banner.jsx'
import AuthGate from './auth/AuthGate.jsx'
import AdminLogin from './auth/AdminLogin.jsx'
import Onboarding from './auth/Onboarding.jsx'
import BottomNav from './shared/BottomNav.jsx'
import { runMigrations } from './db/migrations.js'
import { db } from './db/indexedDB.js'
import { saveRemindersToCloud, saveUser } from './db/db.js'
import { generateId } from './auth/crypto.js'
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
import WorkoutCharts from './workout/WorkoutCharts.jsx'
import MuscleVolume from './workout/MuscleVolume.jsx'
import ProgressPhotos from './progress/ProgressPhotos.jsx'
import Measurements from './progress/Measurements.jsx'
import InstallPrompt from './shared/InstallPrompt.jsx'
import MealEntry from './log/MealEntry.jsx'
import { getThemePref, setThemePref } from './shared/theme.js'

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
        <img src='/icons/icon-192.png' style={{ width:'80px', height:'80px', borderRadius:'20px' }} alt='Nourish' />
        <p style={styles.splashText}>Starting up…</p>
      </div>
    )
  }

  if (migrationsError) {
    return (
      <div style={styles.splash}>
        <div style={{ fontSize:'64px' }}>⚠️</div>
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

function OnboardingGate() {
  const [checking, setChecking] = useState(true)
  const [found,    setFound]    = useState(false)

  useEffect(() => {
    checkDriveForProfile()
  }, [])

  async function checkDriveForProfile() {
    try {
      const { isTokenValid, restoreToken, findFolder, findFile, listFolders, readFile } = await import('./db/driveApi.js')
      if (!isTokenValid()) restoreToken()
      if (!isTokenValid()) { setChecking(false); return }

      // Walk Nourish/users/ looking for any profile.json
      const nourishId = await findFolder('Nourish', 'root')
      if (!nourishId) { setChecking(false); return }

      const usersId = await findFolder('users', nourishId)
      if (!usersId) { setChecking(false); return }

      const userDirs = await listFolders(usersId)
      if (!userDirs?.length) { setChecking(false); return }

      for (const dir of userDirs) {
        const profileFile = await findFile('profile.json', dir.id)
        if (profileFile) {
          const raw = await readFile(profileFile.id)
          if (raw) {
            const p = typeof raw === 'string' ? JSON.parse(raw) : raw
            await db.users.put({ ...p, dirty: 0 })
            console.log('Profile restored from Drive:', p.name)
            setFound(true)
            setChecking(false)
            return
          }
        }
      }
    } catch (e) {
      console.warn('Drive profile check failed:', e)
    }
    setChecking(false)
  }

  if (checking) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100dvh', background:'var(--bg-base)', gap:'16px' }}>
        <img src="/icons/icon-192.png" style={{ width:'64px', borderRadius:'16px' }} />
        <p style={{ fontSize:'15px', color:'var(--text-secondary)' }}>Checking for existing profile…</p>
      </div>
    )
  }

  if (found) {
    // Profile restored — go to dashboard
    window.location.hash = '#/'
    return null
  }

  return <Onboarding onComplete={() => { window.location.hash = '#/' }} />
}

function AppRoutes() {
  const { isLoading } = useAuth()
  const [householdReady, setHouseholdReady] = useState(false)

  useEffect(() => {
    const code = localStorage.getItem('nourish_household_code')
    if (code) { setHouseholdReady(true); return }
    // If profiles already exist in IndexedDB, auto-create a household so the gate
    // never permanently locks out a user who lost their localStorage.
    db.users.count().then(n => {
      if (n > 0) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        const rand  = crypto.getRandomValues(new Uint8Array(12))
        const raw   = Array.from(rand).map(b => chars[b % chars.length]).join('')
        const auto  = 'NOURISH-' + raw.slice(0,4) + '-' + raw.slice(4,8) + '-' + raw.slice(8,12)
        localStorage.setItem('nourish_household_code',  auto)
        localStorage.setItem('nourish_household_admin', 'true')
      }
      setHouseholdReady(true)
    })
  }, [])

  if (isLoading || !householdReady) {
    return (
      <div style={styles.splash}>
        <img src='/icons/icon-192.png' style={{ width:'80px', height:'80px', borderRadius:'20px' }} alt='Nourish' />
      </div>
    )
  }

  const hasHousehold = !!localStorage.getItem('nourish_household_code')
  const hash = window.location.hash

  // Admin login and join links bypass the household gate
  if (hash.includes('admin-login')) {
    return (
      <Routes>
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/*" element={<Navigate to="/admin-login" replace />} />
      </Routes>
    )
  }

  if (hash.includes('/join')) {
    return (
      <Routes>
        <Route path="/join" element={<JoinRoute />} />
        <Route path="/*" element={<Navigate to={hash.replace('#', '')} replace />} />
      </Routes>
    )
  }

  if (!hasHousehold && !hash.includes('onboarding')) {
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
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/join" element={<JoinRoute />} />
        <Route path="/onboarding" element={<OnboardingGate />} />
        <Route path="/auth/callback" element={<AuthCallbackScreen />} />
        <Route path="/recover" element={<RecoverScreen />} />
        <Route path="/*" element={<AuthGate><ProtectedApp /></AuthGate>} />
      </Routes>
    </>
  )
}

function ProtectedApp() {
  const { user } = useAuth()
  const today = new Date().toISOString().slice(0, 10)

  function handleGlobalLogged() {
    window.dispatchEvent(new CustomEvent('nourish:food-logged'))
  }

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
      {user && <MealEntry date={today} onLogged={handleGlobalLogged} />}
      <InstallPrompt />
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

const WORKOUT_TABS = [
  { id: 'programmes', label: 'Plans'   },
  { id: 'charts',     label: 'Charts'  },
  { id: 'volume',     label: 'Volume'  },
]

function WorkoutScreen() {
  const [screen,     setScreen]     = useState('programmes') // programmes | charts | volume | logging
  const [activeProg, setActiveProg] = useState(null)
  const [activeDay,  setActiveDay]  = useState(null)

  function handleStartWorkout(programme, day) {
    setActiveProg(programme)
    setActiveDay(day)
    setScreen('logging')
  }

  function handleFinish() {
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
      <div style={styles.tabBar}>
        {WORKOUT_TABS.map(t => (
          <button
            key={t.id}
            style={{ ...styles.tabBtn, ...(screen === t.id ? styles.tabBtnActive : {}) }}
            onClick={() => setScreen(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {screen === 'programmes' && <ProgramManager onStartWorkout={handleStartWorkout} />}
      {screen === 'charts'     && <WorkoutCharts />}
      {screen === 'volume'     && <MuscleVolume />}
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
  const { user, lock, refreshUser } = useAuth()
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
    { id:'profile',      label:'Profile'   },
    { id:'supps',        label:'Supps'     },
    { id:'reminders',    label:'Reminders' },
    { id:'progress',     label:'Progress'  },
    { id:'body',         label:'Body'      },
    { id:'photos',       label:'Photos'    },
    { id:'mood',         label:'Mood'      },
    { id:'blood',        label:'Blood'     },
    { id:'ai',           label:'AI'        },
    { id:'admin',        label:'Admin'     },
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
          <ProfileEditor user={user} onSaved={refreshUser} />
          <ThemeToggle />
          <ExportData userId={user?.id} />
          {user?.pinHash && (
            <button style={styles.lockBtnFull} onClick={lock}>🔒 Lock App</button>
          )}
        </>
      )}

      {tab === 'supps' && (
        <SupplementStreaks userId={user?.id} supplements={user?.supplements || []} />
      )}

      {tab === 'reminders' && (
        <ReminderSettings userId={user?.id} />
      )}

      {tab === 'progress' && (
        <WeightLog />
      )}

      {tab === 'body' && (
        <Measurements />
      )}

      {tab === 'photos' && (
        <ProgressPhotos userId={user?.id} />
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

function JoinRoute() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const code   = params.get('code')?.trim().toUpperCase()
    if (code && code.startsWith('NOURISH-')) {
      localStorage.setItem('nourish_household_code',  code)
      localStorage.setItem('nourish_household_admin', 'false')
    }
    window.location.replace(window.location.origin + '/#/onboarding')
  }, [])

  return (
    <div style={styles.splash}>
      <img src='/icons/icon-192.png' style={{ width:'80px', height:'80px', borderRadius:'20px' }} alt='Nourish' />
      <p style={styles.splashText}>Joining household…</p>
    </div>
  )
}

function AuthCallbackScreen() {
  return (
    <div style={styles.splash}>
      <img src='/icons/icon-192.png' style={{ width:'80px', height:'80px', borderRadius:'20px' }} alt='Nourish' />
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

// ─── SupplementStreaks ────────────────────────────────────────────────────────

function SupplementStreaks({ userId, supplements }) {
  const [streaks, setStreaks] = useState({})

  const loadStreaks = useCallback(async () => {
    if (!userId || !supplements.length) return

    // Load last 30 days of supplement logs in one query
    const today = new Date()
    const days  = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      return d.toISOString().slice(0, 10)
    })
    const oldest = days[days.length - 1]
    const newest = days[0]

    const logs = await db.supplementLog
      .where('[userId+date]')
      .between([userId, oldest], [userId, newest], true, true)
      .toArray()

    const byDate = {}
    for (const log of logs) byDate[log.date] = log.done || {}

    const result = {}
    for (const supp of supplements) {
      let streak = 0
      for (const day of days) {
        if (byDate[day]?.[supp]) streak++
        else break
      }
      result[supp] = streak
    }
    setStreaks(result)
  }, [userId, supplements])

  useEffect(() => { loadStreaks() }, [loadStreaks])

  if (!supplements.length) {
    return (
      <div style={st2.empty}>
        <p style={st2.emptyTitle}>No supplements configured</p>
        <p style={st2.emptySub}>Add supplements during onboarding or profile setup</p>
      </div>
    )
  }

  return (
    <div style={st2.section}>
      <div style={st2.sectionHeader}>
        <span style={st2.sectionTitle}>Supplement Streaks</span>
        <span style={st2.sectionSub}>Consecutive days taken</span>
      </div>
      <div style={st2.card}>
        {supplements.map((supp, i) => {
          const streak   = streaks[supp] ?? 0
          const isLast   = i === supplements.length - 1
          return (
            <div key={supp} style={{ ...st2.row, borderBottom: isLast ? 'none' : '0.5px solid var(--border-subtle)' }}>
              <span style={st2.rowLabel}>💊 {supp}</span>
              <div style={st2.streakRight}>
                <span style={{ ...st2.streakNum, color: streak > 0 ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                  {streak}
                </span>
                <span style={st2.streakUnit}>day{streak !== 1 ? 's' : ''}</span>
                {streak >= 7  && <span title="7-day streak">🔥</span>}
                {streak >= 30 && <span title="30-day streak">⚡</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── ReminderSettings ─────────────────────────────────────────────────────────

const WEEK_DAYS = [
  { id:'sun', label:'Su' },
  { id:'mon', label:'Mo' },
  { id:'tue', label:'Tu' },
  { id:'wed', label:'We' },
  { id:'thu', label:'Th' },
  { id:'fri', label:'Fr' },
  { id:'sat', label:'Sa' },
]
const ALL_DAYS = WEEK_DAYS.map(d => d.id)

function ReminderSettings({ userId }) {
  const [reminders, setReminders] = useState([])
  const [label,     setLabel]     = useState('')
  const [time,      setTime]      = useState('09:00')
  const [days,      setDays]      = useState(ALL_DAYS)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const loadReminders = useCallback(async () => {
    if (!userId) return
    const r = await db.reminders.where('userId').equals(userId).toArray()
    setReminders(r.sort((a, b) => (a.time || '').localeCompare(b.time || '')))
  }, [userId])

  useEffect(() => { loadReminders() }, [loadReminders])

  function toggleDay(day) {
    setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  async function handleAdd() {
    if (!label.trim())   { setError('Enter a label'); return }
    if (!days.length)    { setError('Select at least one day'); return }
    setSaving(true)
    setError('')
    try {
      await db.reminders.add({
        id:        generateId(),
        userId,
        label:     label.trim(),
        time,
        days,
        dirty:     1,
        updatedAt: new Date().toISOString(),
      })
      setLabel('')
      setTime('09:00')
      setDays(ALL_DAYS)
      await loadReminders()
      saveRemindersToCloud(userId)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    await db.reminders.delete(id)
    await loadReminders()
    saveRemindersToCloud(userId)
  }

  const fmtDays = (ds = []) => {
    if (ds.length === 7) return 'Every day'
    if (ds.length === 0) return '—'
    const order = ['sun','mon','tue','wed','thu','fri','sat']
    return ds.sort((a,b) => order.indexOf(a) - order.indexOf(b))
             .map(d => d.charAt(0).toUpperCase() + d.slice(1))
             .join(', ')
  }

  return (
    <div style={st2.section}>

      {/* Existing reminders */}
      {reminders.length > 0 && (
        <div style={st2.card}>
          {reminders.map((r, i) => (
            <div key={r.id} style={{ ...st2.reminderRow, borderBottom: i < reminders.length - 1 ? '0.5px solid var(--border-subtle)' : 'none' }}>
              <div style={{ flex:1 }}>
                <div style={st2.reminderLabel}>{r.label}</div>
                <div style={st2.reminderMeta}>{r.time} · {fmtDays(r.days)}</div>
              </div>
              <button style={st2.deleteBtn} onClick={() => handleDelete(r.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {/* Add reminder form */}
      <div style={st2.sectionHeader}>
        <span style={st2.sectionTitle}>{reminders.length ? 'Add Reminder' : 'New Reminder'}</span>
        <span style={st2.sectionSub}>Shows as a banner when you open the app</span>
      </div>

      <div style={st2.card}>
        <input
          style={st2.input}
          placeholder="e.g. Take creatine, Log weight"
          value={label}
          onChange={e => setLabel(e.target.value)}
        />

        <div style={st2.timeRow}>
          <span style={st2.timeLabel}>Time</span>
          <input
            type="time"
            style={st2.timeInput}
            value={time}
            onChange={e => setTime(e.target.value)}
          />
        </div>

        <div style={st2.daysRow}>
          {WEEK_DAYS.map(d => (
            <button
              key={d.id}
              type="button"
              style={{
                ...st2.dayBtn,
                ...(days.includes(d.id) ? st2.dayBtnActive : {}),
              }}
              onClick={() => toggleDay(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>

        {error && <p style={st2.error}>{error}</p>}

        <button
          style={{ ...st2.addBtn, opacity: saving ? 0.6 : 1 }}
          onClick={handleAdd}
          disabled={saving}
        >
          {saving ? 'Adding…' : '+ Add Reminder'}
        </button>
      </div>

      {reminders.length === 0 && (
        <p style={st2.emptySub}>No reminders yet. Reminders appear as banners when you open the app at the right time.</p>
      )}
    </div>
  )
}

// ─── ThemeToggle ─────────────────────────────────────────────────────────────

// ─── ProfileEditor ────────────────────────────────────────────────────────────

function ProfileEditor({ user, onSaved }) {
  const [calories,  setCalories]  = useState(String(user?.macroGoals?.calories || 2000))
  const [protein,   setProtein]   = useState(String(user?.macroGoals?.protein  || 150))
  const [carbs,     setCarbs]     = useState(String(user?.macroGoals?.carbs    || 200))
  const [fat,       setFat]       = useState(String(user?.macroGoals?.fat      || 65))
  const [fibre,     setFibre]     = useState(String(user?.macroGoals?.fibre    || 30))
  const [height,    setHeight]    = useState(String(user?.height ? Math.round(user.height) : ''))
  const [suppInput, setSuppInput] = useState('')
  const [supps,     setSupps]     = useState(user?.supplements || [])
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  function addSupp() {
    const s = suppInput.trim()
    if (!s || supps.includes(s)) return
    setSupps(prev => [...prev, s])
    setSuppInput('')
  }

  function removeSupp(s) {
    setSupps(prev => prev.filter(x => x !== s))
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      const updates = {
        height:     parseFloat(height) || user.height,
        macroGoals: {
          calories: parseInt(calories)  || 2000,
          protein:  parseInt(protein)   || 150,
          carbs:    parseInt(carbs)     || 200,
          fat:      parseInt(fat)       || 65,
          fibre:    parseInt(fibre)     || 30,
        },
        supplements: supps,
      }
      await saveUser({ ...user, ...updates })
      await onSaved?.()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const macroFields = [
    { label:'Calories', unit:'kcal', val:calories, set:setCalories },
    { label:'Protein',  unit:'g',    val:protein,  set:setProtein  },
    { label:'Carbs',    unit:'g',    val:carbs,    set:setCarbs    },
    { label:'Fat',      unit:'g',    val:fat,      set:setFat      },
    { label:'Fibre',    unit:'g',    val:fibre,    set:setFibre    },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>

      {/* Identity (read-only) */}
      <div style={styles.settingsCard}>
        <p style={styles.settingsRow}>👤 {user?.name}</p>
      </div>

      {/* Macro goals */}
      <div style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
        <div style={{ fontSize:'13px', fontWeight:'600', color:'var(--text-secondary)', letterSpacing:'0.02em' }}>Daily Goals</div>
        {macroFields.map(({ label, unit, val, set }) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ fontSize:'14px', fontWeight:'500', color:'var(--text-primary)', flex:1 }}>{label}</span>
            <input
              type="number"
              inputMode="numeric"
              value={val}
              onChange={e => set(e.target.value)}
              style={{ width:'72px', padding:'7px 10px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-md)', fontSize:'15px', fontFamily:'var(--font-mono)', fontWeight:'600', color:'var(--text-primary)', outline:'none', textAlign:'right' }}
            />
            <span style={{ fontSize:'13px', color:'var(--text-tertiary)', width:'32px' }}>{unit}</span>
          </div>
        ))}
      </div>

      {/* Height */}
      <div style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'14px 16px', display:'flex', alignItems:'center', gap:'10px' }}>
        <span style={{ fontSize:'14px', fontWeight:'500', color:'var(--text-primary)', flex:1 }}>Height</span>
        <input
          type="number"
          inputMode="numeric"
          value={height}
          onChange={e => setHeight(e.target.value)}
          placeholder="—"
          style={{ width:'72px', padding:'7px 10px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-md)', fontSize:'15px', fontFamily:'var(--font-mono)', fontWeight:'600', color:'var(--text-primary)', outline:'none', textAlign:'right' }}
        />
        <span style={{ fontSize:'13px', color:'var(--text-tertiary)', width:'32px' }}>cm</span>
      </div>

      {/* Supplements */}
      <div style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-xl)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
        <div style={{ fontSize:'13px', fontWeight:'600', color:'var(--text-secondary)', letterSpacing:'0.02em' }}>Supplements</div>
        {supps.length > 0 && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
            {supps.map(s => (
              <div key={s} style={{ display:'flex', alignItems:'center', gap:'4px', padding:'4px 10px', background:'var(--bg-elevated)', borderRadius:'var(--r-full)', fontSize:'13px', color:'var(--text-primary)' }}>
                {s}
                <button
                  onClick={() => removeSupp(s)}
                  style={{ background:'none', border:'none', color:'var(--text-tertiary)', fontSize:'14px', cursor:'pointer', padding:'0 0 0 2px', lineHeight:1 }}
                >×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display:'flex', gap:'8px' }}>
          <input
            value={suppInput}
            onChange={e => setSuppInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSupp()}
            placeholder="e.g. Creatine, Vitamin D"
            style={{ flex:1, padding:'8px 10px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-md)', fontSize:'13px', color:'var(--text-primary)', outline:'none' }}
          />
          <button
            onClick={addSupp}
            style={{ padding:'8px 14px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}
          >Add</button>
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{ padding:'13px', background: saved ? 'var(--accent)' : 'var(--text-primary)', border:'none', borderRadius:'var(--r-lg)', color:'var(--text-inverse)', fontSize:'15px', fontWeight:'600', cursor:'pointer', opacity: saving ? 0.6 : 1, transition:'background 0.2s ease' }}
      >
        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Profile'}
      </button>
    </div>
  )
}

function ThemeToggle() {
  const [pref, setPref] = useState(getThemePref)

  function choose(p) {
    setPref(p)
    setThemePref(p)
  }

  return (
    <div style={th.row}>
      <span style={th.label}>Appearance</span>
      <div style={th.group}>
        {[['light','Light'],['system','System'],['dark','Dark']].map(([val, lbl]) => (
          <button
            key={val}
            style={{ ...th.btn, ...(pref === val ? th.btnActive : {}) }}
            onClick={() => choose(val)}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  )
}

const th = {
  row:       { display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', padding:'14px 16px' },
  label:     { fontSize:'15px', fontWeight:'500', color:'var(--text-primary)' },
  group:     { display:'flex', background:'var(--bg-elevated)', borderRadius:'var(--r-md)', padding:'3px', gap:'2px' },
  btn:       { padding:'6px 14px', background:'transparent', border:'none', borderRadius:'9px', fontSize:'13px', fontWeight:'500', color:'var(--text-secondary)', cursor:'pointer' },
  btnActive: { background:'var(--bg-surface)', color:'var(--text-primary)', boxShadow:'0 1px 3px rgba(0,0,0,0.1)' },
}

// ─── ExportData ───────────────────────────────────────────────────────────────

function ExportData({ userId }) {
  const [exporting, setExporting] = useState(false)
  const [days,      setDays]      = useState(30)

  async function handleExport() {
    if (!userId) return
    setExporting(true)
    try {
      const today     = new Date().toISOString().slice(0, 10)
      const startDate = (() => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().slice(0, 10)
      })()

      const { db } = await import('./db/indexedDB.js')
      const logs = await db.foodLogs
        .where('[userId+date]')
        .between([userId, startDate], [userId, today], true, true)
        .toArray()

      if (!logs.length) {
        alert('No food logs found for that period.')
        return
      }

      logs.sort((a, b) => a.date.localeCompare(b.date) || (a.meal || '').localeCompare(b.meal || ''))

      const header = 'Date,Meal,Food,Grams,Calories,Protein (g),Carbs (g),Fat (g),Fibre (g)\n'
      const rows   = logs.map(l =>
        [
          l.date,
          l.meal || '',
          `"${(l.name || '').replace(/"/g, '""')}"`,
          l.grams      ?? 0,
          l.calories   ?? 0,
          l.protein    ?? 0,
          l.carbs      ?? 0,
          l.fat        ?? 0,
          l.fibre      ?? 0,
        ].join(',')
      ).join('\n')

      const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `nourish-food-log-${today}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', padding:'14px 16px', display:'flex', flexDirection:'column', gap:'10px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:'15px', fontWeight:'500', color:'var(--text-primary)' }}>Export Food Log</span>
        <select
          style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'var(--r-sm)', padding:'4px 8px', fontSize:'13px', color:'var(--text-primary)', cursor:'pointer' }}
          value={days}
          onChange={e => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last year</option>
        </select>
      </div>
      <button
        style={{ padding:'10px', background:'var(--accent-dim)', border:'none', borderRadius:'var(--r-md)', color:'var(--accent)', fontSize:'13px', fontWeight:'600', cursor:'pointer', opacity: exporting ? 0.6 : 1 }}
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting ? 'Exporting…' : '↓ Download CSV'}
      </button>
    </div>
  )
}

// Shared styles for SupplementStreaks + ReminderSettings
const st2 = {
  section:       { display:'flex', flexDirection:'column', gap:'12px' },
  sectionHeader: { display:'flex', flexDirection:'column', gap:'2px', paddingTop:'4px' },
  sectionTitle:  { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', letterSpacing:'-0.01em' },
  sectionSub:    { fontSize:'12px', color:'var(--text-tertiary)' },
  card:          { background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', padding:'0 16px', overflow:'hidden' },
  row:           { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 0' },
  rowLabel:      { fontSize:'14px', color:'var(--text-primary)' },
  streakRight:   { display:'flex', alignItems:'center', gap:'4px' },
  streakNum:     { fontSize:'22px', fontWeight:'600', fontFamily:'var(--font-mono)', letterSpacing:'-0.03em' },
  streakUnit:    { fontSize:'12px', color:'var(--text-tertiary)' },
  reminderRow:   { display:'flex', alignItems:'center', gap:'12px', padding:'13px 0' },
  reminderLabel: { fontSize:'14px', fontWeight:'600', color:'var(--text-primary)' },
  reminderMeta:  { fontSize:'12px', color:'var(--text-tertiary)', marginTop:'2px' },
  deleteBtn:     { background:'none', border:'none', color:'var(--red)', fontSize:'13px', fontWeight:'600', cursor:'pointer', padding:'4px 0', flexShrink:0 },
  input:         { width:'100%', padding:'11px 0', background:'transparent', border:'none', borderBottom:'0.5px solid var(--border-subtle)', fontSize:'15px', color:'var(--text-primary)', outline:'none', boxSizing:'border-box' },
  timeRow:       { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 0', borderBottom:'0.5px solid var(--border-subtle)' },
  timeLabel:     { fontSize:'14px', color:'var(--text-primary)' },
  timeInput:     { background:'transparent', border:'none', fontSize:'15px', fontWeight:'500', color:'var(--text-primary)', outline:'none', textAlign:'right', cursor:'pointer' },
  daysRow:       { display:'flex', gap:'6px', padding:'12px 0', borderBottom:'0.5px solid var(--border-subtle)' },
  dayBtn:        { width:'34px', height:'34px', borderRadius:'50%', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)', fontSize:'11px', fontWeight:'700', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  dayBtnActive:  { background:'var(--text-primary)', borderColor:'var(--text-primary)', color:'var(--text-inverse)' },
  addBtn:        { width:'100%', padding:'13px', background:'var(--text-primary)', border:'none', borderRadius:'var(--r-md)', color:'var(--text-inverse)', fontSize:'15px', fontWeight:'600', cursor:'pointer', marginTop:'4px' },
  error:         { fontSize:'13px', color:'var(--red)', margin:'4px 0 0' },
  empty:         { display:'flex', flexDirection:'column', alignItems:'center', padding:'48px 0', gap:'6px' },
  emptyTitle:    { fontSize:'15px', fontWeight:'600', color:'var(--text-primary)', margin:0 },
  emptySub:      { fontSize:'13px', color:'var(--text-tertiary)', textAlign:'center', margin:0, lineHeight:'1.5' },
}

const styles = {
  splash: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg-base)', color: 'var(--text-primary)', gap: '12px' },
  splashLogo:  { fontSize: '64px' },
  splashText:  { fontSize: '18px', color: 'var(--text-secondary)', margin: 0 },
  splashSub:   { fontSize: '13px', color: 'var(--text-tertiary)', margin: 0, textAlign: 'center', padding: '0 32px' },
  retryBtn:    { marginTop: '16px', padding: '12px 24px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--r-lg)', color: '#fff', fontSize: '16px', fontWeight: '700', cursor: 'pointer' },
  appShell:    { display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg-base)', color: 'var(--text-primary)' },
  main:        { flex: 1, overflowY: 'auto' },
  screen:      { padding: '24px 16px 16px', minHeight: '100%', animation: 'pageIn 0.25s var(--ease-out) both' },
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
