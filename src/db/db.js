// Storage adapter — single interface over IndexedDB + Google Drive
// All features import from here — never import driveApi or indexedDB directly

import { db, markDirty, getDirtyRecords, clearDirty } from './indexedDB.js'
import { localDate } from '../log/DayLog.jsx'
import {
  isTokenValid,
  readFile,
  writeFile,
  findFile,
  listFiles,
  ensureFolderStructure,
  searchFilesByPrefix,
  getUserEmail as getDriveEmail,
  checkQuota,
} from './driveApi.js'
import { DRIVE, MACRO_KEYS } from '../config.js'
import { shouldBackup, markBackupDone } from './syncManager.js'

// ─── Sync state ───────────────────────────────────────────────────────────────
let _syncInterval          = null
let _isSyncing             = false
let _folderIds             = {}   // cached folder IDs per user
let _tokenExpiredNotified  = false

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Called after successful login.
 * Builds Drive folder structure, loads shared data, starts sync interval.
 */
export async function initStorage(userId, encryptionKey, userEmail, householdId) {
  try {
    // Build / verify folder structure in admin's Drive (keyed by email)
    _folderIds = await ensureFolderStructure(userEmail || userId)
  } catch (e) {
    console.error('Failed to create Drive folders:', e)
    return { quotaWarning: false, error: e.message }
  }

  // Check Drive quota — warn if low
  try {
    const quota = await checkQuota()
    const availableMB = quota.available / 1024 / 1024
    if (availableMB < DRIVE.quotaWarningMB) {
      console.warn(`Drive storage low: ${availableMB.toFixed(0)}MB remaining`)
    }
  } catch (e) {
    console.warn('Could not check Drive quota:', e)
  }

  // Sync household foods and batches with Supabase
  if (householdId) {
    const { fetchHouseholdFoods, pushLocalFoodsToHousehold, pushLocalBatchesToHousehold } = await import('../food/FoodDB.js')
    await fetchHouseholdFoods(householdId).catch(e => console.warn('Household foods fetch error:', e))
    await pushLocalFoodsToHousehold(householdId).catch(e => console.warn('Household foods push error:', e))
    await pushLocalBatchesToHousehold(householdId, userEmail).catch(e => console.warn('Household batches push error:', e))
  }

  // Check if this is a new device — restore from Drive if so
  try {
    const localCount = await db.foodLogs.where('userId').equals(userId).count()
    if (localCount === 0) {
      await restoreFromDrive(userId, encryptionKey, _folderIds, userEmail)
    }
  } catch (e) {
    console.warn('Restore check failed:', e)
  }

  // Immediately flush any dirty records (including new profile)
  try {
    await flushDirtyRecords(userId, encryptionKey)
  } catch (e) {
    console.warn('Initial flush failed:', e)
  }

  // Start background sync — flush dirty records every 30s
  startSyncInterval(userId, encryptionKey)

  // Daily backup check
  setTimeout(() => runDailyBackup(userId, encryptionKey), 5000)

  // Flush on visibility change (app backgrounded)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushDirtyRecords(userId, encryptionKey)
      runDailyBackup(userId, encryptionKey)
    }
  })

  return { quotaWarning: false }
}

/** Full daily backup to Drive */
export async function runDailyBackup(userId, encryptionKey) {
  if (!isTokenValid()) return
  if (!await shouldBackup()) return

  try {
    await flushDirtyRecords(userId, encryptionKey)
    // Mark all records as dirty to force full backup
    const tables = ['foodLogs','workoutLogs','workoutSets','weightLog','supplementLog','stepsLog','measurements','programmes','reminders','mealTemplates']
    for (const table of tables) {
      const records = await db[table].where('userId').equals(userId).toArray()
      if (records.length === 0) continue
      await db[table].bulkUpdate(records.map(r => ({ key: r.id || r.date, changes: { dirty: 1 } })))
    }
    await flushDirtyRecords(userId, encryptionKey)
    markBackupDone()
  } catch (e) {
    console.error('Daily backup failed:', e)
  }
}

/** Restore all user data from Drive to IndexedDB.
 *  Uses a Drive-wide file search so folder naming mismatches don't block recovery. */
