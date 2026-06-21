import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../../db/db.js'
import { getActiveBatches, fetchHouseholdFoods, deleteFood } from '../FoodDB.js'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../auth/crypto.js', () => ({
  generateId: () => `id-${Math.random().toString(36).slice(2, 9)}`,
  sha256:     vi.fn().mockResolvedValue('hashed'),
}))

vi.mock('../../log/DayLog.jsx', () => ({
  localDate:    (d) => d ? new Date(d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  timeSlot:     () => 'breakfast',
  readMealPref: () => null,
  default:      () => null,
}))

vi.mock('../../db/supabase.js', () => ({
  sbFetchHouseholdFoods: vi.fn(),
  sbSaveFood:            vi.fn().mockResolvedValue(undefined),
  sbDeleteFood:          vi.fn().mockResolvedValue(undefined),
}))

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.batches.clear()
  await db.foods.clear()
  localStorage.clear()
})

// ─── getActiveBatches ─────────────────────────────────────────────────────────

describe('getActiveBatches', () => {
  it('returns household batches and own personal batches, excludes other users personal batches', async () => {
    await db.batches.bulkPut([
      { id: 'b-own',    userId: 'user1', householdId: null,  shared: 0, closed: 0, macrosPer100g: { calories: 200 }, createdAt: '2024-01-01T00:00:00Z' },
      { id: 'b-shared', userId: 'user2', householdId: 'hh1', shared: 1, closed: 0, macrosPer100g: { calories: 300 }, createdAt: '2024-01-02T00:00:00Z' },
      { id: 'b-other',  userId: 'user2', householdId: null,  shared: 0, closed: 0, macrosPer100g: { calories: 100 }, createdAt: '2024-01-03T00:00:00Z' },
    ])

    const result = await getActiveBatches('user1', 'hh1')
    const ids = result.map(b => b.id)

    expect(ids).toContain('b-own')       // own personal batch
    expect(ids).toContain('b-shared')    // household batch from another user
    expect(ids).not.toContain('b-other') // other user's personal batch — must be excluded
  })

  it('returns only own batches when user has no household', async () => {
    await db.batches.bulkPut([
      { id: 'b-mine',   userId: 'user1', householdId: null, shared: 0, closed: 0, macrosPer100g: {}, createdAt: '2024-01-01T00:00:00Z' },
      { id: 'b-others', userId: 'user2', householdId: null, shared: 0, closed: 0, macrosPer100g: {}, createdAt: '2024-01-01T00:00:00Z' },
    ])

    const result = await getActiveBatches('user1', null)
    const ids = result.map(b => b.id)

    expect(ids).toContain('b-mine')
    expect(ids).not.toContain('b-others')
  })

  it('excludes closed batches', async () => {
    await db.batches.bulkPut([
      { id: 'b-open',   userId: 'user1', closed: 0, macrosPer100g: {}, createdAt: '2024-01-01T00:00:00Z' },
      { id: 'b-closed', userId: 'user1', closed: 1, macrosPer100g: {}, createdAt: '2024-01-01T00:00:00Z' },
    ])

    const result = await getActiveBatches('user1', null)
    const ids = result.map(b => b.id)

    expect(ids).toContain('b-open')
    expect(ids).not.toContain('b-closed')
  })

  it('sorts shared batches before personal', async () => {
    await db.batches.bulkPut([
      { id: 'personal', userId: 'user1', householdId: 'hh1', shared: 0, closed: 0, macrosPer100g: {}, createdAt: '2024-01-01T00:00:00Z' },
      { id: 'shared',   userId: 'user2', householdId: 'hh1', shared: 1, closed: 0, macrosPer100g: {}, createdAt: '2024-01-01T00:00:00Z' },
    ])

    const result = await getActiveBatches('user1', 'hh1')

    expect(result[0].id).toBe('shared')
    expect(result[1].id).toBe('personal')
  })
})

// ─── fetchHouseholdFoods ──────────────────────────────────────────────────────

