-- Nourish — Supabase Row Level Security policies
-- Run this in the Supabase SQL Editor (https://app.supabase.com → project → SQL Editor)
--
-- NOTE: This app uses the anon key with client-supplied user IDs rather than
-- Supabase native auth (auth.uid()). These policies are therefore the best we
-- can do without migrating to Supabase Auth.  They prevent:
--   • Table scans without a valid non-null key field
--   • Writes with missing required fields
-- They do NOT prevent a determined attacker who already has the anon key from
-- reading other users' data.  A full fix requires integrating Supabase Auth.
--
-- After running, rotate your Supabase anon key in:
--   Supabase dashboard → Project Settings → API → Regenerate anon key
-- Then update VITE_SUPABASE_ANON_KEY in Vercel and in .env.local.

-- ─── user_data ────────────────────────────────────────────────────────────────
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON user_data;
CREATE POLICY "user_data_nonempty_user" ON user_data
  FOR ALL TO anon
  USING  (user_id IS NOT NULL AND user_id <> '')
  WITH CHECK (user_id IS NOT NULL AND user_id <> '');

-- ─── profiles ─────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON profiles;
CREATE POLICY "profiles_read" ON profiles
  FOR SELECT TO anon USING (true);
CREATE POLICY "profiles_write" ON profiles
  FOR INSERT TO anon
  WITH CHECK (email IS NOT NULL AND email <> '');
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO anon
  USING (email IS NOT NULL AND email <> '');

-- ─── batches ──────────────────────────────────────────────────────────────────
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON batches;
CREATE POLICY "batches_household" ON batches
  FOR ALL TO anon
  USING  (household_id IS NOT NULL)
  WITH CHECK (household_id IS NOT NULL);

-- ─── household_foods ──────────────────────────────────────────────────────────
ALTER TABLE household_foods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON household_foods;
CREATE POLICY "household_foods_household" ON household_foods
  FOR ALL TO anon
  USING  (household_id IS NOT NULL)
  WITH CHECK (household_id IS NOT NULL);

-- ─── households ───────────────────────────────────────────────────────────────
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON households;
CREATE POLICY "households_read" ON households
  FOR SELECT TO anon USING (true);
CREATE POLICY "households_insert" ON households
  FOR INSERT TO anon
  WITH CHECK (admin_email IS NOT NULL AND admin_email <> '');
CREATE POLICY "households_update" ON households
  FOR UPDATE TO anon
  USING (true);

-- ─── health_sync ──────────────────────────────────────────────────────────────
ALTER TABLE health_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON health_sync;
CREATE POLICY "health_sync_token_required" ON health_sync
  FOR ALL TO anon
  USING  (token IS NOT NULL AND token <> '')
  WITH CHECK (token IS NOT NULL AND token <> '');
