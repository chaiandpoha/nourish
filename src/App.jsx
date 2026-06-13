import { useEffect, useState, useCallback, useRef } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/useAuth.jsx'
import { BannerProvider, useBanners } from './shared/Banner.jsx'
import AuthGate from './auth/AuthGate.jsx'
import AdminLogin from './auth/AdminLogin.jsx'
import Onboarding from './auth/Onboarding.jsx'
import BottomNav from './shared/BottomNav.jsx'
import { runMigrations } from './db/migrations.js'
import { db } from './db/indexedDB.js'
import { parseHealthClipboard } from './utils/healthSync.js'
import { saveRemindersToCloud, saveUser } from './db/db.js'
import { generateId } from './auth/crypto.js'
import { DRIVE } from './config.js'
import HomeScreen from './screens/Home.jsx'
import BatchList from './batches/BatchList.jsx'
import WeightLog from './progress/WeightLog.jsx'
import CalendarView from './calendar/CalendarView.jsx'
import AdminPanel from './admin/AdminPanel.jsx'
import ProgramManager from './workout/ProgramManager.jsx'
import WorkoutLog from './workout/WorkoutLog.jsx'
import WorkoutCharts from './workout/WorkoutCharts.jsx'
import MuscleVolume from './workout/MuscleVolume.jsx'
import ProgressPhotos from './progress/ProgressPhotos.jsx'
import Measurements from './progress/Measurements.jsx'
import InstallPrompt from './shared/InstallPrompt.jsx'
import MealEntry from './log/MealEntry.jsx'
import MealChat from './chat/MealChat.jsx'
import { localDate } from './log/DayLog.jsx'
import HouseholdScreen from './household/HouseholdScreen.jsx'
import RecipeList from './food/RecipeList.jsx'
import LabelList from './food/LabelList.jsx'
import { getThemePref, setThemePref } from './shared/theme.js'

