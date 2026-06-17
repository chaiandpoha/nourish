import { useState, useCallback } from 'react'
import { useAuth } from '../auth/useAuth.jsx'
import { db } from '../db/indexedDB.js'
import {
  flushDirtyToSupabase,
  pushAllLocalDataToSupabase,
  restoreFromSupabase,
} from '../db/db.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTHLY_TABLES = [
  'foodLogs', 'workoutLogs', 'workoutSets', 'weightLog',
  'supplementLog', 'stepsLog', 'measurements', 'bloodWork', 'moodLog',
]
const SINGLE_TABLES = ['programmes', 'mealTemplates', 'reminders']
const ALL_TABLES    = [...MONTHLY_TABLES, ...SINGLE_TABLES]

// ─── DebugPanel ───────────────────────────────────────────────────────────────

export default function DebugPanel() {
  const { user } = useAuth()
  const [results,  setResults]  = useState(null)
  const [running,  setRunning]  = useState(false)
  const [opLog,    setOpLog]    = useState([])

  function log(msg, ok = null) {
    const icon = ok === true ? '✓' : ok === false ? '✗' : '·'
    const color = ok === true ? '#34C759' : ok === false ? '#FF3B30' : '#aaa'
    setOpLog(prev => [...prev, { msg, icon, color, ts: new Date().toLocaleTimeString() }])
  }

  const runDiagnostics = useCallback(async () => {
    if (!user) return
    setRunning(true)
    setOpLog([])
    const res = {}

    // ── 1. Auth / Profile ────────────────────────────────────────────────────
    log('Checking auth…')
    res.auth = {
      id:          user.id,
      email:       user.email || '(none)',
      name:        user.name  || '(none)',
      isAdmin:     user.isAdmin,
      householdId: user.householdId || '(none)',
      dirtyFlag:   user.dirty || 0,
    }
    log(`User: ${user.email} | admin=${user.isAdmin} | household=${user.householdId ? 'yes' : 'no'}`, true)

    // ── 2. IndexedDB table counts + dirty records ─────────────────────────────
    log('Scanning IndexedDB…')
    res.idb = {}
    let totalDirty = 0
    for (const t of ALL_TABLES) {
      if (!db[t]) { res.idb[t] = { count: 0, dirty: 0, error: 'table missing' }; continue }
      try {
        const count = await db[t].where('userId').equals(user.id).count()
        const dirty = await db[t].where('userId').equals(user.id).and(r => r.dirty === 1).count()
        res.idb[t]  = { count, dirty }
        totalDirty += dirty
      } catch (e) {
        res.idb[t] = { count: 0, dirty: 0, error: e.message }
      }
    }
    // Foods (no userId field)
    try {
      const personalFoods = await db.foods.where('source').anyOf(['saved','scanned','recipe']).count()
      const localBatches  = await db.batches.toArray()
      const dirtyBatches  = localBatches.filter(b => b.dirty === 1).length
      res.idb._foods   = { count: personalFoods }
      res.idb._batches = { count: localBatches.length, dirty: dirtyBatches, open: localBatches.filter(b => !b.closed).length, closed: localBatches.filter(b => b.closed).length }
    } catch (e) {
      res.idb._foods   = { error: e.message }
      res.idb._batches = { error: e.message }
    }
    // Profile dirty flag
    const profileRow = await db.users.get(user.id).catch(() => null)
    res.idb._profile = { dirty: profileRow?.dirty || 0 }
    if (profileRow?.dirty) totalDirty++

    res.totalDirty = totalDirty
    log(`IndexedDB scan complete — ${totalDirty} dirty records`, totalDirty === 0)

    // ── 3. Supabase profile ──────────────────────────────────────────────────
    log('Checking Supabase profile…')
    try {
      const { sbFetchProfile } = await import('../db/supabase.js')
      const sbProfile = await sbFetchProfile(user.email)
      if (sbProfile) {
        res.sbProfile = { found: true, name: sbProfile.name, householdId: sbProfile.householdId, email: sbProfile.email }
        log(`Supabase profile: found (${sbProfile.email})`, true)
      } else {
        res.sbProfile = { found: false }
        log('Supabase profile: NOT found (will be pushed on next flush)', false)
      }
    } catch (e) {
      res.sbProfile = { found: false, error: e.message }
      log(`Supabase profile error: ${e.message}`, false)
    }

    // ── 4. Supabase user_data ────────────────────────────────────────────────
    log('Fetching Supabase user_data…')
    try {
      const { sbFetchAllUserData } = await import('../db/supabase.js')
      const rows = await sbFetchAllUserData(user.id)
      res.sbData = {}
      let sbTotal = 0
      for (const row of rows) {
        const cnt = Array.isArray(row.data) ? row.data.length : 0
        const key = row.month_key === 'all' ? row.table_name : `${row.table_name}/${row.month_key}`
        res.sbData[key] = cnt
        sbTotal += cnt
      }
      res.sbDataTotal = sbTotal
      log(`Supabase user_data: ${rows.length} blobs, ${sbTotal} total records`, rows.length > 0)
    } catch (e) {
      res.sbData = { error: e.message }
      log(`Supabase user_data error: ${e.message}`, false)
    }

    // ── 5. Supabase batches vs local ─────────────────────────────────────────
    if (user.householdId) {
      log('Checking Supabase batches…')
      try {
        const { sbFetchBatches } = await import('../db/supabase.js')
        const sbBatches = await sbFetchBatches(user.householdId)
        const localBatches = await db.batches.toArray()
        res.sbBatches = {
          remote: sbBatches.length,
          local:  localBatches.length,
          remoteOpen:   sbBatches.filter(b => !b.closed).length,
          remoteClosed: sbBatches.filter(b => b.closed).length,
          localOpen:    localBatches.filter(b => !b.closed).length,
          localClosed:  localBatches.filter(b => b.closed).length,
        }
        const inSync = sbBatches.length === localBatches.length
        log(`Batches — Supabase: ${sbBatches.length} | Local: ${localBatches.length}`, inSync)
      } catch (e) {
        res.sbBatches = { error: e.message }
        log(`Batches error: ${e.message}`, false)
      }

      // ── 6. Supabase household_foods vs local ─────────────────────────────
      log('Checking household foods…')
      try {
        const { sbFetchHouseholdFoods } = await import('../db/supabase.js')
        const sbFoods    = await sbFetchHouseholdFoods(user.householdId)
        const localFoods = await db.foods.where('source').anyOf(['saved','scanned','recipe']).toArray()
        res.sbFoods = {
          remote: sbFoods.length,
          local:  localFoods.length,
          remoteBySource: sbFoods.reduce((acc, f) => { acc[f.source] = (acc[f.source]||0)+1; return acc }, {}),
          localBySource:  localFoods.reduce((acc, f) => { acc[f.source] = (acc[f.source]||0)+1; return acc }, {}),
        }
        log(`Household foods — Supabase: ${sbFoods.length} | Local: ${localFoods.length}`, sbFoods.length >= localFoods.length)
      } catch (e) {
        res.sbFoods = { error: e.message }
        log(`Household foods error: ${e.message}`, false)
      }
    }

    // ── 7. Food log coverage ─────────────────────────────────────────────────
    log('Checking food log coverage…')
    try {
      const allLogs = await db.foodLogs.where('userId').equals(user.id).toArray()
      const months  = new Set(allLogs.map(r => r.date?.slice(0,7)).filter(Boolean))
      const sbMonths = new Set(
        Object.keys(res.sbData || {})
          .filter(k => k.startsWith('foodLogs/'))
          .map(k => k.replace('foodLogs/', ''))
      )
      res.foodLogCoverage = {
        localMonths:    [...months].sort(),
        supabaseMonths: [...sbMonths].sort(),
        totalLocal:     allLogs.length,
        missingInSB:    [...months].filter(m => !sbMonths.has(m)),
      }
      const allCovered = res.foodLogCoverage.missingInSB.length === 0
      log(
        allCovered
          ? `Food logs: ${allLogs.length} entries across ${months.size} months — all in Supabase`
          : `Food logs: ${res.foodLogCoverage.missingInSB.length} month(s) missing from Supabase`,
        allCovered
      )
    } catch (e) {
      res.foodLogCoverage = { error: e.message }
      log(`Food log coverage error: ${e.message}`, false)
    }

    // ── 8. authApi session ───────────────────────────────────────────────────
    log('Checking auth session…')
    try {
      const { getUserEmail } = await import('../db/authApi.js')
      const sessionEmail = getUserEmail()
      res.authSession = { sessionEmail: sessionEmail || '(none)', matches: sessionEmail?.toLowerCase() === user.email?.toLowerCase() }
      log(`Auth session email: ${sessionEmail || 'none'} — matches profile: ${res.authSession.matches}`, res.authSession.matches || !sessionEmail)
    } catch (e) {
      res.authSession = { error: e.message }
      log(`Auth session error: ${e.message}`, false)
    }

    setResults(res)
    setRunning(false)
    log('─── Diagnostics complete ───')
  }, [user])

  async function doFlushDirty() {
    log('Flushing dirty records to Supabase…')
    try {
      await flushDirtyToSupabase(user.id)
      log('Flush complete', true)
      await runDiagnostics()
    } catch (e) {
      log(`Flush error: ${e.message}`, false)
    }
  }

  async function doPushAll() {
    log('Pushing ALL local data to Supabase…')
    try {
      await pushAllLocalDataToSupabase(user.id)
      log('Full push complete', true)
      await runDiagnostics()
    } catch (e) {
      log(`Push error: ${e.message}`, false)
    }
  }

  async function doPushAllUsers() {
    log('Pushing data for ALL local users…')
    try {
      const allUsers = await db.users.toArray()
      log(`Found ${allUsers.length} user(s) in local DB`)
      for (const u of allUsers) {
        log(`Pushing: ${u.email || u.id}`)
        await pushAllLocalDataToSupabase(u.id)
        log(`Done: ${u.email || u.id}`, true)
      }
      await runDiagnostics()
    } catch (e) {
      log(`Push-all-users error: ${e.message}`, false)
    }
  }

  async function doRestore() {
    log('Restoring from Supabase…')
    try {
      const count = await restoreFromSupabase(user.id)
      log(`Restore complete — ${count} records restored`, count > 0)
      await runDiagnostics()
    } catch (e) {
      log(`Restore error: ${e.message}`, false)
    }
  }

  async function doPushHousehold() {
    if (!user.householdId) { log('No household — skipping', false); return }
    log('Pushing household foods + batches…')
    try {
      const { pushLocalFoodsToHousehold, pushLocalBatchesToHousehold } = await import('../food/FoodDB.js')
      await pushLocalFoodsToHousehold(user.householdId)
      await pushLocalBatchesToHousehold(user.householdId, user.email)
      log('Household push complete', true)
      await runDiagnostics()
    } catch (e) {
      log(`Household push error: ${e.message}`, false)
    }
  }

  async function doRecoverAllFoods() {
    if (!user.householdId) { log('No current household — skipping', false); return }
    log('Recovering recipes from all past households…')
    try {
      const { sbFetchAllUserHouseholds, sbFetchHouseholdFoods, sbSaveFood } = await import('../db/supabase.js')
      const allHids = await sbFetchAllUserHouseholds(user.email)
      log(`Found ${allHids.length} household(s) for ${user.email}`)
      let totalFoods = 0
      for (const hid of allHids) {
        const foods = await sbFetchHouseholdFoods(hid)
        if (!foods.length) { log(`Household ${hid.slice(0,8)}: 0 foods`); continue }
        log(`Household ${hid.slice(0,8)}: ${foods.length} foods — merging locally`)
        await db.foods.bulkPut(foods)
        // Push any foods not already in the current household
        for (const food of foods) {
          if (food.source === 'usda' || food.source === 'nin') continue
          await sbSaveFood(food, user.householdId).catch(() => {})
        }
        totalFoods += foods.length
      }
      log(`Recovery complete — ${totalFoods} foods merged`, totalFoods > 0)
      await runDiagnostics()
    } catch (e) {
      log(`Recovery error: ${e.message}`, false)
    }
  }

  async function doClearDirtyFlags() {
    log('Clearing all dirty flags (mark as synced)…')
    try {
      const { clearDirty } = await import('../db/indexedDB.js')
      for (const t of ALL_TABLES) {
        if (!db[t]) continue
        const dirty = await db[t].where('userId').equals(user.id).and(r => r.dirty === 1).toArray()
        if (dirty.length) await clearDirty(t, dirty.map(r => r.id))
      }
      await db.users.update(user.id, { dirty: 0 })
      log('Dirty flags cleared', true)
      await runDiagnostics()
    } catch (e) {
      log(`Clear error: ${e.message}`, false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>

      {/* Action buttons */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
        <button style={b.primary} onClick={runDiagnostics} disabled={running}>
          {running ? 'Running…' : '▶ Run Diagnostics'}
        </button>
        <button style={b.action} onClick={doFlushDirty} disabled={running}>⬆ Flush Dirty</button>
        <button style={b.action} onClick={doPushAll}    disabled={running}>⬆⬆ Push All Data</button>
        <button style={b.action} onClick={doPushAllUsers} disabled={running}>⬆⬆⬆ Push All Users</button>
        <button style={b.action} onClick={doRestore}    disabled={running}>⬇ Restore from SB</button>
        <button style={b.action} onClick={doPushHousehold} disabled={running}>🏠 Push Household</button>
        <button style={{ ...b.action, color:'var(--accent)' }} onClick={doRecoverAllFoods} disabled={running}>♻ Recover Recipes</button>
        <button style={{ ...b.action, color:'var(--red)' }} onClick={doClearDirtyFlags} disabled={running}>✗ Clear Dirty Flags</button>
      </div>

      {/* Operation log */}
      {opLog.length > 0 && (
        <div style={c.logBox}>
          {opLog.map((entry, i) => (
            <div key={i} style={{ display:'flex', gap:'6px', alignItems:'baseline' }}>
              <span style={{ color: entry.color, fontWeight:'700', flexShrink:0 }}>{entry.icon}</span>
              <span style={{ color:'var(--text-secondary)', fontSize:'11px', flexShrink:0 }}>{entry.ts}</span>
              <span style={{ color:'var(--text-primary)', fontSize:'12px' }}>{entry.msg}</span>
            </div>
          ))}
        </div>
      )}

      {results && (
        <>
          {/* Auth */}
          <Section title="Auth / Profile">
            <Row label="User ID"      value={results.auth.id}          mono />
            <Row label="Email"        value={results.auth.email} />
            <Row label="Name"         value={results.auth.name} />
            <Row label="Admin"        value={String(results.auth.isAdmin)} ok={results.auth.isAdmin} />
            <Row label="Household"    value={results.auth.householdId}  mono />
            <Row label="Profile dirty" value={String(results.auth.dirtyFlag)} ok={results.auth.dirtyFlag === 0} />
            <Row label="Session email" value={results.authSession?.sessionEmail || '?'} ok={results.authSession?.matches} />
          </Section>

          {/* IndexedDB */}
          <Section title="IndexedDB — record counts">
            <Row label="Total dirty" value={String(results.totalDirty)} ok={results.totalDirty === 0} bold />
            {ALL_TABLES.map(t => {
              const r = results.idb[t]
              if (!r) return null
              return (
                <Row
                  key={t}
                  label={t}
                  value={r.error ? `ERROR: ${r.error}` : `${r.count} records${r.dirty > 0 ? ` (${r.dirty} dirty)` : ''}`}
                  ok={!r.error && r.dirty === 0}
                  mono
                />
              )
            })}
            <Row label="foods (personal)" value={results.idb._foods?.error || `${results.idb._foods?.count} records`} ok={!results.idb._foods?.error} mono />
            <Row
              label="batches"
              value={results.idb._batches?.error || `${results.idb._batches?.count} total (${results.idb._batches?.open} open, ${results.idb._batches?.closed} closed, ${results.idb._batches?.dirty} dirty)`}
              ok={!results.idb._batches?.error && results.idb._batches?.dirty === 0}
              mono
            />
          </Section>

          {/* Supabase profile */}
          <Section title="Supabase — profile">
            {results.sbProfile?.error
              ? <Row label="Error" value={results.sbProfile.error} ok={false} />
              : results.sbProfile?.found
                ? <>
                    <Row label="Found"      value="yes"                      ok={true} />
                    <Row label="Email"      value={results.sbProfile.email} />
                    <Row label="Name"       value={results.sbProfile.name  || '(empty)'} ok={!!results.sbProfile.name} />
                    <Row label="Household"  value={results.sbProfile.householdId || '(empty)'} ok={!!results.sbProfile.householdId} />
                  </>
                : <Row label="Found" value="NO — run Flush Dirty to push profile" ok={false} />
            }
          </Section>

          {/* Supabase user_data */}
          <Section title="Supabase — user_data blobs">
            {results.sbData?.error
              ? <Row label="Error" value={results.sbData.error} ok={false} />
              : <>
                  <Row label="Total records" value={String(results.sbDataTotal || 0)} ok={(results.sbDataTotal || 0) > 0} bold />
                  {Object.entries(results.sbData || {}).map(([k, v]) => (
                    <Row key={k} label={k} value={`${v} records`} mono />
                  ))}
                </>
            }
          </Section>

          {/* Food log coverage */}
          <Section title="Food log month coverage">
            {results.foodLogCoverage?.error
              ? <Row label="Error" value={results.foodLogCoverage.error} ok={false} />
              : <>
                  <Row label="Local total"    value={`${results.foodLogCoverage.totalLocal} entries`} bold />
                  <Row label="Local months"   value={results.foodLogCoverage.localMonths.join(', ') || '(none)'} mono />
                  <Row label="SB months"      value={results.foodLogCoverage.supabaseMonths.join(', ') || '(none)'} mono />
                  <Row
                    label="Missing from SB"
                    value={results.foodLogCoverage.missingInSB.length === 0 ? 'none — fully synced' : results.foodLogCoverage.missingInSB.join(', ')}
                    ok={results.foodLogCoverage.missingInSB.length === 0}
                  />
                </>
            }
          </Section>

          {/* Batches */}
          {results.sbBatches && (
            <Section title="Supabase — batches">
              {results.sbBatches.error
                ? <Row label="Error" value={results.sbBatches.error} ok={false} />
                : <>
                    <Row label="Local"         value={`${results.sbBatches.local} (${results.sbBatches.localOpen} open, ${results.sbBatches.localClosed} closed)`} bold />
                    <Row label="Supabase"      value={`${results.sbBatches.remote} (${results.sbBatches.remoteOpen} open, ${results.sbBatches.remoteClosed} closed)`} bold />
                    <Row label="In sync"       value={results.sbBatches.remote === results.sbBatches.local ? 'yes' : 'no — run Push Household'} ok={results.sbBatches.remote === results.sbBatches.local} />
                  </>
              }
            </Section>
          )}

          {/* Household foods */}
          {results.sbFoods && (
            <Section title="Supabase — household_foods">
              {results.sbFoods.error
                ? <Row label="Error" value={results.sbFoods.error} ok={false} />
                : <>
                    <Row label="Local"    value={`${results.sbFoods.local} (${JSON.stringify(results.sbFoods.localBySource)})`} />
                    <Row label="Supabase" value={`${results.sbFoods.remote} (${JSON.stringify(results.sbFoods.remoteBySource)})`} />
                    <Row label="In sync"  value={results.sbFoods.remote >= results.sbFoods.local ? 'yes' : 'local has more — run Push Household'} ok={results.sbFoods.remote >= results.sbFoods.local} />
                  </>
              }
            </Section>
          )}
        </>
      )}
    </div>
  )
}

// ─── Small components ─────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border-subtle)', borderRadius:'var(--r-lg)', overflow:'hidden' }}>
      <div style={{ padding:'10px 14px', background:'var(--bg-elevated)', borderBottom:'0.5px solid var(--border-subtle)', fontSize:'11px', fontWeight:'700', color:'var(--text-tertiary)', textTransform:'uppercase', letterSpacing:'0.08em' }}>
        {title}
      </div>
      <div style={{ padding:'4px 0' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, ok, mono, bold }) {
  const dotColor = ok === true ? '#34C759' : ok === false ? '#FF3B30' : 'transparent'
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:'8px', padding:'6px 14px', borderBottom:'0.5px solid var(--border-subtle)' }}>
      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: dotColor, flexShrink:0, marginTop:'4px' }} />
      <span style={{ fontSize:'12px', color:'var(--text-tertiary)', flexShrink:0, width:'140px' }}>{label}</span>
      <span style={{ fontSize:'12px', color:'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : undefined, fontWeight: bold ? '700' : undefined, wordBreak:'break-all' }}>
        {value}
      </span>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const b = {
  primary: { padding:'12px', background:'var(--accent)', border:'none', borderRadius:'var(--r-md)', color:'#fff', fontSize:'14px', fontWeight:'700', cursor:'pointer', gridColumn:'1 / -1' },
  action:  { padding:'10px', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:'var(--r-md)', color:'var(--text-primary)', fontSize:'13px', fontWeight:'600', cursor:'pointer' },
}

const c = {
  logBox: {
    background:    'var(--bg-base)',
    border:        '1px solid var(--border-subtle)',
    borderRadius:  'var(--r-md)',
    padding:       '10px 12px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '3px',
    maxHeight:     '200px',
    overflowY:     'auto',
    fontFamily:    'var(--font-mono)',
  },
}