export async function restoreFromDrive(userId, encryptionKey, folderIds, userEmailOrId) {
  if (!isTokenValid()) return false

  // --- Strategy 1: folder-tree walk ---
  // Try profile email first, then the Drive OAuth account email (they may differ).
  let totalRestored = 0
  const driveEmail  = getDriveEmail()
  const emailsToTry = [...new Set([userEmailOrId, driveEmail, userId].filter(Boolean))]

  for (const key of emailsToTry) {
    let fIds = null
    try {
      fIds = folderIds || await ensureFolderStructure(key)
      console.log('[restore] trying key:', key, 'userDir:', fIds?.userDir)
    } catch (e) {
      console.warn('[restore] folder lookup failed for', key, e)
      continue
    }
    if (!fIds?.userDir) continue

    try {
      const profileFile = await findFile('profile.json', fIds.userDir)
      if (profileFile) {
        const raw = await readFile(profileFile.id)
        if (raw) await db.users.put({ ...(typeof raw === 'string' ? JSON.parse(raw) : raw), dirty: 0 })
      }
    } catch (e) { console.warn('Profile restore error:', e) }

    totalRestored += await _restoreMonthlyTable('foodLogs',     fIds.foodLogsDir,    userId)
    totalRestored += await _restoreMonthlyTable('workoutLogs',  fIds.workoutLogsDir, userId)
    totalRestored += await _restoreMonthlyTable('workoutSets',  fIds.workoutLogsDir, userId)
    totalRestored += await _restoreMonthlyTable('weightLog',    fIds.userDir,        userId)
    totalRestored += await _restoreMonthlyTable('supplementLog',fIds.userDir,        userId)
    totalRestored += await _restoreMonthlyTable('stepsLog',     fIds.userDir,        userId)
    totalRestored += await _restoreMonthlyTable('measurements', fIds.userDir,        userId)
    totalRestored += await _restoreSingleTable('programmes',    fIds.userDir,        userId)
    totalRestored += await _restoreSingleTable('mealTemplates', fIds.userDir,        userId)
    totalRestored += await _restoreSingleTable('reminders',     fIds.userDir,        userId)

    if (totalRestored > 0) break // found data — stop trying other emails
  }

  if (totalRestored > 0) return totalRestored

  // --- Strategy 2: Drive-wide search (fallback when folder path is wrong) ---
  // Searches for all Nourish data files regardless of which folder they live in.
  console.log('[restore] folder walk found nothing — falling back to Drive-wide search')
  const PREFIXES = ['foodLogs_','workoutLogs_','workoutSets_','weightLog_','supplementLog_','stepsLog_','measurements_']
  for (const prefix of PREFIXES) {
    try {
      const files = await searchFilesByPrefix(prefix)
      console.log(`[restore] search "${prefix}": ${files.length} files`)
      for (const file of files) {
        const raw  = await readFile(file.id)
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (!Array.isArray(data) || !data.length) continue
        const table = prefix.slice(0, -1) // strip trailing '_'
        totalRestored += await _safeBulkRestore(table, data)
      }
    } catch (e) {
      console.warn(`[restore] search ${prefix} error:`, e)
    }
  }

  return totalRestored
}

async function _restoreMonthlyTable(tableName, folderId, userId) {
  if (!folderId) return 0
  let count = 0
  try {
    const files   = await listFiles(folderId)
    console.log(`[restore] ${tableName} folder ${folderId}: ${files.length} files —`, files.map(f => f.name).join(', ') || '(empty)')
    const matches = files.filter(f =>
      f.name.startsWith(`${tableName}_`) && f.name.endsWith('.json')
    )
    for (const file of matches) {
      const raw  = await readFile(file.id)
      // writeFile double-stringifies, so readFile returns a string — parse it
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (!Array.isArray(data) || !data.length) continue
      count += await _safeBulkRestore(tableName, data)
      const month   = file.name.slice(tableName.length + 1, -5)
      const syncKey = `${userId}:${tableName}:${month}`
      await db.syncState.put({ key: syncKey, userId, fileId: file.id, lastSyncAt: new Date().toISOString() })
    }
  } catch (e) {
    console.warn(`Restore ${tableName} error:`, e)
  }
  return count
}

async function _restoreSingleTable(tableName, folderId, userId) {
  if (!folderId) return 0
  try {
    const file = await findFile(`${tableName}.json`, folderId)
    if (!file) return 0
    const raw  = await readFile(file.id)
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(data) || !data.length) return 0
    const count = await _safeBulkRestore(tableName, data)
    const syncKey = `${userId}:${tableName}`
    await db.syncState.put({ key: syncKey, userId, fileId: file.id, lastSyncAt: new Date().toISOString() })
    return count
  } catch (e) {
    console.warn(`Restore ${tableName} error:`, e)
    return 0
  }
}

