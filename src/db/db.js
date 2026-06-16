// Storage adapter — IndexedDB + Supabase cloud sync
// All features import from here — never import indexedDB or supabase directly

import { db, getDirtyRecords, clearDirty } from './indexedDB.js'
import { localDate } from '../log/DayLog.jsx'
import { MACRO_KEYS } from '../config.js'

const SYNC_INTERVAL_MS = 30_000

// ─── Sync state ───────────────────────────────────────────────────────────────
let _syncInterval  = null
let _isSyncing     = false
let _visHandler    = null
let _lastSyncTime  = null   // ISO timestamp of the last successful flush

export function getLastSyncTime() { return _lastSyncTime }

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initStorage(userId) {
  // New device — restore from Supabase; otherwise push local data to keep it in sync
  try {
    // Check across multiple tables so a workout-only or weight-only user isn't
    // treated as a new device every login
    let localCount = 0
    for (const t of ['foodLogs', 'workoutLogs', 'weightLog', 'measurements', 'supplementLog']) {
      if (!db[t]) continue
      localCount += await db[t].where('userId').equals(userId).count().catch(() => 0)
      if (localCount > 0) break
    }
    if (localCount === 0) {
      restoreFromSupabase(userId).catch(e => console.warn('Supabase restore:', e))
    } else {
      pushAllLocalDataToSupabase(userId).catch(() => {})
    }
  } catch (e) {
    console.warn('Restore check failed:', e)
  }

  // Flush any dirty records immediately (e.g. newly-created profile)
  flushDirtyToSupabase(userId).catch(() => {})

  // Background sync every 30s
  startSupabaseSync(userId)
}

export function teardownStorage() {
  if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null }
  if (_visHandler)   { document.removeEventListener('visibilitychange', _visHandler); _visHandler = null }
}

// ─── Supabase sync ────────────────────────────────────────────────────────────

export function startSupabaseSync(userId) {
  if (_syncInterval) clearInterval(_syncInterval)
  _syncInterval = setInterval(() => flushDirtyToSupabase(userId), SYNC_INTERVAL_MS)

  if (_visHandler) document.removeEventListener('visibilitychange', _visHandler)
  _visHandler = () => { if (document.visibilityState === 'hidden') flushDirtyToSupabase(userId).catch(() => {}) }
  document.addEventListener('visibilitychange', _visHandler)
}

