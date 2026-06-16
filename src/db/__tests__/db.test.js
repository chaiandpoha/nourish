import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '../indexedDB.js'
import { addFoodLogEntry, getDayMacros, restoreFromSupabase } from '../db.js'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../supabase.js', () => ({
  sbFetchAllUserData: vi.fn(),
  sbPushUserData:     vi.fn().mockResolvedValue(undefined),
  sbSaveProfile:      vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../log/DayLog.jsx', () => ({
  localDate:    (d) => d ? new Date(d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  timeSlot:     () => 'breakfast',
  readMealPref: () => null,
  default:      () => null,
}))

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await db.foodLogs.clear()
  await db.foods.clear()
  await db.users.clear()
  localStorage.clear()
})

// ─── addFoodLogEntry ──────────────────────────────────────────────────────────

describe('addFoodLogEntry', () => {
  it('stores an entry with dirty: 1', async () => {
    await addFoodLogEntry('user1', {
      name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, fibre: 0,
      date: '2024-06-15', meal: 'lunch',
    })

    const entries = await db.foodLogs.toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0].dirty).toBe(1)
    expect(entries[0].userId).toBe('user1')
    expect(entries[0].name).toBe('Chicken Breast')
  })

  it('stamps updatedAt on the entry', async () => {
    const before = new Date().toISOString()
    await addFoodLogEntry('user1', {
      name: 'Oats', calories: 150, protein: 5, carbs: 27, fat: 3, fibre: 4,
      date: '2024-06-15', meal: 'breakfast',
    })

    const entries = await db.foodLogs.toArray()
    expect(entries[0].updatedAt).toBeTruthy()
    expect(entries[0].updatedAt >= before).toBe(true)
  })

  it('stores the supplied date and meal slot', async () => {
    await addFoodLogEntry('user1', {
      name: 'Dal', calories: 200, protein: 12, carbs: 30, fat: 4, fibre: 6,
      date: '2024-06-20', meal: 'dinner',
    })

    const entries = await db.foodLogs.toArray()
    expect(entries[0].date).toBe('2024-06-20')
    expect(entries[0].meal).toBe('dinner')
  })
})

// ─── getDayMacros ─────────────────────────────────────────────────────────────

describe('getDayMacros', () => {
  it('sums all macros for the given user and date', async () => {
    await addFoodLogEntry('user1', { name: 'Oats',    calories: 300, protein: 10, carbs: 55, fat: 5,  fibre: 8, date: '2024-06-15', meal: 'breakfast' })
    await addFoodLogEntry('user1', { name: 'Dal',     calories: 200, protein: 12, carbs: 30, fat: 4,  fibre: 6, date: '2024-06-15', meal: 'lunch' })

    const macros = await getDayMacros('user1', '2024-06-15')

    expect(macros.calories).toBe(500)
    expect(macros.protein).toBe(22)
    expect(macros.carbs).toBe(85)
    expect(macros.fat).toBe(9)
    expect(macros.fibre).toBe(14)
  })

  it('returns zero totals when no entries exist for the day', async () => {
    const macros = await getDayMacros('user1', '2024-06-15')

    expect(macros.calories).toBe(0)
    expect(macros.protein).toBe(0)
    expect(macros.carbs).toBe(0)
  })

  it('does not include entries from a different user', async () => {
    await addFoodLogEntry('user1', { name: 'A', calories: 400, protein: 20, carbs: 50, fat: 10, fibre: 5, date: '2024-06-15', meal: 'lunch' })
    await addFoodLogEntry('user2', { name: 'B', calories: 600, protein: 30, carbs: 70, fat: 15, fibre: 8, date: '2024-06-15', meal: 'dinner' })

    const macros = await getDayMacros('user1', '2024-06-15')

    expect(macros.calories).toBe(400)
    expect(macros.protein).toBe(20)
  })

  it('does not include entries from a different date', async () => {
    await addFoodLogEntry('user1', { name: 'Today',     calories: 500, protein: 25, carbs: 60, fat: 12, fibre: 7, date: '2024-06-15', meal: 'lunch' })
    await addFoodLogEntry('user1', { name: 'Yesterday', calories: 800, protein: 40, carbs: 90, fat: 20, fibre: 10, date: '2024-06-14', meal: 'dinner' })

    const macros = await getDayMacros('user1', '2024-06-15')

    expect(macros.calories).toBe(500)
  })

  it('handles three or more entries correctly', async () => {
    await addFoodLogEntry('user1', { name: 'Breakfast', calories: 300, protein: 10, carbs: 40, fat: 8,  fibre: 5, date: '2024-06-15', meal: 'breakfast' })
    await addFoodLogEntry('user1', { name: 'Lunch',     calories: 450, protein: 35, carbs: 50, fat: 12, fibre: 8, date: '2024-06-15', meal: 'lunch' })
    await addFoodLogEntry('user1', { name: 'Dinner',    calories: 600, protein: 45, carbs: 70, fat: 18, fibre: 10, date: '2024-06-15', meal: 'dinner' })

    const macros = await getDayMacros('user1', '2024-06-15')

    expect(macros.calories).toBe(1350)
    expect(macros.protein).toBe(90)
  })
})