// Restore records from Drive without overwriting newer local data.
// Strategy: add records that don't exist locally; for records that exist,
// only overwrite if the Drive version is strictly newer (by updatedAt).
async function _safeBulkRestore(tableName, records) {
  const cleaned = records.map(r => ({ ...r, dirty: 0 }))
  const ids     = cleaned.map(r => r.id).filter(Boolean)
  const existing = ids.length ? await db[tableName].bulkGet(ids) : []
  const existingMap = new Map()
  existing.forEach((rec, i) => { if (rec) existingMap.set(ids[i], rec) })

  const toAdd    = []
  const toUpdate = []
  for (const rec of cleaned) {
    const local = existingMap.get(rec.id)
    if (!local) {
      toAdd.push(rec)
    } else if (rec.updatedAt && local.updatedAt && rec.updatedAt > local.updatedAt) {
      toUpdate.push(rec)
    }
  }
  if (toAdd.length)    await db[tableName].bulkAdd(toAdd).catch(() => {})
  if (toUpdate.length) await db[tableName].bulkPut(toUpdate)
  return toAdd.length + toUpdate.length
}

/** Stop sync interval — called on logout */
export function teardownStorage() {
  if (_syncInterval) {
    clearInterval(_syncInterval)
    _syncInterval = null
  }
  _folderIds = {}
}

// ─── Sync interval ────────────────────────────────────────────────────────────

function startSyncInterval(userId, encryptionKey) {
  if (_syncInterval) clearInterval(_syncInterval)
  _syncInterval = setInterval(
    () => flushDirtyRecords(userId, encryptionKey),
    DRIVE.syncIntervalSeconds * 1000
  )
}

// ─── Flush dirty records to Drive ─────────────────────────────────────────────

/**
 * Finds all dirty records across personal tables,
 * groups them into monthly files, encrypts, writes to Drive.
 * Never throws — logs errors silently and retries next interval.
 */
export async function flushDirtyRecords(userId, encryptionKey) {
  if (_isSyncing) return
  if (!isTokenValid()) {
    if (!_tokenExpiredNotified) {
      _tokenExpiredNotified = true
      window.dispatchEvent(new CustomEvent('nourish:drive-token-expired'))
    }
    return
  }
  _tokenExpiredNotified = false // token is valid — reset so next expiry fires again
  _isSyncing = true

  try {
    await flushMonthlyTable('foodLogs',     userId, encryptionKey, _folderIds.foodLogsDir)
    await flushMonthlyTable('workoutLogs',  userId, encryptionKey, _folderIds.workoutLogsDir)
    await flushMonthlyTable('workoutSets',  userId, encryptionKey, _folderIds.workoutLogsDir)
    await flushMonthlyTable('weightLog',    userId, encryptionKey, _folderIds.userDir)
    await flushMonthlyTable('supplementLog',userId, encryptionKey, _folderIds.userDir)
    await flushMonthlyTable('stepsLog',     userId, encryptionKey, _folderIds.userDir)
    await flushMonthlyTable('measurements', userId, encryptionKey, _folderIds.userDir)
    await flushReminders(userId)
    await flushProgrammes(userId, encryptionKey)
    await flushProfile(userId, encryptionKey)
  } catch (e) {
    console.error('Sync flush error:', e)
  } finally {
    _isSyncing = false
  }
}

async function flushMonthlyTable(table, userId, encryptionKey, folderId) {
  if (!folderId) return

  // Get all dirty records for this user
  const dirty = await getDirtyRecords(table, userId)
  if (!dirty.length) return

  // Group by month (YYYY-MM)
  const byMonth = {}
  for (const record of dirty) {
    const month = (record.date || record.updatedAt || '').slice(0, 7)
    if (!month) continue
    if (!byMonth[month]) byMonth[month] = []
    byMonth[month].push(record)
  }

  for (const [month, records] of Object.entries(byMonth)) {
    const filename = `${table}_${month}.json`

    // Load existing file from Drive (may have records from other devices)
    const existing = await loadMonthFile(table, userId, month, encryptionKey, folderId)

    // Merge: existing records + dirty updates (dirty wins on conflict)
    const merged = mergeRecords(existing, records)

    // Encrypt and write
    const encrypted = JSON.stringify(merged)
    const syncKey   = `${userId}:${table}:${month}`
    const stateRow  = await db.syncState.get(syncKey)

    const fileId = await writeFile(filename, encrypted, folderId, stateRow?.fileId)

    // Save fileId to syncState
    await db.syncState.put({ key: syncKey, userId, fileId, lastSyncAt: new Date().toISOString() })

    // Clear dirty flags
    const ids = records.map(r => r.id)
    await clearDirty(table, ids)
  }
}