export default function App() {
  const [migrationsRun,   setMigrationsRun]   = useState(false)
  const [migrationsError, setMigrationsError] = useState(null)

  useEffect(() => {
    const hash = window.location.hash
    const isReauthWindow = window.name === 'nourish_silent_reauth' || window.name === 'nourish_reauth'

    if (hash.includes('access_token')) {
      import('./db/driveApi.js').then(async ({ parseOAuthCallback, fetchUserInfo }) => {
        let success = false
        try {
          parseOAuthCallback()
          await fetchUserInfo()
          success = true
        } catch (e) {
          console.error('OAuth error:', e)
        }
        // Re-auth window: notify parent and close regardless of success
        if (window.opener && !window.opener.closed) {
          try { window.opener.postMessage({ type: 'nourish:reauth-done', success }, window.location.origin) } catch {}
          window.close()
          return
        }
        window.location.replace(window.location.origin + '/#/auth/callback')
      })
      return
    }

    // Re-auth window that got an error back from Google (e.g. interaction_required)
    if (isReauthWindow && window.opener && !window.opener.closed) {
      try { window.opener.postMessage({ type: 'nourish:reauth-done', success: false }, window.location.origin) } catch {}
      window.close()
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

function AppRoutes() {
  const { isLoading } = useAuth()

  if (isLoading) {
    return (
      <div style={styles.splash}>
        <img src='/icons/icon-192.png' style={{ width:'80px', height:'80px', borderRadius:'20px' }} alt='Nourish' />
      </div>
    )
  }

  return (
    <>
      <ReminderChecker />
      <QuotaChecker />
      <DriveReauthWatcher />
      <HealthClipboardSync />
      <Routes>
        <Route path="/admin-login"   element={<AdminLogin />} />
        <Route path="/onboarding"    element={<OnboardingScreen />} />
        <Route path="/auth/callback" element={<AuthCallbackScreen />} />
        <Route path="/*"             element={<AuthGate><ProtectedApp /></AuthGate>} />
      </Routes>
    </>
  )
}

function OnboardingScreen() {
  const { user, isLoading, refreshUser } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !user) navigate('/', { replace: true })
  }, [isLoading, user])

  if (isLoading || !user) return null
  return (
    <Onboarding
      onComplete={() => { refreshUser(); navigate('/', { replace: true }) }}
    />
  )
}

function AuthCallbackScreen() {
  const { loginWithGoogle, isLoading } = useAuth()
  const navigate = useNavigate()

  // Wait for isLoading=false so restoreToken() has run and getUserEmail() is populated
  useEffect(() => {
    if (isLoading) return
    ;(async () => {
      const { getUserEmail, getUserName } = await import('./db/driveApi.js')
      const email = getUserEmail()
      if (!email) {
        // OAuth was interrupted (Google security prompts, user navigated away, etc.)
        // Pass a flag so the sign-in screen can show a helpful message
        navigate('/', { replace: true, state: { signInInterrupted: true } })
        return
      }
      try {
        const profile = await loginWithGoogle(email, getUserName())
        navigate(profile._isNew ? '/onboarding' : '/', { replace: true })
      } catch {
        navigate('/', { replace: true, state: { signInInterrupted: true } })
      }
    })()
  }, [isLoading])

  return (
    <div style={styles.splash}>
      <img src='/icons/icon-192.png' style={{ width:'80px', height:'80px', borderRadius:'20px' }} alt='Nourish' />
      <p style={styles.splashText}>Signing in…</p>
    </div>
  )
}

function ProtectedApp() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const today = localDate()

  function handleGlobalLogged() {
    window.dispatchEvent(new CustomEvent('nourish:food-logged'))
  }

  if (!user.householdId) {
    return (
      <div style={styles.appShell}>
        <main style={styles.main}>
          <div style={styles.screen}>
            <HouseholdScreen />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={styles.appShell}>
      <main style={styles.main}>
        <Routes>
          <Route path="/"             element={<HomeScreen />} />
          <Route path="/chat"         element={<ChatScreen />} />
          <Route path="/food"         element={<FoodScreen />} />
          <Route path="/workout"      element={<WorkoutScreen />} />
          <Route path="/calendar"     element={<CalendarScreen />} />
          <Route path="/settings"     element={<SettingsScreen />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
      {user && pathname !== '/calendar' && pathname !== '/chat' && <MealEntry date={today} onLogged={handleGlobalLogged} />}
      <InstallPrompt />
    </div>
  )
}

function ChatScreen() {
  const navigate = useNavigate()
  return <MealChat onClose={() => navigate('/')} />
}

function DriveReauthWatcher() {
  const { user, encryptionKey } = useAuth()
  const { addBanner, removeBanner } = useBanners()
  const fallbackTimer = useRef(null)
  const bannerShown   = useRef(false)
  const bannerId      = useRef(null)

  useEffect(() => {
    if (!user || !encryptionKey) return

    async function attemptSilentReauth() {
      const { silentReauth } = await import('./db/driveApi.js')
      silentReauth()
      clearTimeout(fallbackTimer.current)
      fallbackTimer.current = setTimeout(showManualBanner, 30_000)
    }

    function showManualBanner() {
      if (bannerShown.current) return
      bannerShown.current = true
      bannerId.current = addBanner({
        type:    'warning',
        message: 'Drive backup paused',
        action:  { label: 'Reconnect', onClick: async () => {
          const { initiateReauth } = await import('./db/driveApi.js')
          initiateReauth()
        }},
        onDismiss: () => { bannerShown.current = false; bannerId.current = null },
      })
    }

    async function onReauthDone(e) {
      if (e.origin !== window.location.origin || e.data?.type !== 'nourish:reauth-done') return
      clearTimeout(fallbackTimer.current)
      if (!e.data.success) {
        showManualBanner()
        return
      }
      // Dismiss the error banner
      if (bannerId.current) { removeBanner(bannerId.current); bannerId.current = null }
      bannerShown.current = false
      const { flushDirtyRecords } = await import('./db/db.js')
      flushDirtyRecords(user.id, encryptionKey)
      scheduleProactiveRefresh()
    }

    async function scheduleProactiveRefresh() {
      const { isTokenValid, getAdminTokenExpiry } = await import('./db/driveApi.js')
      // isTokenValid() reloads _adminToken/_adminExpiry from localStorage —
      // necessary because the popup writes the new token to localStorage but
      // the parent window's in-memory state stays stale until reloaded.
      isTokenValid()
      const expiry = getAdminTokenExpiry()
      if (!expiry) return
      const delay = expiry - Date.now() - 5 * 60 * 1000
      if (delay > 0) setTimeout(attemptSilentReauth, delay)
    }

    async function onVisible() {
      if (document.visibilityState !== 'visible') return
      const { isTokenValid } = await import('./db/driveApi.js')
      if (!isTokenValid()) attemptSilentReauth()
    }

    window.addEventListener('nourish:drive-token-expired', attemptSilentReauth)
    window.addEventListener('message', onReauthDone)
    document.addEventListener('visibilitychange', onVisible)
    scheduleProactiveRefresh()

    return () => {
      clearTimeout(fallbackTimer.current)
      window.removeEventListener('nourish:drive-token-expired', attemptSilentReauth)
      window.removeEventListener('message', onReauthDone)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user?.id, encryptionKey, addBanner, removeBanner])

  return null
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


// Syncs steps from iOS Shortcut via Supabase (primary) or clipboard (fallback).
// Primary: shortcut POSTs to health_sync table → app fetches on open/foreground.
// Fallback: clipboard read on focus for users who haven't migrated shortcut yet.
function HealthClipboardSync() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    async function saveSteps(steps, cal, date) {
      const now = new Date().toISOString()
      const existing = await db.stepsLog.where('[userId+date]').equals([user.id, date]).first()
      if (existing) {
        await db.stepsLog.update(existing.id, { steps, caloriesBurned: cal, source: 'health', dirty: 1, updatedAt: now })
      } else {
        await db.stepsLog.add({ userId: user.id, date, steps, caloriesBurned: cal, source: 'health', dirty: 1, updatedAt: now })
      }
      window.dispatchEvent(new CustomEvent('nourish:steps-synced'))
    }

    async function syncFromSupabase() {
      if (!user.healthSyncToken) return
      try {
        const { sbFetchHealthSync } = await import('./db/supabase.js')
        const data = await sbFetchHealthSync(user.healthSyncToken)
        if (!data?.steps || !data?.date) return
        const existing = await db.stepsLog.where('[userId+date]').equals([user.id, data.date]).first()
        if (existing && existing.steps === data.steps) return // already up to date
        await saveSteps(data.steps, data.cal || 0, data.date)
      } catch {}
    }

    async function tryClipboard() {
      try {
        const text = await navigator.clipboard.readText()
        const parsed = parseHealthClipboard(text)
        if (!parsed) return
        const { steps, cal, date: parsedDate } = parsed
        await saveSteps(steps, cal, parsedDate || localDate())
        navigator.clipboard.writeText('').catch(() => {})
      } catch {}
    }

    async function syncAll() {
      await syncFromSupabase()
      await tryClipboard()
    }

    syncAll()

    const onFocus   = () => syncAll()
    const onVisible = () => { if (document.visibilityState === 'visible') syncAll() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user?.id, user?.healthSyncToken])

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
  const { user } = useAuth()
  const [tab, setTab] = useState('batches')

  return (
    <div style={styles.screen}>
      <h1 style={styles.screenTitle}>Food</h1>
      <div style={{ ...styles.tabBar, marginBottom: '16px' }}>
        <button style={{ ...styles.tabBtn, ...(tab === 'batches' ? styles.tabBtnActive : {}) }} onClick={() => setTab('batches')}>Batches</button>
        <button style={{ ...styles.tabBtn, ...(tab === 'recipes' ? styles.tabBtnActive : {}) }} onClick={() => setTab('recipes')}>Recipes</button>
        <button style={{ ...styles.tabBtn, ...(tab === 'labels'  ? styles.tabBtnActive : {}) }} onClick={() => setTab('labels')}>Labels</button>
      </div>
      {tab === 'batches' && <BatchList />}
      {tab === 'recipes' && <RecipeList householdId={user?.householdId} />}
      {tab === 'labels'  && <LabelList  householdId={user?.householdId} />}
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
    { id:'household',    label:'Household' },
    { id:'supps',        label:'Supps'     },
    { id:'reminders',    label:'Reminders' },
    { id:'health',       label:'Health'    },
    { id:'progress',     label:'Progress'  },
    { id:'body',         label:'Body'      },
    { id:'photos',       label:'Photos'    },
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

      {tab === 'household' && (
        <HouseholdScreen />
      )}

      {tab === 'supps' && (
        <SupplementStreaks userId={user?.id} supplements={user?.supplements || []} />
      )}

      {tab === 'reminders' && (
        <ReminderSettings userId={user?.id} />
      )}

      {tab === 'health' && (
        <HealthSyncSettings user={user} onSaved={refreshUser} />
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
      return localDate(d)
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

// ─── HealthSyncSettings ───────────────────────────────────────────────────────

function HealthSyncSettings({ user, onSaved }) {
  const [goalInput,    setGoalInput]    = useState(String(user?.stepGoal || 10000))
  const [goalSaved,    setGoalSaved]    = useState(false)
  const [tokenCopied,  setTokenCopied]  = useState(false)
  const [syncToken,    setSyncToken]    = useState(user?.healthSyncToken || null)
  const [syncStatus,   setSyncStatus]   = useState(null)   // null | 'checking' | { date, steps, cal } | 'none' | 'error'

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  useEffect(() => {
    // Generate token for existing users who don't have one yet
    if (!syncToken && user?.id) {
      import('./auth/crypto.js').then(async ({ generateId }) => {
        const token = generateId()
        await db.users.update(user.id, { healthSyncToken: token, dirty: 1, updatedAt: new Date().toISOString() })
        setSyncToken(token)
        // Persist to Supabase and refresh user in memory so HealthClipboardSync picks it up
        import('./db/supabase.js').then(({ sbSaveProfile }) => sbSaveProfile({ ...user, healthSyncToken: token })).catch(() => {})
        onSaved?.()
      })
    }
  }, [user?.id])

  async function checkSyncStatus() {
    if (!syncToken) return
    setSyncStatus('checking')
    try {
      const { sbFetchHealthSync } = await import('./db/supabase.js')
      const data = await sbFetchHealthSync(syncToken)
      setSyncStatus(data || 'none')
    } catch {
      setSyncStatus('error')
    }
  }

  async function saveGoal() {
    const goal = parseInt(goalInput) || 10000
    await db.users.update(user.id, { stepGoal: goal, dirty:1, updatedAt: new Date().toISOString() })
    await onSaved()
    setGoalSaved(true)
    setTimeout(() => setGoalSaved(false), 2000)
  }

  function copyToken() {
    if (!syncToken) return
    navigator.clipboard.writeText(syncToken).then(() => {
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    })
  }

  const shortcutSteps = [
    'Open Shortcuts → tap + → name it "Nourish Health Sync".',
    'Add: Health → Find Health Samples. Type = Steps. Tap "Add Filter" → Start Date → is after → "Beginning of Today". Remove any Limit. Rename to "Step Samples".',
    'Add: Scripting → Calculate Statistics on "Step Samples". Function = Sum. Rename to "Steps".',
    'Add: Health → Find Health Samples. Type = Active Energy Burned. Same filter (Start Date is after Beginning of Today). No Limit. Rename to "Energy Samples".',
    'Add: Scripting → Calculate Statistics on "Energy Samples". Function = Sum. Rename to "Calories".',
    'Add: Scripting → Get Current Date. Then add: Date → Format Date → Custom → yyyy-MM-dd. Rename to "Today".',
    'Add: Web → Get Contents of URL. Tap the action to expand it, then fill in the fields below.',
    'Save the shortcut.',
  ]

  const automationSteps = [
    'In Shortcuts → Automation → + → Time of Day.',
    'Set 8:00 AM, Daily → Next → New Blank Automation.',
    'Add: Shortcuts → Run Shortcut → "Nourish Health Sync".',
    'Turn OFF "Ask Before Running" → Done.',
    'Repeat for 1:00 PM and 7:00 PM.',
  ]

  const stepStyle    = { display:'flex', gap:'10px', marginBottom:'10px', alignItems:'flex-start' }
  const numStyle     = { width:'22px', height:'22px', borderRadius:'50%', background:'var(--accent-dim)', color:'var(--accent)', fontSize:'11px', fontWeight:'700', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:'1px' }
  const textStyle    = { fontSize:'13px', color:'var(--text-secondary)', margin:0, lineHeight:'1.5' }
  const subheadStyle = { fontSize:'12px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'12px' }
  const monoBox      = { background:'var(--bg-base)', borderRadius:'var(--r-md)', padding:'10px 12px', fontFamily:'monospace', fontSize:'11px', color:'var(--text-secondary)', wordBreak:'break-all', lineHeight:'1.6', border:'1px solid var(--border-subtle)', marginBottom:'8px', userSelect:'all' }

  return (
    <div style={styles.settingsSection}>
      <div style={styles.settingsSectionHeader}>
        <span style={styles.settingsSectionTitle}>Daily Step Goal</span>
        <span style={styles.settingsSectionSub}>Set your target steps per day</span>
      </div>

      <div style={styles.settingsCard}>
        <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
          <input
            type="number"
            inputMode="numeric"
            value={goalInput}
            onChange={e => { setGoalInput(e.target.value); setGoalSaved(false) }}
            style={{ flex:1, padding:'12px 14px', background:'var(--bg-base)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--text-primary)', outline:'none' }}
            placeholder="10000"
          />
          <button onClick={saveGoal}
            style={{ padding:'12px 20px', background:'var(--accent)', border:'none', borderRadius:'var(--r-lg)', color:'#fff', fontSize:'15px', fontWeight:'600', cursor:'pointer', flexShrink:0 }}>
            {goalSaved ? '✓' : 'Save'}
          </button>
        </div>
      </div>

      <div style={{ ...styles.settingsSectionHeader, marginTop:'8px' }}>
        <span style={styles.settingsSectionTitle}>iPhone Health Sync</span>
        <span style={styles.settingsSectionSub}>Fully automatic — shortcut POSTs directly to the cloud, no clipboard needed</span>
      </div>

      <div style={styles.settingsCard}>
        <p style={{ fontSize:'14px', color:'var(--text-secondary)', margin:'0 0 16px', lineHeight:'1.5' }}>
          Your shortcut sends steps and calories directly to the server when it runs. Nourish picks it up the next time you open the app — completely automatic, no browser opening.
        </p>

        <div style={subheadStyle}>Step 1 — Build the shortcut</div>
        {shortcutSteps.map((step, i) => (
          <div key={i} style={stepStyle}>
            <div style={numStyle}>{i + 1}</div>
            <p style={textStyle}>{step}</p>
          </div>
        ))}

        <div style={{ ...subheadStyle, marginTop:'16px' }}>Get Contents of URL — settings</div>
        <p style={{ fontSize:'12px', color:'var(--text-tertiary)', margin:'0 0 8px', lineHeight:'1.5' }}>
          In step 7, configure the action like this:
        </p>

        <div style={{ fontSize:'11px', color:'var(--text-tertiary)', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'4px' }}>URL</div>
        <div style={monoBox}>{supabaseUrl}/rest/v1/health_sync</div>

        <div style={{ fontSize:'11px', color:'var(--text-tertiary)', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'4px' }}>Method</div>
        <div style={monoBox}>POST</div>

        <div style={{ fontSize:'11px', color:'var(--text-tertiary)', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'4px' }}>Headers (add 3)</div>
        <div style={monoBox}>
          apikey: {supabaseKey}{'\n'}
          Content-Type: application/json{'\n'}
          Prefer: resolution=merge-duplicates
        </div>

        <div style={{ fontSize:'11px', color:'var(--text-tertiary)', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'4px' }}>Request Body — JSON</div>
        <div style={monoBox}>
          {`{\n  "token": "${syncToken || '(loading…)'}",\n  "steps": [Steps variable],\n  "cal": [Calories variable],\n  "date": "[Today variable]"\n}`}
        </div>
        <p style={{ fontSize:'11px', color:'var(--text-tertiary)', margin:'0 0 12px', lineHeight:'1.4' }}>
          Keys must be lowercase exactly as shown (<b>steps</b>, <b>cal</b>, <b>date</b>). Tap each bracketed placeholder and select the matching Shortcut variable from the list.
        </p>

        <button onClick={copyToken}
          style={{ width:'100%', padding:'11px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--text-primary)', fontSize:'14px', fontWeight:'600', cursor:'pointer', marginBottom:'8px' }}>
          {tokenCopied ? '✓ Token copied!' : 'Copy my sync token'}
        </button>

        <button onClick={checkSyncStatus}
          style={{ width:'100%', padding:'11px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-lg)', color:'var(--accent)', fontSize:'14px', fontWeight:'600', cursor:'pointer', marginBottom:'16px' }}>
          {syncStatus === 'checking' ? 'Checking…' : 'Check sync status'}
        </button>

        {syncStatus && syncStatus !== 'checking' && (
          <div style={{ background:'var(--bg-base)', borderRadius:'var(--r-md)', padding:'10px 12px', marginBottom:'16px', border:'1px solid var(--border-subtle)', fontSize:'13px', color:'var(--text-secondary)', lineHeight:'1.5' }}>
            {syncStatus === 'none'  && 'No data found in the cloud yet. Run your shortcut once to test it.'}
            {syncStatus === 'error' && 'Could not reach Supabase. Check your internet connection.'}
            {syncStatus?.date && (
              <>
                <b style={{ color:'var(--text-primary)' }}>Last data received:</b>{' '}
                {syncStatus.date} — {Number(syncStatus.steps).toLocaleString()} steps, {Math.round(syncStatus.cal)} cal burned
              </>
            )}
          </div>
        )}

        <div style={{ ...subheadStyle }}>Step 2 — Automate it</div>
        {automationSteps.map((step, i) => (
          <div key={i} style={stepStyle}>
            <div style={numStyle}>{i + 1}</div>
            <p style={textStyle}>{step}</p>
          </div>
        ))}

        <div style={{ background:'var(--bg-base)', borderRadius:'var(--r-lg)', padding:'12px', marginTop:'8px', border:'1px solid var(--border-subtle)' }}>
          <div style={{ fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:'6px' }}>How it works</div>
          <p style={{ fontSize:'12px', color:'var(--text-secondary)', margin:0, lineHeight:'1.6' }}>
            The automation runs silently 3× a day and sends your Health data straight to the server. When you open Nourish it fetches it automatically — no clipboard, no browser, nothing to tap.
          </p>
        </div>
      </div>
    </div>
  )
}

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
      const today     = localDate()
      const startDate = (() => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return localDate(d)
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
  screenHeader:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' },
  lockBtn:     { background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer' },
}
