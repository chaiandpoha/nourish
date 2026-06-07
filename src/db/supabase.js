import { createClient } from '@supabase/supabase-js'
import { HOUSEHOLD } from '../config.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null

// ─── Batch helpers ────────────────────────────────────────────────────────────

function toRow(batch, email, householdId) {
  return {
    id:              batch.id,
    name:            batch.name,
    created_by:      email || batch.createdBy || '',
    shared:          batch.shared === 1 || batch.shared === true,
    closed:          batch.closed === 1 || batch.closed === true,
    ingredients:     batch.ingredients || [],
    yield_grams:     batch.yieldGrams   || null,
    macros_per_100g: batch.macrosPer100g || null,
    household_id:    householdId || batch.householdId || null,
    updated_at:      new Date().toISOString(),
  }
}

function fromRow(row) {
  return {
    id:            row.id,
    name:          row.name,
    createdBy:     row.created_by,
    shared:        row.shared ? 1 : 0,
    closed:        row.closed ? 1 : 0,
    ingredients:   row.ingredients  || [],
    yieldGrams:    row.yield_grams  || 0,
    macrosPer100g: row.macros_per_100g || null,
    householdId:   row.household_id || null,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
    dirty:         0,
  }
}

export async function sbFetchBatches(householdId) {
  if (!supabase) throw new Error('Supabase not configured')
  let query = supabase.from('batches').select('*').order('created_at', { ascending: false })
  if (householdId) query = query.eq('household_id', householdId)
  const { data, error } = await query
  if (error) throw error
  return data.map(fromRow)
}

export async function sbSaveBatch(batch, email, householdId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('batches')
    .upsert(toRow(batch, email, householdId))
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function sbCloseBatch(id) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase
    .from('batches')
    .update({ closed: true, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function sbDeleteBatch(id) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('batches').delete().eq('id', id)
  if (error) throw error
}

export async function sbPushAllBatches(batches, email, householdId) {
  if (!supabase || !householdId) return 0
  let pushed = 0
  for (const batch of batches) {
    const row = toRow({ ...batch, shared: 1, householdId }, email, householdId)
    const { error } = await supabase.from('batches').upsert(row)
    if (!error) pushed++
    else console.error('sbPushAllBatches failed:', batch.name, error.message)
  }
  return pushed
}

// ─── Household food helpers ───────────────────────────────────────────────────

export async function sbSaveFood(food, householdId) {
  if (!supabase || !householdId) return null
  const { data, error } = await supabase
    .from('household_foods')
    .upsert({
      id:            food.id,
      name:          food.name,
      source:        food.source || 'saved',
      per_100g:      food.per100g || null,
      serving_size:  food.servingSize || null,
      serving_label: food.servingLabel || null,
      barcode:       food.barcode || null,
      brand:         food.brand  || null,
      tags:          food.tags   || [],
      ingredients:   food.ingredients || [],
      household_id:  householdId,
      updated_at:    new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function sbFetchHouseholdFoods(householdId) {
  if (!supabase || !householdId) return []
  const { data, error } = await supabase
    .from('household_foods')
    .select('*')
    .eq('household_id', householdId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []).map(row => ({
    id:           row.id,
    name:         row.name,
    source:       row.source || 'saved',
    per100g:      row.per_100g      || null,
    servingSize:  row.serving_size  || null,
    servingLabel: row.serving_label || null,
    barcode:      row.barcode       || null,
    brand:        row.brand         || null,
    tags:         row.tags          || [],
    ingredients:  row.ingredients   || [],
    updatedAt:    row.updated_at    || null,
  }))
}

// ─── Household helpers ────────────────────────────────────────────────────────

function fromHouseholdRow(row) {
  return {
    id:         row.id,
    name:       row.name,
    code:       row.code,
    adminEmail: row.admin_email,
    members:    row.members || [],
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  }
}

export async function sbCreateHousehold(name, adminEmail, adminName) {
  if (!supabase) throw new Error('Supabase not configured')
  const id      = crypto.randomUUID()
  const code    = Math.random().toString(36).slice(2, 8).toUpperCase()
  const members = [{ email: adminEmail, name: adminName, joinedAt: new Date().toISOString() }]
  const { data, error } = await supabase
    .from('households')
    .insert({ id, name, code, admin_email: adminEmail, members })
    .select()
    .single()
  if (error) throw error
  return fromHouseholdRow(data)
}

export async function sbJoinHousehold(code, email, name) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: household, error } = await supabase
    .from('households')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .single()
  if (error || !household) throw new Error('Household not found — check your code')
  if (household.members.length >= HOUSEHOLD.maxMembers) throw new Error(`Household is full (max ${HOUSEHOLD.maxMembers} members)`)
  if (household.members.some(m => m.email === email)) {
    return fromHouseholdRow(household)
  }
  const newMembers = [...household.members, { email, name, joinedAt: new Date().toISOString() }]
  const { data, error: err2 } = await supabase
    .from('households')
    .update({ members: newMembers, updated_at: new Date().toISOString() })
    .eq('id', household.id)
    .select()
    .single()
  if (err2) throw err2
  return fromHouseholdRow(data)
}

export async function sbFetchHousehold(id) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('households')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return fromHouseholdRow(data)
}

export async function sbUpdateHousehold(household) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('households')
    .update({
      name:        household.name,
      admin_email: household.adminEmail,
      members:     household.members,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', household.id)
    .select()
    .single()
  if (error) throw error
  return fromHouseholdRow(data)
}

export async function sbLeaveHousehold(householdId, email) {
  if (!supabase) throw new Error('Supabase not configured')
  const household = await sbFetchHousehold(householdId)
  if (household.adminEmail === email) throw new Error('Transfer admin role before leaving')
  const newMembers = household.members.filter(m => m.email !== email)
  await sbUpdateHousehold({ ...household, members: newMembers })
}
