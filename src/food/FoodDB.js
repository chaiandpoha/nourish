// Offline food search engine
// Queries USDA + NIN + saved/scanned foods from IndexedDB
// No API calls — fully local, instant results

import { db } from '../db/indexedDB.js'
import usdaFoodsData from '../data/usda_foods.json'
import ninFoodsData  from '../data/nin_foods.json'

// ─── Seed bundled foods into IndexedDB ───────────────────────────────────────
// Data is bundled as static imports — no fetch needed, works offline from
// the very first load with no service worker dependency.

// Common staples missing from the initial USDA/NIN dataset
const STAPLE_FOODS = [
  { id:'staples_001', name:'Sugar, white',         per100g:{ calories:387, protein:0,   carbs:100,  fat:0,    fibre:0   }, servingSize:5,   servingLabel:'1 tsp'    },
  { id:'staples_002', name:'Sugar, brown',          per100g:{ calories:380, protein:0,   carbs:98,   fat:0,    fibre:0   }, servingSize:5,   servingLabel:'1 tsp'    },
  { id:'staples_003', name:'Honey',                 per100g:{ calories:304, protein:0.3, carbs:82,   fat:0,    fibre:0.2 }, servingSize:21,  servingLabel:'1 tbsp'   },
  { id:'staples_004', name:'Coconut Sugar',         per100g:{ calories:375, protein:0,   carbs:94,   fat:0,    fibre:0   }, servingSize:5,   servingLabel:'1 tsp'    },
  { id:'staples_005', name:'Maple Syrup',           per100g:{ calories:260, protein:0,   carbs:67,   fat:0,    fibre:0   }, servingSize:20,  servingLabel:'1 tbsp'   },
  { id:'staples_006', name:'Condensed Milk, sweet', per100g:{ calories:321, protein:7.9, carbs:54,   fat:8.7,  fibre:0   }, servingSize:30,  servingLabel:'2 tbsp'   },
  { id:'staples_007', name:'Coconut Milk',          per100g:{ calories:197, protein:2.3, carbs:2.8,  fat:21,   fibre:0.5 }, servingSize:30,  servingLabel:'2 tbsp'   },
  { id:'staples_008', name:'Coconut Cream',         per100g:{ calories:330, protein:3.6, carbs:6.7,  fat:34,   fibre:0   }, servingSize:30,  servingLabel:'2 tbsp'   },
  { id:'staples_009', name:'Olive Oil',             per100g:{ calories:884, protein:0,   carbs:0,    fat:100,  fibre:0   }, servingSize:14,  servingLabel:'1 tbsp'   },
  { id:'staples_010', name:'Coconut Oil',           per100g:{ calories:892, protein:0,   carbs:0,    fat:99,   fibre:0   }, servingSize:14,  servingLabel:'1 tbsp'   },
  { id:'staples_011', name:'Salt',                  per100g:{ calories:0,   protein:0,   carbs:0,    fat:0,    fibre:0   }, servingSize:6,   servingLabel:'1 tsp'    },
  { id:'staples_012', name:'Baking Powder',         per100g:{ calories:53,  protein:0,   carbs:28,   fat:0,    fibre:0   }, servingSize:4,   servingLabel:'1 tsp'    },
  { id:'staples_013', name:'Corn Starch',           per100g:{ calories:381, protein:0.3, carbs:91,   fat:0.1,  fibre:0.9 }, servingSize:8,   servingLabel:'1 tbsp'   },
  { id:'staples_014', name:'Mishri / Rock Sugar',   per100g:{ calories:398, protein:0,   carbs:100,  fat:0,    fibre:0   }, servingSize:10,  servingLabel:'2 pieces' },
  { id:'staples_015', name:'Dates, dried',          per100g:{ calories:282, protein:2.5, carbs:75,   fat:0.4,  fibre:8   }, servingSize:24,  servingLabel:'2 dates'  },
  { id:'staples_016', name:'Vanilla Extract',       per100g:{ calories:288, protein:0.1, carbs:13,   fat:0.1,  fibre:0   }, servingSize:4,   servingLabel:'1 tsp'    },
  { id:'staples_017', name:'Cocoa Powder, unsweetened',per100g:{ calories:228, protein:19.6,carbs:57, fat:13.7, fibre:37  }, servingSize:8,   servingLabel:'1 tbsp'   },
  { id:'staples_018', name:'Milk Powder, full fat', per100g:{ calories:496, protein:26,  carbs:38,   fat:27,   fibre:0   }, servingSize:30,  servingLabel:'3 tbsp'   },
  { id:'staples_019', name:'Chia Seeds',            per100g:{ calories:486, protein:17,  carbs:42,   fat:31,   fibre:34  }, servingSize:12,  servingLabel:'1 tbsp'   },
  { id:'staples_020', name:'Flax Seeds',            per100g:{ calories:534, protein:18,  carbs:29,   fat:42,   fibre:27  }, servingSize:10,  servingLabel:'1 tbsp'   },
  // V2 additions
  { id:'staples_021', name:'Blueberries',           per100g:{ calories:57,  protein:0.7, carbs:14.5, fat:0.3,  fibre:2.4 }, servingSize:100, servingLabel:'handful'  },
  { id:'staples_022', name:'Raspberries',           per100g:{ calories:52,  protein:1.2, carbs:11.9, fat:0.7,  fibre:6.5 }, servingSize:100, servingLabel:'handful'  },
  { id:'staples_023', name:'Ginger, fresh',         per100g:{ calories:80,  protein:1.8, carbs:18,   fat:0.8,  fibre:2   }, servingSize:5,   servingLabel:'1 tsp grated' },
  { id:'staples_024', name:'Lettuce, romaine',      per100g:{ calories:17,  protein:1.2, carbs:3.3,  fat:0.3,  fibre:2.1 }, servingSize:85,  servingLabel:'1 cup'    },
  { id:'staples_025', name:'Cumin / Jeera',         per100g:{ calories:375, protein:18,  carbs:44,   fat:22,   fibre:10  }, servingSize:2,   servingLabel:'1 tsp'    },
  { id:'staples_026', name:'Cinnamon, ground',      per100g:{ calories:247, protein:4,   carbs:81,   fat:1.2,  fibre:53  }, servingSize:2.6, servingLabel:'1 tsp'    },
  { id:'staples_027', name:'Cardamom / Elaichi',    per100g:{ calories:311, protein:10.8,carbs:68,   fat:6.7,  fibre:28  }, servingSize:2,   servingLabel:'1 tsp'    },
  { id:'staples_028', name:'Rice Noodles, dry',     per100g:{ calories:364, protein:6,   carbs:80,   fat:0.6,  fibre:1.8 }, servingSize:80,  servingLabel:'1 serving' },
  { id:'staples_029', name:'Egg Noodles, cooked',   per100g:{ calories:138, protein:4.5, carbs:25,   fat:2.1,  fibre:1.8 }, servingSize:180, servingLabel:'1 bowl'   },
  { id:'staples_030', name:'Rava / Idli Rava',      per100g:{ calories:360, protein:12.7,carbs:73,   fat:1.1,  fibre:3.9 }, servingSize:40,  servingLabel:'1 serving' },
  { id:'staples_031', name:'Lettuce, iceberg',      per100g:{ calories:14,  protein:0.9, carbs:3,    fat:0.1,  fibre:1.2 }, servingSize:85,  servingLabel:'1 cup'    },
  { id:'staples_032', name:'Mango, fresh',          per100g:{ calories:60,  protein:0.8, carbs:15,   fat:0.4,  fibre:1.6 }, servingSize:150, servingLabel:'1 medium' },
  { id:'staples_033', name:'Watermelon',            per100g:{ calories:30,  protein:0.6, carbs:7.6,  fat:0.2,  fibre:0.4 }, servingSize:280, servingLabel:'2 cups'   },
  { id:'staples_034', name:'Lemon juice',           per100g:{ calories:22,  protein:0.4, carbs:6.9,  fat:0.2,  fibre:0.3 }, servingSize:15,  servingLabel:'1 tbsp'   },
]

