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
  if (!supabase || !householdId) return []
  const { data, error } = await supabase
    .from('batches').select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
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

export async function sbReopenBatch(id) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase
    .from('batches')
    .update({ closed: false, updated_at: new Date().toISOString() })
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
      per_100g:      food.per100g      || null,
      serving_size:  food.servingSize  || null,
      serving_label: food.servingLabel || null,
      ingredients:   (food.ingredients?.length > 0) ? food.ingredients : null,
      household_id:  householdId,
      updated_at:    new Date().toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function sbDeleteFood(id) {
  if (!supabase) return
  const { error } = await supabase.from('household_foods').delete().eq('id', id)
  if (error) throw error
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

// ─── Profile helpers ──────────────────────────────────────────────────────────

export async function sbSaveProfile(profile) {
  if (!supabase || !profile?.email) return
  const row = {
    id:              profile.id,
    email:           profile.email.toLowerCase(),
    name:            profile.name            || null,
    height:          profile.height          || null,
    macro_goals:     profile.macroGoals      || null,
    supplements:     profile.supplements     || [],
    ai_instructions: profile.aiInstructions  || null,
    settings:        profile.settings        || null,
    household_id:    profile.householdId     || null,
    encryption_salt: profile.encryptionSalt  || null,
    updated_at:      new Date().toISOString(),
  }
  if (profile.healthSyncToken) row.health_sync_token = profile.healthSyncToken
  const { error } = await supabase.from('profiles').upsert(row)
  if (error) {
    // If health_sync_token column doesn't exist yet, retry without it
    if (error.message?.includes('health_sync_token')) {
      delete row.health_sync_token
      const { error: e2 } = await supabase.from('profiles').upsert(row)
      if (e2) console.warn('sbSaveProfile error:', e2.message)
    } else {
      console.warn('sbSaveProfile error:', error.message)
    }
  }
}

export async function sbFetchProfile(email) {
  if (!supabase || !email) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email.toLowerCase())
    .single()
  if (error || !data) return null
  return {
    id:              data.id,
    email:           data.email,
    name:            data.name            || '',
    height:          data.height          || null,
    macroGoals:      data.macro_goals     || { calories:2000, protein:150, carbs:200, fat:65, fibre:30 },
    supplements:     data.supplements     || [],
    aiInstructions:  data.ai_instructions || null,
    settings:        data.settings        || { autoLockMinutes:0, shareFoodNamesWithAI:true, shareMedNamesWithAI:false, wifiOnlyPhotos:true },
    householdId:     data.household_id    || null,
    encryptionSalt:  data.encryption_salt || null,
    healthSyncToken: data.health_sync_token || null,
    skipPin:         true,
    dirty:           0,
  }
}

// ─── Health sync (iOS Shortcut → Supabase → PWA) ─────────────────────────────

export async function sbUpsertHealthSync(token, steps, cal, date) {
  if (!supabase || !token) return
  const { error } = await supabase
    .from('health_sync')
    .upsert({ token, steps, cal, date, updated_at: new Date().toISOString() }, { onConflict: 'token' })
  if (error) throw error
}

export async function sbFetchHealthSync(token) {
  if (!supabase || !token) return null
  const { data, error } = await supabase
    .from('health_sync')
    .select('steps, cal, date')
    .eq('token', token)
    .single()
  if (error || !data) return null
  return data
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

export async function sbFetchUserHousehold(email) {
  if (!supabase || !email) return null
  const { data } = await supabase
    .from('households')
    .select('id')
    .contains('members', [{ email: email.toLowerCase() }])
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

export async function sbLeaveHousehold(householdId, email) {
  if (!supabase) throw new Error('Supabase not configured')
  const household = await sbFetchHousehold(householdId)
  if (household.adminEmail === email) throw new Error('Transfer admin role before leaving')
  const newMembers = household.members.filter(m => m.email !== email)
  await sbUpdateHousehold({ ...household, members: newMembers })
}

// ─── Personal user data (food logs, weight, workouts, etc.) ──────────────────
// Stored in user_data table keyed by (user_id, table_name, month_key).
// Monthly tables use 'YYYY-MM' as month_key; single-blob tables use 'all'.
// Requires this table in Supabase:
//   CREATE TABLE user_data (
//     user_id    text, table_name text, month_key text,
//     data       jsonb not null default '[]',
//     updated_at timestamptz default now(),
//     PRIMARY KEY (user_id, table_name, month_key)
//   );
//   ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "allow_all" ON user_data FOR ALL USING (true) WITH CHECK (true);

export async function sbPushUserData(userId, tableName, monthKey, data) {
  if (!supabase || !userId || !Array.isArray(data)) return
  const { error } = await supabase
    .from('user_data')
    .upsert({
      user_id:    userId,
      table_name: tableName,
      month_key:  monthKey,
      data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,table_name,month_key' })
  if (error) throw error
}

export async function sbFetchAllUserData(userId) {
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('user_data')
    .select('table_name, month_key, data')
    .eq('user_id', userId)
  if (error || !data) return []
  return data
}
