import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null

// ─── Batch helpers ────────────────────────────────────────────────────────────

function toRow(batch, email) {
  return {
    id:              batch.id,
    name:            batch.name,
    created_by:      email || batch.createdBy || '',
    shared:          batch.shared === 1 || batch.shared === true,
    closed:          batch.closed === 1 || batch.closed === true,
    ingredients:     batch.ingredients || [],
    yield_grams:     batch.yieldGrams   || null,
    macros_per_100g: batch.macrosPer100g || null,
    updated_at:      new Date().toISOString(),
  }
}

function fromRow(row) {
  return {
    id:           row.id,
    name:         row.name,
    createdBy:    row.created_by,
    shared:       row.shared ? 1 : 0,
    closed:       row.closed ? 1 : 0,
    ingredients:  row.ingredients  || [],
    yieldGrams:   row.yield_grams  || 0,
    macrosPer100g: row.macros_per_100g || null,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    dirty:        0,
  }
}

export async function sbFetchBatches() {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

export async function sbSaveBatch(batch, email) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('batches')
    .upsert(toRow(batch, email))
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