let _seeded = false

export async function seedFoodDatabase() {
  if (_seeded) return true

  try {
    // If usda_001 already exists, data is seeded from a previous session
    const alreadySeeded = await db.foods.get('usda_001')
    if (alreadySeeded) {
      _seeded = true
      // Add any staple foods missing from the initial seed (runs once per batch)
      const hasStaplesV1 = await db.foods.get('staples_001')
      if (!hasStaplesV1) {
        await db.foods.bulkPut(STAPLE_FOODS.map(f => ({ ...f, source: 'nin', tags: [] })))
      }
      const hasStaplesV2 = await db.foods.get('staples_021')
      if (!hasStaplesV2) {
        const v2 = STAPLE_FOODS.filter(f => parseInt(f.id.split('_')[1]) >= 21)
        await db.foods.bulkPut(v2.map(f => ({ ...f, source: 'nin', tags: [] })))
      }
      const hasNinV2 = await db.foods.get('nin_312')
      if (!hasNinV2) {
        const ninNew = ninFoodsData.filter(f => parseInt(f.id.split('_')[1]) >= 312)
        await db.foods.bulkPut(ninNew.map(f => ({ ...f, source: 'nin', tags: f.tags || [] })))
        // Remove duplicate NIN entries that were deduplicated in this release
        const dupeIds = ['nin_093','nin_094','nin_096','nin_097','nin_101','nin_102','nin_103',
          'nin_115','nin_117','nin_130','nin_136','nin_142','nin_143','nin_147','nin_157',
          'nin_171','nin_172','nin_185','nin_191','nin_211','nin_212']
        await db.foods.bulkDelete(dupeIds)
      }
      return true
    }

    // tags:[] required — omitting a multi-entry indexed field causes bulkPut
    // to fail silently on Safari iOS (IndexedDB multi-entry index constraint)
    const all = [
      ...usdaFoodsData.map(f => ({ ...f, source: 'usda', tags: f.tags || [] })),
      ...ninFoodsData.map(f  => ({ ...f, source: 'nin',  tags: f.tags || [] })),
      ...STAPLE_FOODS.map(f  => ({ ...f, source: 'nin',  tags: [] })),
    ]

    await db.foods.bulkPut(all)
    _seeded = true
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
    const err = await sbSaveFood(entry, householdId).catch(e => e)
    if (err instanceof Error) console.error('Supabase food sync error:', err.message, entry.name)
  }

  return entry
}

