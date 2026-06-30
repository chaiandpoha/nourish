import { db } from '../db/indexedDB.js'

/**
 * Merges a list of remote batches (from Supabase) into local IndexedDB.
 *
 * Rules (in priority order):
 * 1. New remote batch not in local → add it.
 * 2. Local is equal/newer → skip (trust local).
 * 3. Local has ingredients, remote doesn't → skip (Supabase payload is lossy).
 * 4. Local is CLOSED, remote is OPEN → skip (guard against race where fetch
 *    returned closed:false before sbCloseBatch finished writing to Supabase).
 * 5. Otherwise remote is newer → apply it (handles edits and closes from other members).
 *
 * Preserves local closedAt when remote lacks one so the timestamp is stable.
 */
export async function applyRemoteBatches(remote) {
  if (!remote?.length) return

  const localRecords = await db.batches.bulkGet(remote.map(b => b.id))
  const toSave = []

  for (let i = 0; i < remote.length; i++) {
    const r     = remote[i]
    const local = localRecords[i]

    if (!local) {
      toSave.push({ ...r, closedAt: r.closed ? (r.closedAt || r.updatedAt) : undefined })
      continue
    }

    if (local.updatedAt && r.updatedAt && r.updatedAt <= local.updatedAt) continue

    const localHasIng  = Array.isArray(local.ingredients) && local.ingredients.length > 0
    const remoteHasIng = Array.isArray(r.ingredients)     && r.ingredients.length > 0
    if (localHasIng && !remoteHasIng) continue

    if (local.closed && !r.closed) continue

    toSave.push({ ...r, closedAt: r.closed ? (r.closedAt || local.closedAt || r.updatedAt) : undefined })
  }

  if (toSave.length) await db.batches.bulkPut(toSave)
}
