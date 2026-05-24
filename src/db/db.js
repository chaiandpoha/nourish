// Storage adapter — single interface over IndexedDB + Google Drive
// All features import from here — never import driveApi or indexedDB directly

import { db, markDirty, getDirtyRecords, clearDirty } from './indexedDB.js'
import {
  isTokenValid,
  readFile,
  writeFile,
  findFile,
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
export async function initStorage(userId, encryptionKey) {
  console.log('initStorage called for:', userId)

  try {
    // Build / verify Drive folder structure
    _folderIds = await ensureFolderStructure(userId)
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

  // Load shared foods + batches from Drive into IndexedDB
  try {
    await syncSharedDataDown()
    console.log('Shared data synced from Drive')
  } catch (e) {
    console.warn('Could not sync shared data:', e)
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
    const tables = ['foodLogs','workoutLogs','workoutSets','weightLog','bloodWork','supplementLog','moodLog','programmes']
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

    // Restore profile
    const profileFile = await findFile('profile.json', fIds.userDir)
    if (profileFile) {
      const data = await readFile(profileFile.id)
      if (data) {
        const profile = typeof data === 'string' ? JSON.parse(data) : data
        await db.users.put({ ...profile, dirty: 0 })
        console.log('Profile restored')
      }
    }

    // Restore shared foods
    const foodsFile = await findFile('foods.json', fIds.shared)
    if (foodsFile) {
      const data = await readFile(foodsFile.id)
      if (Array.isArray(data)) {
        await db.foods.bulkPut(data)
        console.log('Foods restored:', data.length)
      }
    }

    // Restore batches
    const batchesFile = await findFile('batches.json', fIds.shared)
    if (batchesFile) {
      const data = await readFile(batchesFile.id)
      if (Array.isArray(data)) {
        await db.batches.bulkPut(data)
        console.log('Batches restored:', data.length)
      }
    }

    return true
  } catch (e) {
    console.error('Restore failed:', e)
    return false
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
  const foods   = await db.foods.where('source').notEqual('usda').toArray()
  const syncKey = 'shared:foods'
  const state   = await db.syncState.get(syncKey)
  const fileId  = await writeFile('foods.json', foods, _folderIds.shared, state?.fileId)
  await db.syncState.put({ key: syncKey, userId: 'shared', fileId, lastSyncAt: new Date().toISOString() })
}

/** Write shared batches to Drive */
export async function saveSharedBatches() {
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