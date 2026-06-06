// Offline food search engine
// Queries USDA + NIN + saved/scanned foods from IndexedDB
// No API calls — fully local, instant results

import { db } from '../db/indexedDB.js'
import usdaFoodsData from '../data/usda_foods.json'
import ninFoodsData  from '../data/nin_foods.json'

// ─── Seed bundled foods into IndexedDB ───────────────────────────────────────
// Data is bundled as static imports — no fetch needed, works offline from
// the very first load with no service worker dependency.

let _seeded = false

export async function seedFoodDatabase() {
  if (_seeded) return true

  try {
    // If usda_001 already exists, data is seeded from a previous session
    const alreadySeeded = await db.foods.get('usda_001')
    if (alreadySeeded) { _seeded = true; return true }

    console.log('FoodDB: seeding from bundle…')

    // tags:[] required — omitting a multi-entry indexed field causes bulkPut
    // to fail silently on Safari iOS (IndexedDB multi-entry index constraint)
    const all = [
      ...usdaFoodsData.map(f => ({ ...f, source: 'usda', tags: f.tags || [] })),
      ...ninFoodsData.map(f  => ({ ...f, source: 'nin',  tags: f.tags || [] })),
    ]

    await db.foods.bulkPut(all)
    _seeded = true
    console.log(`FoodDB: seeded ${all.length} foods`)
    return true
  } catch (e) {
    console.warn('FoodDB seed error:', e)
    return false
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

  // De-duplicate: if user has saved/scanned a food with this exact name,
  // hide the DB (usda/nin) entry — the user's macros take precedence.
  const personalNames = new Set(
    matches
      .filter(f => f.source === 'saved' || f.source === 'scanned')
      .map(f => f.name.toLowerCase().trim())
  )

  const deduped = personalNames.size === 0
    ? matches
    : matches.filter(f =>
        f.source !== 'usda' && f.source !== 'nin'
          ? true
          : !personalNames.has(f.name.toLowerCase().trim())
      )

  return deduped.slice(0, limit)
}

function sourcePriority(source) {
  switch (source) {
    case 'recipe':  return 0
    case 'saved':   return 1
    case 'scanned': return 2
    case 'nin':     return 3
    case 'usda':    return 4
    default:        return 5
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

export async function saveFood(food, householdId) {
  const entry = {
    tags:   [],
    ...food,
    id:     food.id || `saved_${Date.now()}`,
    source: food.source || 'saved',
  }
  await db.foods.put(entry)

  // Sync to Supabase for household sharing
  if (householdId) {
    const { sbSaveFood } = await import('../db/supabase.js')
    await sbSaveFood(entry, householdId).catch(e => console.warn('Supabase food sync error:', e))
  }

  return entry
}

// Pull household foods from Supabase and merge into local DB
export async function fetchHouseholdFoods(householdId) {
  if (!householdId) return
  try {
    const { sbFetchHouseholdFoods } = await import('../db/supabase.js')
    const foods = await sbFetchHouseholdFoods(householdId)
    if (foods.length) await db.foods.bulkPut(foods)
    console.log(`fetchHouseholdFoods: pulled ${foods.length} foods`)
  } catch (e) {
    console.warn('fetchHouseholdFoods error:', e)
  }
}

// Push all locally saved/scanned/recipe foods up to Supabase for household sharing
// Called at login to catch any foods created before Supabase table existed
export async function pushLocalFoodsToHousehold(householdId) {
  if (!householdId) return
  try {
    const personal = await db.foods
      .where('source').anyOf(['saved', 'scanned', 'recipe'])
      .toArray()
    if (!personal.length) return
    const { sbSaveFood } = await import('../db/supabase.js')
    let pushed = 0
    for (const food of personal) {
      const result = await sbSaveFood(food, householdId).catch(e => {
        console.warn('pushLocalFoods: failed for', food.name, e.message)
        return null
      })
      if (result) pushed++
    }
    console.log(`pushLocalFoodsToHousehold: pushed ${pushed}/${personal.length} foods`)
  } catch (e) {
    console.warn('pushLocalFoodsToHousehold error:', e)
  }
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