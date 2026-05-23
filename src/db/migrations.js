import { db } from './indexedDB.js'

const MIGRATIONS = [
  {
    version: 1,
    description: 'Initial schema — food seed deferred to Phase 2',
    run: async (db) => {
      console.log('Migration 1: food database will be seeded in Phase 2')
    },
  },
]

const META_KEY = '__migrations__'

async function getLastMigrationVersion() {
  try {
    const row = await db.syncState.get(META_KEY)
    return row?.lastSyncAt ? parseInt(row.lastSyncAt, 10) : 0
  } catch {
    return 0
  }
}

async function setLastMigrationVersion(version) {
  await db.syncState.put({
    key:        META_KEY,
    userId:     '__system__',
    fileId:     null,
    lastSyncAt: String(version),
  })
}

export async function runMigrations() {
  const lastRun = await getLastMigrationVersion()
  const pending = MIGRATIONS.filter(m => m.version > lastRun)
  if (!pending.length) return

  for (const migration of pending) {
    try {
      console.log(`Migration ${migration.version}: ${migration.description}`)
      await migration.run(db)
      await setLastMigrationVersion(migration.version)
    } catch (e) {
      throw new Error(`Migration ${migration.version} failed: ${e.message}`)
    }
  }
}