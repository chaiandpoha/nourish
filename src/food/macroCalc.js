// Macro calculation helpers
// Single source of truth for all gram-to-macro conversions

import { MACRO_KEYS } from '../config.js'

// ─── Core calculation ─────────────────────────────────────────────────────────

/**
 * Calculate macros for a given food at a given gram weight.
 * Uses per100g values from the food object.
 */
export function calcMacros(food, grams) {
  if (!food?.per100g || !grams) return emptyMacros()
  const ratio = grams / 100
  const result = {}
  for (const key of MACRO_KEYS) {
    result[key] = round2(( food.per100g[key] || 0) * ratio)
  }
  return result
}

/**
 * Calculate macros from a batch entry.
 * Batch stores macrosPer100g — same formula.
 */
export function calcBatchMacros(batch, grams) {
  if (!batch?.macrosPer100g || !grams) return emptyMacros()
  const ratio = grams / 100
  const result = {}
  for (const key of MACRO_KEYS) {
    result[key] = round2((batch.macrosPer100g[key] || 0) * ratio)
  }
  return result
}

// ─── Batch cooking ────────────────────────────────────────────────────────────

/**
 * Calculate macrosPer100g for a batch from ingredients + yield.
 * ingredients: [{ food, grams }]
 * yieldGrams: total cooked weight
 */
export function calcBatchMacrosPer100g(ingredients, yieldGrams) {
  if (!ingredients?.length || !yieldGrams) return emptyMacros()

  // Sum total macros across all ingredients
  const totals = emptyMacros()
  for (const { food, grams } of ingredients) {
    const macros = calcMacros(food, grams)
    for (const key of MACRO_KEYS) {
      totals[key] += macros[key] || 0
    }
  }

  // Divide by yield to get per100g values
  const per100g = {}
  for (const key of MACRO_KEYS) {
    per100g[key] = round2((totals[key] / yieldGrams) * 100)
  }
  return per100g
}

// ─── Totals ───────────────────────────────────────────────────────────────────

/**
 * Sum an array of macro objects.
 */
export function sumMacros(macroArray) {
  const totals = emptyMacros()
  for (const macros of macroArray) {
    if (!macros) continue
    for (const key of MACRO_KEYS) {
      totals[key] += macros[key] || 0
    }
  }
  // Round totals
  for (const key of MACRO_KEYS) {
    totals[key] = round2(totals[key])
  }
  return totals
}

/**
 * Calculate remaining macros vs goals.
 * Returns object with remaining values — can be negative if over goal.
 */
export function calcRemaining(totals, goals) {
  const remaining = {}
  for (const key of MACRO_KEYS) {
    remaining[key] = round2((goals[key] || 0) - (totals[key] || 0))
  }
  return remaining
}

/**
 * Calculate progress percentage for each macro (0–100, capped at 100).
 */
export function calcProgress(totals, goals) {
  const progress = {}
  for (const key of MACRO_KEYS) {
    const goal = goals[key] || 1
    progress[key] = Math.min(100, round2((totals[key] / goal) * 100))
  }
  return progress
}

// ─── Serving size helpers ─────────────────────────────────────────────────────

/**
 * Convert serving multiplier to grams.
 * e.g. food with servingSize=30g, multiplier=2.5 → 75g
 */
export function servingsToGrams(food, servings) {
  if (!food?.servingSize) return servings * 100
  return round2(servings * food.servingSize)
}

/**
 * Convert grams to serving count.
 */
export function gramsToServings(food, grams) {
  if (!food?.servingSize) return round2(grams / 100)
  return round2(grams / food.servingSize)
}

// ─── Weekly summary ───────────────────────────────────────────────────────────

/**
 * Calculate weekly stats from an array of daily log arrays.
 * days: [{ date, logs: [foodLog] }]
 * goals: user macro goals
 */
export function calcWeeklyStats(days, goals) {
  let proteinHit  = 0
  let fibreHit    = 0
  let totalCalories = 0
  const validDays = days.filter(d => d.logs.length > 0)

  for (const day of validDays) {
    const totals = sumMacros(day.logs)
    if (totals.protein >= (goals.protein || 999)) proteinHit++
    if (totals.fibre   >= (goals.fibre   || 999)) fibreHit++
    totalCalories += totals.calories
  }

  return {
    daysLogged:      validDays.length,
    proteinHitDays:  proteinHit,
    fibreHitDays:    fibreHit,
    avgCalories:     validDays.length
      ? round2(totalCalories / validDays.length)
      : 0,
  }
}

// ─── Fibre check ──────────────────────────────────────────────────────────────

/**
 * Returns true if fibre is below 50% of goal by evening.
 * Used to flag low fibre in AI chat context.
 */
export function isFibreLow(totals, goals) {
  const h = new Date().getHours()
  if (h < 19) return false // only flag after 7pm
  const fibreGoal = goals.fibre || 30
  return (totals.fibre || 0) < fibreGoal * 0.5
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function emptyMacros() {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
}

function round2(n) {
  return Math.round(n * 10) / 10
}