// ─── restoreFromSupabase ──────────────────────────────────────────────────────

describe('restoreFromSupabase', () => {
  it('skips foods listed in nourish_deleted_foods', async () => {
    localStorage.setItem('nourish_deleted_foods', JSON.stringify(['food-gone']))
    const { sbFetchAllUserData } = await import('../supabase.js')
    sbFetchAllUserData.mockResolvedValueOnce([{
      table_name: 'foods',
      data: [
        { id: 'food-gone', name: 'Deleted Food', tags: [], per100g: {} },
        { id: 'food-ok',   name: 'Good Food',    tags: [], per100g: {} },
      ],
    }])

    await restoreFromSupabase('user1')

    expect(await db.foods.get('food-gone')).toBeUndefined()
    expect(await db.foods.get('food-ok')).toBeDefined()
  })

  it('sets dirty: 0 on restored foods (they came from cloud)', async () => {
    const { sbFetchAllUserData } = await import('../supabase.js')
    sbFetchAllUserData.mockResolvedValueOnce([{
      table_name: 'foods',
      data: [{ id: 'f1', name: 'Restored Food', dirty: 1, tags: [], per100g: {} }],
    }])

    await restoreFromSupabase('user1')

    const food = await db.foods.get('f1')
    expect(food.dirty).toBe(0)
  })

  it('returns the count of restored records', async () => {
    const { sbFetchAllUserData } = await import('../supabase.js')
    sbFetchAllUserData.mockResolvedValueOnce([{
      table_name: 'foods',
      data: [
        { id: 'f1', name: 'Food 1', tags: [], per100g: {} },
        { id: 'f2', name: 'Food 2', tags: [], per100g: {} },
        { id: 'f3', name: 'Food 3', tags: [], per100g: {} },
      ],
    }])

    const count = await restoreFromSupabase('user1')

    expect(count).toBe(3)
  })

  it('does not count deleted foods in the restore total', async () => {
    localStorage.setItem('nourish_deleted_foods', JSON.stringify(['f2']))
    const { sbFetchAllUserData } = await import('../supabase.js')
    sbFetchAllUserData.mockResolvedValueOnce([{
      table_name: 'foods',
      data: [
        { id: 'f1', name: 'Food 1', tags: [], per100g: {} },
        { id: 'f2', name: 'Food 2', tags: [], per100g: {} },
      ],
    }])

    const count = await restoreFromSupabase('user1')

    expect(count).toBe(1)
  })

  it('returns 0 when cloud returns no data', async () => {
    const { sbFetchAllUserData } = await import('../supabase.js')
    sbFetchAllUserData.mockResolvedValueOnce([])

    const count = await restoreFromSupabase('user1')

    expect(count).toBe(0)
  })
})
