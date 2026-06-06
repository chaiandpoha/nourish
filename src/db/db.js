// Storage adapter — single interface over IndexedDB + Google Drive
// All features import from here — never import driveApi or indexedDB directly

import { db, markDirty, getDirtyRecords, clearDirty } from './indexedDB.js'
import {
  isTokenValid,
  readFile,
  writeFile,
  findFile,
  listFiles,
  ensureFolderStructure,
  checkQuota,
} from './driveApi.js'
import { DRIVE, MACRO_KEYS } from '../config.js'
import { shouldBackup, markBackupDone } from './syncManager.js'

// ─── Sync state ───────────────────────────────────────────────────────────────
let _syncInterval = null
let _isSyncing    = false
let _folderIds    = {}   // cached folder IDs per user

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Called after successful login.
 * Builds Drive folder structure, loads shared data, starts sync interval.
 */
export async function initStorage(userId, encryptionKey, userEmail, householdId) {
  console.log('initStorage called for:', userEmail || userId)

  try {
    // Build / verify folder structure in admin's Drive (keyed by email)
    _folderIds = await ensureFolderStructure(userEmail || userId)
    console.log('Drive folders ready:', Object.keys(_folderIds))
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

  // Sync household foods with Supabase
  if (householdId) {
    const { fetchHouseholdFoods, pushLocalFoodsToHousehold } = await import('../food/FoodDB.js')
    await fetchHouseholdFoods(householdId).catch(e => console.warn('Household foods fetch error:', e))
    await pushLocalFoodsToHousehold(householdId).catch(e => console.warn('Household foods push error:', e))
  }

  // Check if this is a new device — restore from Drive if so
  try {
    const localCount = await db.foodLogs.where('userId').equals(userId).count()
    if (localCount === 0) {
      console.log('No local data — restoring from Drive')
      await restoreFromDrive(userId, encryptionKey, _folderIds)
    }
  } catch (e) {
    console.warn('Restore check failed:', e)
  }

  // Immediately flush any dirty records (including new profile)
  try {
    await flushDirtyRecords(userId, encryptionKey)
    console.log('Initial flush complete')
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

  console.log('Running daily Drive backup...')
  try {
    await flushDirtyRecords(userId, encryptionKey)
    // Mark all records as dirty to force full backup
    const tables = ['foodLogs','workoutLogs','workoutSets','weightLog','bloodWork','supplementLog','moodLog','programmes','reminders','mealTemplates']
    for (const table of tables) {
      const records = await db[table].where('userId').equals(userId).toArray()
      if (records.length === 0) continue
      await db[table].bulkUpdate(records.map(r => ({ key: r.id || r.date, changes: { dirty: 1 } })))
    }
    await flushDirtyRecords(userId, encryptionKey)
    markBackupDone()
    console.log('Daily backup complete')
  } catch (e) {
    console.error('Daily backup failed:', e)
  }
}

/** Restore all user data from Drive to IndexedDB */
export async function restoreFromDrive(userId, encryptionKey, folderIds) {
  if (!isTokenValid()) return false
  console.log('Restoring from Drive...')

  try {
    const fIds = folderIds || await ensureFolderStructure(userId)

    // Profile
    const profileFile = await findFile('profile.json', fIds.userDir)
    if (profileFile) {
      const data = await readFile(profileFile.id)
      if (data) {
        const profile = typeof data === 'string' ? JSON.parse(data) : data
        await db.users.put({ ...profile, dirty: 0 })
        console.log('Profile restored')
      }
    }

    // Shared foods (preserve tags field for Safari multi-entry index)
    const foodsFile = await findFile('foods.json', fIds.shared)
    if (foodsFile) {
      const data = await readFile(foodsFile.id)
      if (Array.isArray(data)) {
        await db.foods.bulkPut(data.map(f => ({ tags: [], ...f })))
        console.log('Foods restored:', data.length)
      }
    }

    // Shared batches
    const batchesFile = await findFile('batches.json', fIds.shared)
    if (batchesFile) {
      const data = await readFile(batchesFile.id)
      if (Array.isArray(data)) {
        await db.batches.bulkPut(data)
        console.log('Batches restored:', data.length)
      }
    }

    // Monthly tables — food logs
    await _restoreMonthlyTable('foodLogs', fIds.foodLogsDir, userId)

    // Monthly tables — workout data
    await _restoreMonthlyTable('workoutLogs', fIds.workoutLogsDir, userId)
    await _restoreMonthlyTable('workoutSets', fIds.workoutLogsDir, userId)

    // Monthly tables — health data (stored in userDir alongside profile.json)
    await _restoreMonthlyTable('weightLog',    fIds.userDir, userId)
    await _restoreMonthlyTable('bloodWork',    fIds.userDir, userId)
    await _restoreMonthlyTable('supplementLog',fIds.userDir, userId)
    await _restoreMonthlyTable('moodLog',      fIds.userDir, userId)

    // Single-file tables
    await _restoreSingleTable('programmes',   fIds.userDir, userId)
    await _restoreSingleTable('mealTemplates',fIds.userDir, userId)
    await _restoreSingleTable('reminders',    fIds.userDir, userId)

    return true
  } catch (e) {
    console.error('Restore failed:', e)
    return false
  }
}

async function _restoreMonthlyTable(tableName, folderId, userId) {
  if (!folderId) return
  try {
    const files   = await listFiles(folderId)
    const matches = files.filter(f =>
      f.name.startsWith(`${tableName}_`) && f.name.endsWith('.json')
    )
    for (const file of matches) {
      const data = await readFile(file.id)
      if (!Array.isArray(data) || !data.length) continue
      await db[tableName].bulkPut(data.map(r => ({ ...r, dirty: 0 })))
      // Cache fileId so next flush updates rather than creates
      const month   = file.name.slice(tableName.length + 1, -5)
      const syncKey = `${userId}:${tableName}:${month}`
      await db.syncState.put({ key: syncKey, userId, fileId: file.id, lastSyncAt: new Date().toISOString() })
      console.log(`Restored ${data.length} ${tableName} (${month})`)
    }
  } catch (e) {
    console.warn(`Restore ${tableName} error:`, e)
  }
}

async function _restoreSingleTable(tableName, folderId, userId) {
  if (!folderId) return
  try {
    const file = await findFile(`${tableName}.json`, folderId)
    if (!file) return
    const data = await readFile(file.id)
    if (!Array.isArray(data) || !data.length) return
    await db[tableName].bulkPut(data.map(r => ({ ...r, dirty: 0 })))
    const syncKey = `${userId}:${tableName}`
    await db.syncState.put({ key: syncKey, userId, fileId: file.id, lastSyncAt: new Date().toISOString() })
    console.log(`Restored ${data.length} ${tableName}`)
  } catch (e) {
    console.warn(`Restore ${tableName} error:`, e)
  }
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
  if (_isSyncing || !isTokenValid()) return
  _isSyncing = true

  try {
    await flushMonthlyTable('foodLogs',     userId, encryptionKey, _folderIds.foodLogsDir)
    await flushMonthlyTable('workoutLogs',  userId, encryptionKey, _folderIds.workoutLogsDir)
    await flushMonthlyTable('workoutSets',  userId, encryptionKey, _folderIds.workoutLogsDir)
    await flushMonthlyTable('weightLog',    userId, encryptionKey, _folderIds.userDir)
    await flushMonthlyTable('bloodWork',    userId, encryptionKey, _folderIds.userDir)
    await flushMonthlyTable('supplementLog',userId, encryptionKey, _folderIds.userDir)
    await flushMonthlyTable('moodLog',      userId, encryptionKey, _folderIds.userDir)
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

// ─── Shared data (foods + batches) ───────────────────────────────────────────

/** Pull shared foods + batches from Drive into local IndexedDB */
export async function syncSharedDataDown() {
  if (!isTokenValid() || !_folderIds.shared) return

  try {
    const foodsFile = await findFile('foods.json', _folderIds.shared)
    if (foodsFile) {
      const data = await readFile(foodsFile.id)
      if (Array.isArray(data)) {
        await db.foods.bulkPut(data)
      }
    }

    const batchesFile = await findFile('batches.json', _folderIds.shared)
    if (batchesFile) {
      const data = await readFile(batchesFile.id)
      if (Array.isArray(data)) {
        await db.batches.bulkPut(data)
      }
    }
  } catch (e) {
    console.warn('syncSharedDataDown error:', e)
  }
}

/** Write shared foods to Drive */
export async function saveSharedFoods() {
  if (!isTokenValid() || !_folderIds.shared) return
  const foods   = await db.foods.where('source').notEqual('usda').toArray()
  const syncKey = 'shared:foods'
  const state   = await db.syncState.get(syncKey)
  const fileId  = await writeFile('foods.json', foods, _folderIds.shared, state?.fileId)
  await db.syncState.put({ key: syncKey, userId: 'shared', fileId, lastSyncAt: new Date().toISOString() })
}

/** Write shared batches to Drive */
export async function saveSharedBatches() {
  if (!isTokenValid() || !_folderIds.shared) return
  const batches = await db.batches.toArray()
  const syncKey = 'shared:batches'
  const state   = await db.syncState.get(syncKey)
  const fileId  = await writeFile('batches.json', batches, _folderIds.shared, state?.fileId)
  await db.syncState.put({ key: syncKey, userId: 'shared', fileId, lastSyncAt: new Date().toISOString() })
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
  const startDate = start.toISOString().slice(0, 10)
  const today     = new Date().toISOString().slice(0, 10)
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
  await db.users.put({ ...user, dirty: 1, updatedAt: new Date().toISOString() })
}

export async function getAllUsers() {
  return db.users.toArray()
}

// ─── Water log helpers ────────────────────────────────────────────────────────

export async function getWaterLog(userId, date) {
  return db.waterLog.where('[userId+date]').equals([userId, date]).first()
}

export async function logWater(userId, date, amountMl) {
  const existing = await db.waterLog.where('[userId+date]').equals([userId, date]).first()
  if (existing) {
    await db.waterLog.update(existing.id, { amountMl, dirty: 1, updatedAt: new Date().toISOString() })
    return existing.id
  }
  return db.waterLog.add({ userId, date, amountMl, dirty: 1, updatedAt: new Date().toISOString() })
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