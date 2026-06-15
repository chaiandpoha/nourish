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
  try {
    await db.open()
  } catch (e) {
    // Any db.open() failure (schema conflicts, primary-key changes, corrupt upgrades)
    // is unrecoverable without deleting the DB. Auto-rebuild once per session;
    // the flag prevents an infinite reload loop if the fresh open also fails.
    if (!sessionStorage.getItem('nourish_db_rebuild_attempted')) {
      console.warn('[migrations] DB open failed — auto-rebuilding:', e.message)
      sessionStorage.setItem('nourish_db_rebuild_attempted', '1')
      sessionStorage.setItem('nourish_db_rebuilt', '1')
      try { db.close() } catch {}
      await new Promise(res => {
        const req = indexedDB.deleteDatabase(db.name)
        req.onsuccess = res
        req.onerror   = res
        req.onblocked = res
      })
      window.location.reload()
      return
    }

    throw new Error(`Database failed to open: ${e.message}`)
  }

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
