// Offline food search engine
// Queries USDA + NIN + saved/scanned foods from IndexedDB
// No API calls — fully local, instant results

import { db } from '../db/indexedDB.js'

// ─── Seed bundled foods into IndexedDB ───────────────────────────────────────
// Called once on app start — safe to call repeatedly (bulkPut is idempotent)

let _seeded = false

export async function seedFoodDatabase() {
  if (_seeded) return
  // Check if foods actually exist in DB
  const count = await db.foods.count()
  if (count > 10) { _seeded = true; return }

  try {
    console.log('Seeding food database...')
    const [usdaRes, ninRes] = await Promise.all([
      fetch('/data/usda_foods.json'),
      fetch('/data/nin_foods.json'),
    ])

    console.log('USDA status:', usdaRes.status, 'NIN status:', ninRes.status)

    if (!usdaRes.ok || !ninRes.ok) {
      throw new Error('Failed to fetch food data: ' + usdaRes.status + ' ' + ninRes.status)
    }

    const [usdaFoods, ninFoods] = await Promise.all([
      usdaRes.json(),
      ninRes.json(),
    ])

    console.log('USDA foods:', usdaFoods.length, 'NIN foods:', ninFoods.length)

    const all = [
      ...usdaFoods.map(f => ({ ...f, source: 'usda' })),
      ...ninFoods.map(f  => ({ ...f, source: 'nin'  })),
    ]

    await db.foods.bulkPut(all)
    console.log('Seeded', all.length, 'foods')
    _seeded = true
    console.log(`FoodDB: seeded ${all.length} foods`)
  } catch (e) {
    console.warn('FoodDB seed error:', e)
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search foods by name — returns up to `limit` results.
 * Priority: saved/scanned first, then nin, then usda.
 * Matches anywhere in the name — not just prefix.
 */
export async function searchFoods(query, limit = 20) {
  if (!query || query.trim().length < 1) return []

  const q = query.trim().toLowerCase()

  // Get all foods matching query
  const all = await db.foods.toArray()

  const matches = all.filter(f =>
    f.name.toLowerCase().includes(q)
  )

  // Sort by priority then relevance
  matches.sort((a, b) => {
    const pa = sourcePriority(a.source)
    const pb = sourcePriority(b.source)
    if (pa !== pb) return pa - pb

    // Within same source — exact start match ranked higher
    const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
    const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
    return aStarts - bStarts
  })

  return matches.slice(0, limit)
}

function sourcePriority(source) {
  switch (source) {
    case 'saved':   return 0
    case 'scanned': return 1
    case 'nin':     return 2
    case 'usda':    return 3
    default:        return 4
  }
}

// ─── Recent foods ─────────────────────────────────────────────────────────────

/**
 * Get foods logged by userId in the last 7 days,
 * sorted by frequency (most logged first).
 */
export async function getRecentFoods(userId, limit = 10) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const cutoff = sevenDaysAgo.toISOString().slice(0, 10)
  const today  = new Date().toISOString().slice(0, 10)

  const logs = await db.foodLogs
    .where('[userId+date]')
    .between([userId, cutoff], [userId, today], true, true)
    .toArray()

  // Count frequency per foodId
  const freq = {}
  for (const log of logs) {
    if (!log.foodId) continue
    freq[log.foodId] = (freq[log.foodId] || 0) + 1
  }

  // Fetch food details for top IDs
  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)

  const foods = await Promise.all(
    sorted.map(id => db.foods.get(id))
  )

  return foods.filter(Boolean)
}

// ─── Get food by ID ───────────────────────────────────────────────────────────

export async function getFoodById(id) {
  return db.foods.get(id)
}

// ─── Get food by barcode ──────────────────────────────────────────────────────

export async function getFoodByBarcode(barcode) {
  if (!barcode) return null
  const results = await db.foods.where('barcode').equals(barcode).toArray()
  return results[0] || null
}

// ─── Save scanned / custom food ───────────────────────────────────────────────

export async function saveFood(food) {
  const entry = {
    ...food,
    id:     food.id || `saved_${Date.now()}`,
    source: food.source || 'saved',
  }
  await db.foods.put(entry)

  // Sync shared foods to Drive
  const { saveSharedFoods } = await import('../db/db.js')
  await saveSharedFoods().catch(e => console.warn('Drive sync error:', e))

  return entry
}

// ─── Active batches ───────────────────────────────────────────────────────────

/**
 * Get all open batches — shared ones first, then personal.
 */
export async function getActiveBatches(userId) {
  const all = await db.batches
    .where('closed')
    .equals(0)
    .toArray()

  // Shared batches first, then personal
  return all.sort((a, b) => {
    if (a.shared && !b.shared) return -1
    if (!a.shared && b.shared) return 1
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
}

// ─── Meal slot auto-detection ─────────────────────────────────────────────────

export function detectMealSlot() {
  const h = new Date().getHours()
  if (h < 10) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 19) return 'dinner'
  return 'snack'
}