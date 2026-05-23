import Dexie from 'dexie'
import { DB_NAME, DB_VERSION } from '../config.js'

// ─── Schema ──────────────────────────────────────────────────────────────────
// Dexie syntax: '++id' = auto-increment PK, '&field' = unique index,
// 'field' = indexed, '[a+b]' = compound index, '*field' = multi-entry index

export const db = new Dexie(DB_NAME)

db.version(DB_VERSION).stores({

  // ── Users ────────────────────────────────────────────────────────────────
  // One row per profile on this device
  users: [
    '&id',           // userId — UUID, primary key, unique
    'name',
    'driveFileId',   // Drive file ID for this user's profile JSON
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
  // Actual image stored on Drive — only metadata here
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
  // Tracks Drive file IDs and last sync timestamps per user
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Mark a record dirty — needs sync to Drive */
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

/** Clear dirty flag after successful Drive sync */
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
    'progressPhotos', 'mealTemplates', 'syncState', 'reminders'
  ]
  await Promise.all(
    userTables.map(t =>
      db[t].where('userId').equals(userId).delete()
    )
  )
}

export default db