import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db/indexedDB.js'
import { applyRemoteBatches } from '../batchSync.js'

const T0 = '2024-06-15T09:59:00.000Z'  // old timestamp
const T1 = '2024-06-15T10:00:00.000Z'  // local close time
const T2 = '2024-06-15T10:00:01.000Z'  // slightly after T1 (race window)

function batch(overrides) {
  return {
    id: 'batch-1',
    name: 'Dinner Prep',
    closed: 0,
    closedAt: undefined,
    updatedAt: T0,
    ingredients: [{ name: 'Rice', grams: 200 }],
    householdId: 'hh1',
    shared: 1,
    dirty: 0,
    ...overrides,
  }
}

beforeEach(async () => {
  await db.batches.clear()
})

// ─── The core race condition ───────────────────────────────────────────────────

describe('applyRemoteBatches — race condition guard', () => {

  it('never re-opens a locally-closed batch when remote returns stale closed:false', async () => {
    // Local: user just closed the batch (closed:1, updatedAt:T1)
    await db.batches.put(batch({ closed: 1, closedAt: T1, updatedAt: T1 }))

    // Remote: sbFetchBatches ran BEFORE sbCloseBatch finished → still sees closed:false
    // Remote updatedAt = T2 > T1, so the normal "trust newer" rule would overwrite
    await applyRemoteBatches([batch({ closed: 0, updatedAt: T2 })])

    const local = await db.batches.get('batch-1')
    expect(local.closed).toBe(1)
  })

  it('preserves the original closedAt and does not reset it to "now"', async () => {
    await db.batches.put(batch({ closed: 1, closedAt: T1, updatedAt: T1 }))
    await applyRemoteBatches([batch({ closed: 0, updatedAt: T2 })])

    const local = await db.batches.get('batch-1')
    expect(local.closedAt).toBe(T1)
  })
})

// ─── Legitimate operations must still work ────────────────────────────────────

describe('applyRemoteBatches — normal sync still works', () => {

  it('adds a new batch that is not in local DB', async () => {
    await applyRemoteBatches([batch({ id: 'new-batch', name: 'New Batch' })])

    const local = await db.batches.get('new-batch')
    expect(local).toBeDefined()
    expect(local.name).toBe('New Batch')
  })

  it('applies a close from another household member (remote closed:1, local open)', async () => {
    await db.batches.put(batch({ closed: 0, updatedAt: T0 }))

    // Another member closed the batch on their device — remote is newer with closed:true
    await applyRemoteBatches([batch({ closed: 1, updatedAt: T2 })])

    const local = await db.batches.get('batch-1')
    expect(local.closed).toBe(1)
  })

  it('applies a name edit from another member when local is open', async () => {
    await db.batches.put(batch({ name: 'Old Name', closed: 0, updatedAt: T0 }))

    await applyRemoteBatches([batch({ name: 'New Name', closed: 0, updatedAt: T2 })])

    const local = await db.batches.get('batch-1')
    expect(local.name).toBe('New Name')
  })

  it('skips update when local is newer than remote', async () => {
    await db.batches.put(batch({ name: 'Local Name', closed: 0, updatedAt: T2 }))

    await applyRemoteBatches([batch({ name: 'Remote Name', closed: 0, updatedAt: T0 })])

    const local = await db.batches.get('batch-1')
    expect(local.name).toBe('Local Name')
  })

  it('does not clobber local ingredients with an empty remote payload', async () => {
    await db.batches.put(batch({ ingredients: [{ name: 'Rice', grams: 200 }], updatedAt: T0 }))

    // Remote is newer but has no ingredients (e.g. partial Supabase payload)
    await applyRemoteBatches([batch({ ingredients: [], updatedAt: T2 })])

    const local = await db.batches.get('batch-1')
    expect(local.ingredients).toHaveLength(1)
  })

  it('preserves local closedAt when remote closed batch lacks one', async () => {
    await db.batches.put(batch({ closed: 0, updatedAt: T0 }))

    // Remote says it's closed but doesn't carry closedAt (Supabase doesn't store it)
    await applyRemoteBatches([batch({ closed: 1, closedAt: undefined, updatedAt: T2 })])

    const local = await db.batches.get('batch-1')
    expect(local.closed).toBe(1)
    // closedAt should fall back to updatedAt (T2) since local had none either
    expect(local.closedAt).toBe(T2)
  })
})
