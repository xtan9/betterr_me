import { createClient } from '@supabase/supabase-js';

const TEST_DATA_PREFIX = 'E2E Test -';

/**
 * Global teardown for E2E tests.
 * Deletes all habits (and their logs) matching the "E2E Test -" prefix
 * so each test run starts with a clean slate.
 */
async function globalTeardown() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const testEmail = process.env.E2E_TEST_EMAIL;
  const testPassword = process.env.E2E_TEST_PASSWORD;

  if (!supabaseUrl || !supabaseAnonKey || !testEmail || !testPassword) {
    console.warn('[teardown] Missing env vars — skipping cleanup');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (authError) {
    console.error('[teardown] Auth failed:', authError.message);
    return;
  }

  const { data: habits, error: fetchError } = await supabase
    .from('habits')
    .select('id, name')
    .ilike('name', `${TEST_DATA_PREFIX}%`);

  if (fetchError) {
    console.error('[teardown] Failed to fetch test habits:', fetchError.message);
    await supabase.auth.signOut();
    return;
  }

  if (!habits || habits.length === 0) {
    console.log('[teardown] No test habits to clean up');
    await supabase.auth.signOut();
    return;
  }

  const habitIds = habits.map((h) => h.id);
  console.log(`[teardown] Cleaning up ${habits.length} test habit(s)...`);

  // Delete logs first (FK constraint)
  const { error: logsError } = await supabase
    .from('habit_logs')
    .delete()
    .in('habit_id', habitIds);

  if (logsError) {
    console.error('[teardown] Failed to delete logs:', logsError.message);
  }

  const { error: deleteError } = await supabase
    .from('habits')
    .delete()
    .in('id', habitIds);

  if (deleteError) {
    console.error('[teardown] Failed to delete habits:', deleteError.message);
  } else {
    console.log(`[teardown] Cleaned up ${habits.length} test habit(s)`);
  }

  await supabase.auth.signOut();
}

export default globalTeardown;
