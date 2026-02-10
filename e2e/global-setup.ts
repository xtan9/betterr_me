import { createClient } from '@supabase/supabase-js';

const SEED_HABITS = [
  { name: 'E2E Test - Seed Habit 1', category: 'health' },
  { name: 'E2E Test - Seed Habit 2', category: 'wellness' },
  { name: 'E2E Test - Seed Habit 3', category: 'learning' },
];

const SEED_TASKS = [
  {
    title: 'E2E Test - Seed Task 1',
    description: 'Seeded for E2E testing',
    priority: 2,
    category: 'work',
    is_completed: false,
  },
];

/**
 * Global setup for E2E tests.
 * Seeds the test account with a few habits so that tests expecting
 * checkboxes on the dashboard (complete-habit, accessibility, cross-browser)
 * always have something to interact with — even when running in parallel
 * before create-habit tests have finished.
 */
async function globalSetup() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const testEmail = process.env.E2E_TEST_EMAIL;
    const testPassword = process.env.E2E_TEST_PASSWORD;

    if (!supabaseUrl || !supabaseAnonKey || !testEmail || !testPassword) {
      console.warn('[setup] Missing env vars — skipping seed');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (authError || !authData.user) {
      throw new Error(`[setup] Auth failed: ${authError?.message}`);
    }

    const userId = authData.user.id;

    try {
      // Check which seed habits already exist
      const { data: existing } = await supabase
        .from('habits')
        .select('name')
        .eq('user_id', userId)
        .in('name', SEED_HABITS.map((h) => h.name));

      const existingNames = new Set((existing ?? []).map((h) => h.name));
      const toInsert = SEED_HABITS.filter((h) => !existingNames.has(h.name));

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from('habits').insert(
          toInsert.map((h) => ({
            user_id: userId,
            name: h.name,
            description: 'Seeded for E2E testing',
            category: h.category,
            frequency: { type: 'daily' },
          }))
        );

        if (insertError) {
          console.error('[setup] Failed to seed habits:', insertError.message);
        } else {
          console.log(`[setup] Seeded ${toInsert.length} habit(s)`);
        }
      } else {
        console.log('[setup] Seed habits already exist — skipping');
      }

      // --- Seed tasks ---
      const { data: existingTasks } = await supabase
        .from('tasks')
        .select('title')
        .eq('user_id', userId)
        .in('title', SEED_TASKS.map((t) => t.title));

      const existingTaskTitles = new Set((existingTasks ?? []).map((t) => t.title));
      const tasksToInsert = SEED_TASKS.filter((t) => !existingTaskTitles.has(t.title));

      if (tasksToInsert.length === 0) {
        console.log('[setup] Seed tasks already exist — skipping');
      } else {
        const { error: taskInsertError } = await supabase.from('tasks').insert(
          tasksToInsert.map((t) => ({
            user_id: userId,
            title: t.title,
            description: t.description,
            priority: t.priority,
            category: t.category,
            is_completed: t.is_completed,
          }))
        );

        if (taskInsertError) {
          console.error('[setup] Failed to seed tasks:', taskInsertError.message);
        } else {
          console.log(`[setup] Seeded ${tasksToInsert.length} task(s)`);
        }
      }
    } finally {
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.error('[setup] Unexpected error during seeding:', err);
  }
}

export default globalSetup;
