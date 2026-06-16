import Dexie from 'dexie'
import { DB_NAME, DB_VERSION } from '../config.js'

// ─── Schema ──────────────────────────────────────────────────────────────────
// Dexie syntax: '++id' = auto-increment PK, '&field' = unique index,
// 'field' = indexed, '[a+b]' = compound index, '*field' = multi-entry index

export const db = new Dexie(DB_NAME)

// Allow other tabs to upgrade without getting blocked
db.on('versionchange', () => { db.close() })

db.version(DB_VERSION).stores({

  // ── Users ────────────────────────────────────────────────────────────────
  // One row per profile on this device
  users: [
    '&id',           // userId — UUID, primary key, unique
    'name',
    'driveFileId',   // legacy — kept for migration history only
    'createdAt',
  ].join(', '),

  // ── Food items (shared household) ────────────────────────────────────────
  foods: [
    '&id',
    'name',
    '*tags',         // multi-entry — searchable by tag
    'source',        // 'usda' | 'nin' | 'saved' | 'scanned'
    'barcode',
    'updatedAt',
  ].join(', '),

  // ── Batches ───────────────────────────────────────────────────────────────
  batches: [
    '&id',
    'name',
    'createdBy',     // userId
    'shared',        // 0 | 1 — Dexie indexes booleans as 0/1
    'closed',
    'createdAt',
  ].join(', '),

  // ── Food logs (per user, monthly) ────────────────────────────────────────
  foodLogs: [
    '++id',
    'userId',
    'date',          // YYYY-MM-DD
    'meal',          // breakfast | lunch | dinner | snack
    '[userId+date]', // compound — fast daily fetch per user
    'dirty',         // 0 | 1 — needs sync to Drive
    'updatedAt',
  ].join(', '),

  // ── Workout logs ─────────────────────────────────────────────────────────
  workoutLogs: [
    '++id',
    'userId',
    'date',
    '[userId+date]',
    'dirty',
    'updatedAt',
  ].join(', '),

  // ── Workout sets ─────────────────────────────────────────────────────────
  workoutSets: [
    '++id',
    'userId',
    'workoutLogId',
    'exerciseId',
    '[userId+workoutLogId]',
    'dirty',
    'updatedAt',
  ].join(', '),

  // ── Programmes ───────────────────────────────────────────────────────────
  programmes: [
    '&id',
    'userId',
    'active',        // 0 | 1
    'dirty',
    'updatedAt',
  ].join(', '),

  // ── Weight log ───────────────────────────────────────────────────────────
  weightLog: [
    '++id',
    'userId',
    'date',
    '[userId+date]',
    'dirty',
    'updatedAt',
  ].join(', '),

  // ── Blood work ───────────────────────────────────────────────────────────
  bloodWork: [
    '++id',
    'userId',
    'date',
    'marker',
    '[userId+marker]',
    'dirty',
    'updatedAt',
  ].join(', '),

  // ── Supplement log ───────────────────────────────────────────────────────
  supplementLog: [
    '++id',
    'userId',
    'date',
    '[userId+date]',
    'dirty',
    'updatedAt',
  ].join(', '),

  // ── Mood + energy log ────────────────────────────────────────────────────
  moodLog: [
    '++id',
    'userId',
    'date',
    '[userId+date]',
    'dirty',
    'updatedAt',
  ].join(', '),

  // ── Progress photos metadata ─────────────────────────────────────────────
  // Image stored as dataUrl in IndexedDB; driveFileId is a legacy unused field
  progressPhotos: [
    '++id',
    'userId',
    'weekStart',     // YYYY-MM-DD of Monday that week
    'driveFileId',
    'dirty',
    'uploadedAt',
  ].join(', '),

  // ── Meal templates ───────────────────────────────────────────────────────
  mealTemplates: [
    '&id',
    'userId',
    'name',
    'dirty',
    'updatedAt',
  ].join(', '),

  // ── Sync state ───────────────────────────────────────────────────────────
  // Legacy table — kept in schema to avoid migration errors; no longer written
  syncState: [
    '&key',          // e.g. 'userId:foodLogs:2025-06' — unique composite key
    'userId',
    'fileId',
    'lastSyncAt',
  ].join(', '),

  // ── Reminders ────────────────────────────────────────────────────────────
  reminders: [
    '&id',
    'userId',
    'label',
    'dirty',
    'updatedAt',
  ].join(', '),

})

// Version 2 — body measurements + water log
db.version(2).stores({
  measurements: '++id, userId, date, [userId+date], dirty, updatedAt',
  waterLog:     '++id, userId, date, [userId+date], dirty, updatedAt',
})

// Version 3 — email index on users for Google Sign-In lookup
db.version(3).stores({
  users: '&id, name, email, driveFileId, createdAt',
})

// Version 4 — householdId index on users
db.version(4).stores({
  users: '&id, name, email, driveFileId, householdId, createdAt',
})

// Version 5 — daily activity log (steps + calories burned from iPhone Health)
db.version(5).stores({
  stepsLog: '++id, userId, date, [userId+date], dirty, updatedAt',
})

// Version 6 — stable UUID primary keys for workoutLogs and workoutSets.
// Changing ++id → &id forces IndexedDB to drop and recreate both stores,
// so old integer-keyed records are gone; no upgrade function needed.
db.version(6).stores({
  workoutLogs: '&id, userId, date, [userId+date], status, dirty, updatedAt',
  workoutSets: '&id, userId, workoutLogId, exerciseId, [userId+workoutLogId], dirty, updatedAt',
})

// Version 7 — no schema change; unblocks any device that got stuck on the
// v6 migration before the upgrade function was removed.
db.version(7).stores({})

// Version 8 — no schema change; ensures devices that stalled mid-upgrade
// between v6 and v7 can reach the current version cleanly.
db.version(8).stores({})

// Version 9 — add userId index to batches for personal (solo) cloud backup
db.version(9).stores({
  batches: '&id, name, userId, createdBy, shared, closed, createdAt',
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Mark a record dirty — will be picked up by next Supabase flush */
export async function markDirty(table, id) {
  await db[table].update(id, { dirty: 1, updatedAt: new Date().toISOString() })
}

/** Get all dirty records for a table + user — used by sync flush */
export async function getDirtyRecords(table, userId) {
  return db[table]
    .where('[userId+date]')
    .between([userId, Dexie.minKey], [userId, Dexie.maxKey])
    .and(r => r.dirty === 1)
    .toArray()
    .catch(() =>
      // Fallback for tables without compound index
      db[table].where('userId').equals(userId).and(r => r.dirty === 1).toArray()
    )
}

/** Clear dirty flag after successful Supabase sync */
export async function clearDirty(table, ids) {
  await db[table].bulkUpdate(ids.map(id => ({
    key: id,
    changes: { dirty: 0 }
  })))
}

/** Get records for a user within a date range */
export async function getByDateRange(table, userId, startDate, endDate) {
  return db[table]
    .where('[userId+date]')
    .between([userId, startDate], [userId, endDate], true, true)
    .toArray()
}

/** Wipe all local data for a user — used on profile delete */
export async function wipeUserData(userId) {
  const userTables = [
    'foodLogs', 'workoutLogs', 'workoutSets', 'programmes',
    'weightLog', 'bloodWork', 'supplementLog', 'moodLog',
    'progressPhotos', 'mealTemplates', 'syncState', 'reminders',
    'measurements', 'waterLog', 'stepsLog',
  ]
  await Promise.all(
    userTables.map(t =>
      db[t].where('userId').equals(userId).delete()
    )
  )
}

export default db