describe('fetchHouseholdFoods', () => {
  it('skips foods listed in nourish_deleted_foods', async () => {
    localStorage.setItem('nourish_deleted_foods', JSON.stringify(['del-food']))
    const { sbFetchHouseholdFoods } = await import('../../db/supabase.js')
    sbFetchHouseholdFoods.mockResolvedValueOnce([
      { id: 'del-food', name: 'Deleted Food', per100g: { calories: 100 }, tags: [] },
      { id: 'ok-food',  name: 'Kept Food',    per100g: { calories: 200 }, tags: [] },
    ])

    await fetchHouseholdFoods('hh1')

    expect(await db.foods.get('del-food')).toBeUndefined()
    expect(await db.foods.get('ok-food')).toBeDefined()
  })

  it('does not overwrite local food when local updatedAt is newer', async () => {
    await db.foods.put({ id: 'f1', name: 'Local (Newer)', updatedAt: '2024-06-01T00:00:00Z', per100g: { calories: 300 }, tags: [] })
    const { sbFetchHouseholdFoods } = await import('../../db/supabase.js')
    sbFetchHouseholdFoods.mockResolvedValueOnce([
      { id: 'f1', name: 'Remote (Older)', updatedAt: '2024-01-01T00:00:00Z', per100g: { calories: 100 }, tags: [] },
    ])

    await fetchHouseholdFoods('hh1')

    const food = await db.foods.get('f1')
    expect(food.name).toBe('Local (Newer)')
  })

  it('accepts remote food when remote updatedAt is newer', async () => {
    await db.foods.put({ id: 'f1', name: 'Local (Older)', updatedAt: '2024-01-01T00:00:00Z', per100g: { calories: 100 }, tags: [] })
    const { sbFetchHouseholdFoods } = await import('../../db/supabase.js')
    sbFetchHouseholdFoods.mockResolvedValueOnce([
      { id: 'f1', name: 'Remote (Newer)', updatedAt: '2024-06-01T00:00:00Z', per100g: { calories: 300 }, tags: [] },
    ])

    await fetchHouseholdFoods('hh1')

    const food = await db.foods.get('f1')
    expect(food.name).toBe('Remote (Newer)')
  })

  it('does not overwrite a local recipe with a remote copy that has no ingredients', async () => {
    await db.foods.put({ id: 'r1', name: 'My Dal', source: 'recipe', ingredients: [{ name: 'Lentils', grams: 100 }], per100g: {}, tags: [] })
    const { sbFetchHouseholdFoods } = await import('../../db/supabase.js')
    sbFetchHouseholdFoods.mockResolvedValueOnce([
      { id: 'r1', name: 'My Dal', source: 'recipe', ingredients: [], per100g: {}, tags: [] },
    ])

    await fetchHouseholdFoods('hh1')

    const food = await db.foods.get('r1')
    expect(food.ingredients).toHaveLength(1) // local ingredients preserved
  })

  it('adds new remote food not present locally', async () => {
    const { sbFetchHouseholdFoods } = await import('../../db/supabase.js')
    sbFetchHouseholdFoods.mockResolvedValueOnce([
      { id: 'new-food', name: 'Brand New Food', per100g: { calories: 150 }, tags: [] },
    ])

    await fetchHouseholdFoods('hh1')

    expect(await db.foods.get('new-food')).toBeDefined()
  })

  it('is a no-op when householdId is falsy', async () => {
    const { sbFetchHouseholdFoods } = await import('../../db/supabase.js')

    await fetchHouseholdFoods(null)

    expect(sbFetchHouseholdFoods).not.toHaveBeenCalled()
  })
})

// ─── deleteFood ───────────────────────────────────────────────────────────────

describe('deleteFood', () => {
  it('removes the food from IndexedDB', async () => {
    await db.foods.put({ id: 'f1', name: 'Test Food', source: 'saved', per100g: {}, tags: [] })

    await deleteFood('f1', null)

    expect(await db.foods.get('f1')).toBeUndefined()
  })

  it('adds the food id to nourish_deleted_foods in localStorage', async () => {
    await db.foods.put({ id: 'f1', name: 'Test Food', source: 'saved', per100g: {}, tags: [] })

    await deleteFood('f1', null)

    const deleted = JSON.parse(localStorage.getItem('nourish_deleted_foods') || '[]')
    expect(deleted).toContain('f1')
  })

  it('appends to an existing nourish_deleted_foods list', async () => {
    localStorage.setItem('nourish_deleted_foods', JSON.stringify(['existing-id']))
    await db.foods.put({ id: 'new-id', name: 'Another', source: 'saved', per100g: {}, tags: [] })

    await deleteFood('new-id', null)

    const deleted = JSON.parse(localStorage.getItem('nourish_deleted_foods') || '[]')
    expect(deleted).toContain('existing-id')
    expect(deleted).toContain('new-id')
  })

  it('keeps nourish_deleted_foods capped at 2000 entries', async () => {
    const big = Array.from({ length: 2000 }, (_, i) => `old-${i}`)
    localStorage.setItem('nourish_deleted_foods', JSON.stringify(big))
    await db.foods.put({ id: 'overflow', name: 'X', source: 'saved', per100g: {}, tags: [] })

    await deleteFood('overflow', null)

    const deleted = JSON.parse(localStorage.getItem('nourish_deleted_foods') || '[]')
    expect(deleted.length).toBeLessThanOrEqual(2000)
    expect(deleted).toContain('overflow')
  })
})