export async function deleteFood(id, householdId) {
  await db.foods.delete(id)
  if (householdId) {
    const { sbDeleteFood } = await import('../db/supabase.js')
    await sbDeleteFood(id).catch(e => console.warn('Supabase food delete error:', e))
  }
}

// Pull household foods from Supabase and merge into local DB
export async function fetchHouseholdFoods(householdId) {
  if (!householdId) return
  try {
    const { sbFetchHouseholdFoods } = await import('../db/supabase.js')
    const foods = await sbFetchHouseholdFoods(householdId)
    if (foods.length) await db.foods.bulkPut(foods)
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
        console.error('pushLocalFoods failed:', food.name, e.message)
        return null
      })
      if (result) pushed++
    }
  } catch (e) {
    console.warn('pushLocalFoodsToHousehold error:', e)
  }
}

// Push all local batches up to Supabase for household sharing
// Called at login to catch batches created before household was set up
export async function pushLocalBatchesToHousehold(householdId, email) {
  if (!householdId) return
  try {
    const batches = await db.batches.toArray()
    if (!batches.length) return
    const { sbPushAllBatches } = await import('../db/supabase.js')
    await sbPushAllBatches(batches, email, householdId)
    await db.batches.toCollection().modify({ shared: 1, householdId })
  } catch (e) {
    console.warn('pushLocalBatchesToHousehold error:', e)
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