async function loadMonthFile(table, userId, month, encryptionKey, folderId) {
  try {
    const syncKey = `${userId}:${table}:${month}`
    const state   = await db.syncState.get(syncKey)
    if (!state?.fileId) return []

    const encrypted = await readFile(state.fileId)
    const json      = typeof encrypted === "string" ? encrypted : JSON.stringify(encrypted)
    return JSON.parse(json)
  } catch {
    return []
  }
}

function mergeRecords(existing, incoming) {
  const map = new Map()
  for (const r of existing) map.set(r.id, r)
  for (const r of incoming)  map.set(r.id, r)  // incoming wins
  return Array.from(map.values())
}

async function flushReminders(userId) {
  const dirty = await db.reminders.where('userId').equals(userId).and(r => r.dirty === 1).toArray()
  if (!dirty.length) return

  const all      = await db.reminders.where('userId').equals(userId).toArray()
  const syncKey  = `${userId}:reminders`
  const stateRow = await db.syncState.get(syncKey)
  const fileId   = await writeFile('reminders.json', all, _folderIds.userDir, stateRow?.fileId)

  await db.syncState.put({ key: syncKey, userId, fileId, lastSyncAt: new Date().toISOString() })
  await clearDirty('reminders', dirty.map(r => r.id))
}

/** Immediately write all reminders to Drive — called after add/delete */
export async function saveRemindersToCloud(userId) {
  if (!isTokenValid() || !_folderIds.userDir) return
  try {
    const all      = await db.reminders.where('userId').equals(userId).toArray()
    const syncKey  = `${userId}:reminders`
    const stateRow = await db.syncState.get(syncKey)
    const fileId   = await writeFile('reminders.json', all, _folderIds.userDir, stateRow?.fileId)
    await db.syncState.put({ key: syncKey, userId, fileId, lastSyncAt: new Date().toISOString() })
  } catch (e) {
    console.warn('Reminder sync error:', e)
  }
}

async function flushProgrammes(userId, encryptionKey) {
  const dirty = await db.programmes.where('userId').equals(userId).and(r => r.dirty === 1).toArray()
  if (!dirty.length) return

  const filename  = 'programmes.json'
  const folderId  = _folderIds.userDir
  const syncKey   = `${userId}:programmes`
  const stateRow  = await db.syncState.get(syncKey)

  const all       = await db.programmes.where('userId').equals(userId).toArray()
  const encrypted = JSON.stringify(all)
  const fileId    = await writeFile(filename, encrypted, folderId, stateRow?.fileId)

  await db.syncState.put({ key: syncKey, userId, fileId, lastSyncAt: new Date().toISOString() })
  await clearDirty('programmes', dirty.map(r => r.id))
}

async function flushProfile(userId, encryptionKey) {
  const user = await db.users.get(userId)
  if (!user?.dirty) return

  const filename  = 'profile.json'
  const folderId  = _folderIds.userDir
  const syncKey   = `${userId}:profile`
  const stateRow  = await db.syncState.get(syncKey)

  const encrypted = JSON.stringify(user)
  const fileId    = await writeFile(filename, encrypted, folderId, stateRow?.fileId)

  await db.syncState.put({ key: syncKey, userId, fileId, lastSyncAt: new Date().toISOString() })
  await db.users.update(userId, { dirty: 0 })
}

// ─── Food log helpers ─────────────────────────────────────────────────────────

export async function getFoodLogForDate(userId, date) {
  return db.foodLogs.where('[userId+date]').equals([userId, date]).toArray()
}

export async function addFoodLogEntry(userId, entry) {
  const id = await db.foodLogs.add({
    ...entry,
    userId,
    dirty: 1,
    updatedAt: new Date().toISOString(),
  })
  return id
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
    dirty: 1,
    updatedAt: new Date().toISOString(),
  })
}

// ─── Macro summary ────────────────────────────────────────────────────────────

/** Sum macros for a user on a given date */
export async function getDayMacros(userId, date) {
  const entries = await getFoodLogForDate(userId, date)
  const totals  = Object.fromEntries(MACRO_KEYS.map(k => [k, 0]))
  for (const entry of entries) {
    for (const key of MACRO_KEYS) {
      totals[key] += entry[key] || 0
    }
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
  import('../db/supabase.js').then(({ sbSaveProfile }) => sbSaveProfile(updated)).catch(() => {})
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