export async function flushDirtyToSupabase(userId) {
  if (_isSyncing) return
  _isSyncing = true
  try {
    const { sbPushUserData, sbSaveProfile } = await import('./supabase.js')

    const MONTHLY = [
      'foodLogs', 'workoutLogs', 'workoutSets', 'weightLog',
      'supplementLog', 'stepsLog', 'measurements', 'bloodWork', 'moodLog',
    ]
    for (const table of MONTHLY) {
      if (!db[table]) continue
      const dirty = await getDirtyRecords(table, userId).catch(() => [])
      if (!dirty.length) continue

      const dirtyMonths = new Set(
        dirty.map(r => (r.date || r.updatedAt || '').slice(0, 7)).filter(Boolean)
      )
      const all = await db[table].where('userId').equals(userId).toArray().catch(() => [])

      // Track which dirty record IDs were successfully pushed — only clear those
      const pushedIds = new Set()
      for (const month of dirtyMonths) {
        const monthData = all.filter(r => (r.date || r.updatedAt || '').startsWith(month))
        if (!monthData.length) continue
        const ok = await sbPushUserData(userId, table, month, monthData).then(() => true).catch(() => false)
        if (ok) monthData.forEach(r => pushedIds.add(r.id))
      }
      const toClear = dirty.filter(r => pushedIds.has(r.id)).map(r => r.id)
      if (toClear.length) await clearDirty(table, toClear)
    }

    const SINGLE = ['programmes', 'mealTemplates', 'reminders']
    for (const table of SINGLE) {
      if (!db[table]) continue
      const dirty = await db[table].where('userId').equals(userId).and(r => r.dirty === 1).toArray().catch(() => [])
      if (!dirty.length) continue
      const all = await db[table].where('userId').equals(userId).toArray().catch(() => [])
      const ok  = await sbPushUserData(userId, table, 'all', all).then(() => true).catch(() => false)
      if (ok) await clearDirty(table, dirty.map(r => r.id))
    }

    // Personal batches (solo users without a household) — push via user_data table
    // Household batches are pushed immediately in BatchBuilder via sbSaveBatch
    const profile = await db.users.get(userId).catch(() => null)
    if (!profile?.householdId) {
      const dirtyBatches = await db.batches.where('userId').equals(userId).and(b => b.dirty === 1).toArray().catch(() => [])
      if (dirtyBatches.length) {
        const allBatches = await db.batches.where('userId').equals(userId).toArray().catch(() => [])
        const ok = await sbPushUserData(userId, 'batches', 'all', allBatches).then(() => true).catch(() => false)
        if (ok) await clearDirty('batches', dirtyBatches.map(b => b.id))
      }
    }

    // Personal foods — no dirty flag, always push when called
    const foods = await db.foods
      .where('source').anyOf(['saved', 'scanned', 'recipe'])
      .toArray().catch(() => [])
    if (foods.length) await sbPushUserData(userId, 'foods', 'all', foods).catch(() => {})

    // Profile — push if dirty (reuse profile already fetched above)
    if (profile?.dirty) {
      await sbSaveProfile(profile).catch(() => {})
      await db.users.update(userId, { dirty: 0 }).catch(() => {})
    }
    _lastSyncTime = new Date().toISOString()
  } catch (e) {
    console.warn('[supabase] flush error:', e.message)
  } finally {
    _isSyncing = false
  }
}

/** Convenience export — called by ReminderSettings after add/delete */
export async function saveRemindersToCloud(userId) {
  await flushDirtyToSupabase(userId).catch(() => {})
}

// ─── Supabase restore / full push ────────────────────────────────────────────

export async function restoreFromSupabase(userId) {
  try {
    const { sbFetchAllUserData } = await import('./supabase.js')
    const rows = await sbFetchAllUserData(userId)
    if (!rows.length) return 0
    let total = 0
    for (const row of rows) {
      if (!Array.isArray(row.data) || !row.data.length) continue
      if (row.table_name === 'foods') {
        await db.foods.bulkPut(row.data).catch(() => {})
        total += row.data.length
      } else {
        total += await _safeBulkRestore(row.table_name, row.data)
      }
    }
    console.log('[supabase] restored', total, 'records for', userId)
    return total
  } catch (e) {
    console.warn('[supabase] restore error:', e.message)
    return 0
  }
}

async function _safeBulkRestore(tableName, records) {
  if (!db[tableName]) return 0
  const cleaned = records.map(r => ({ ...r, dirty: 0 }))
  const ids      = cleaned.map(r => r.id).filter(Boolean)
  const existing = ids.length ? await db[tableName].bulkGet(ids).catch(() => []) : []
  const existingMap = new Map()
  existing.forEach((rec, i) => { if (rec) existingMap.set(ids[i], rec) })

  const toAdd = [], toUpdate = []
  for (const rec of cleaned) {
    const local = existingMap.get(rec.id)
    if (!local) toAdd.push(rec)
    else if (rec.updatedAt && local.updatedAt && rec.updatedAt > local.updatedAt) toUpdate.push(rec)
  }
  if (toAdd.length)    await db[tableName].bulkAdd(toAdd).catch(() => {})
  if (toUpdate.length) await db[tableName].bulkPut(toUpdate).catch(() => {})
  return toAdd.length + toUpdate.length
}

