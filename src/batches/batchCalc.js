// Batch cooking calculations
// A batch is a cooked dish — ingredients go in, yield comes out
// macrosPer100g = total ingredient macros / yield * 100

import { MACRO_KEYS } from '../config.js'

// ─── Calculate macrosPer100g from ingredients + yield ─────────────────────────

/**
 * ingredients: [{ food, grams }]
 * yieldGrams: total cooked weight in grams
 * returns: { calories, protein, carbs, fat, fibre } per 100g of batch
 */
export function calcBatchMacrosPer100g(ingredients, yieldGrams) {
  if (!ingredients?.length || !yieldGrams) {
    return emptyMacros()
  }

  // Sum total macros across all ingredients
  const totals = emptyMacros()
  for (const { food, grams } of ingredients) {
    if (!food?.per100g || !grams) continue
    const ratio = grams / 100
    for (const key of MACRO_KEYS) {
      totals[key] += (food.per100g[key] || 0) * ratio
    }
  }

  // Divide by yield to get per100g
  const per100g = {}
  for (const key of MACRO_KEYS) {
    per100g[key] = round2((totals[key] / yieldGrams) * 100)
  }

  return per100g
}

// ─── Calculate macros for a portion of a batch ────────────────────────────────

/**
 * batch: { macrosPer100g }
 * grams: portion weight
 * returns: { calories, protein, carbs, fat, fibre }
 */
export function calcPortionMacros(batch, grams) {
  if (!batch?.macrosPer100g || !grams) return emptyMacros()
  const ratio = grams / 100
  const result = {}
  for (const key of MACRO_KEYS) {
    result[key] = round2((batch.macrosPer100g[key] || 0) * ratio)
  }
  return result
}

// ─── Validate batch ingredients ───────────────────────────────────────────────

/**
 * Returns { valid, errors } for a batch being created
 */
export function validateBatch({ name, ingredients, yieldGrams }) {
  const errors = []

  if (!name?.trim()) {
    errors.push('Batch needs a name')
  }

  if (!ingredients?.length) {
    errors.push('Add at least one ingredient')
  }

  const hasOil = ingredients?.some(i =>
    i.food?.name?.toLowerCase().includes('oil') ||
    i.food?.name?.toLowerCase().includes('ghee') ||
    i.food?.name?.toLowerCase().includes('butter')
  )

  // Warn but don't block if no oil — some dishes genuinely have none
  const warnings = []
  if (ingredients?.length > 1 && !hasOil) {
    warnings.push('No oil/ghee added — include cooking fat as an ingredient for accurate macros')
  }

  if (!yieldGrams || yieldGrams <= 0) {
    errors.push('Enter the cooked yield weight')
  }

  const totalIngredientWeight = ingredients?.reduce((sum, i) => sum + (i.grams || 0), 0) || 0
  if (yieldGrams > totalIngredientWeight * 1.5) {
    warnings.push('Yield seems high — double check the cooked weight')
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function emptyMacros() {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
}

function round2(n) {
  return Math.round(n * 10) / 10
}