export async function pushAllLocalDataToSupabase(userId) {
  try {
    const { sbPushUserData } = await import('./supabase.js')

    const MONTHLY = [
      'foodLogs', 'workoutLogs', 'workoutSets', 'weightLog',
      'supplementLog', 'stepsLog', 'measurements', 'bloodWork', 'moodLog',
    ]
    for (const table of MONTHLY) {
      if (!db[table]) continue
      const records = await db[table].where('userId').equals(userId).toArray().catch(() => [])
      if (!records.length) continue
      const byMonth = {}
      for (const r of records) {
        const month = (r.date || r.updatedAt || '').slice(0, 7)
        if (!month) continue
        ;(byMonth[month] = byMonth[month] || []).push(r)
      }
      for (const [month, data] of Object.entries(byMonth)) {
        await sbPushUserData(userId, table, month, data).catch(() => {})
      }
    }

    const SINGLE = ['programmes', 'mealTemplates', 'reminders']
    for (const table of SINGLE) {
      if (!db[table]) continue
      const records = await db[table].where('userId').equals(userId).toArray().catch(() => [])
      if (records.length) await sbPushUserData(userId, table, 'all', records).catch(() => {})
    }

    const foods = await db.foods
      .where('source').anyOf(['saved', 'scanned', 'recipe'])
      .toArray().catch(() => [])
    if (foods.length) await sbPushUserData(userId, 'foods', 'all', foods).catch(() => {})

    // Personal batches (solo users)
    const allBatches = await db.batches.where('userId').equals(userId).toArray().catch(() => [])
    if (allBatches.length) await sbPushUserData(userId, 'batches', 'all', allBatches).catch(() => {})

    console.log('[supabase] full push complete for', userId)
  } catch (e) {
    console.warn('[supabase] pushAllLocalData error:', e.message)
  }
}

// ─── Food log helpers ─────────────────────────────────────────────────────────

export async function getFoodLogForDate(userId, date) {
  return db.foodLogs.where('[userId+date]').equals([userId, date]).toArray()
}

export async function addFoodLogEntry(userId, entry) {
  return db.foodLogs.add({
    ...entry,
    userId,
    dirty:     1,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteFoodLogEntry(id) {
  await db.foodLogs.delete(id)
}

export async function updateFoodLogEntry(id, changes) {
  await db.foodLogs.update(id, { ...changes, dirty: 1, updatedAt: new Date().toISOString() })
}

// ─── Weight log helpers ───────────────────────────────────────────────────────

export async function getWeightLog(userId, days = 30) {
  const start = new Date()
  start.setDate(start.getDate() - days)
  const startDate = localDate(start)
  const today     = localDate()
  return db.weightLog
    .where('[userId+date]')
    .between([userId, startDate], [userId, today], true, true)
    .toArray()
}

export async function addWeightEntry(userId, date, weightKg, note = '') {
  return db.weightLog.put({
    userId, date, weightKg, note,
    dirty:     1,
    updatedAt: new Date().toISOString(),
  })
}

// ─── Macro summary ────────────────────────────────────────────────────────────

export async function getDayMacros(userId, date) {
  const entries = await getFoodLogForDate(userId, date)
  const totals  = Object.fromEntries(MACRO_KEYS.map(k => [k, 0]))
  for (const entry of entries) {
    for (const key of MACRO_KEYS) totals[key] += entry[key] || 0
  }
  return totals
}

// ─── User profile helpers ─────────────────────────────────────────────────────

export async function getUser(userId) {
  return db.users.get(userId)
}

export async function saveUser(user) {
  const updated = { ...user, dirty: 1, updatedAt: new Date().toISOString() }
  await db.users.put(updated)
  import('./supabase.js').then(({ sbSaveProfile }) => sbSaveProfile(updated)).catch(() => {})
}

export async function getAllUsers() {
  return db.users.toArray()
}

// ─── Measurements helpers ─────────────────────────────────────────────────────

export async function getMeasurements(userId) {
  return db.measurements.where('userId').equals(userId).sortBy('date')
}

export async function saveMeasurement(userId, entry) {
  const existing = await db.measurements.where('[userId+date]').equals([userId, entry.date]).first()
  if (existing) {
    await db.measurements.update(existing.id, { ...entry, dirty: 1, updatedAt: new Date().toISOString() })
    return existing.id
  }
  return db.measurements.add({ userId, ...entry, dirty: 1, updatedAt: new Date().toISOString() })
}
