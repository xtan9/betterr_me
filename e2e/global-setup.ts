import { createClient } from '@supabase/supabase-js';
import {
  E2E_READ_ONLY,
  FIXTURE_REGISTRY,
  RUN_CONTEXT,
  SEED_HABIT_NAMES,
  SEED_TASK_TITLE,
} from './constants';
import { registerFixtureId, requiredE2EEnvironment } from './run-context';

async function globalSetup() {
  if (E2E_READ_ONLY) {
    console.log(`[setup] ${RUN_CONTEXT.runId} is read-only; no fixtures will be created`);
    return;
  }

  const supabase = createClient(
    requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_URL', 'setup'),
    requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'setup'),
  );
  let primaryFailure: unknown;

  try {
    const password = requiredE2EEnvironment('E2E_TEST_PASSWORD', 'setup');
    const email = RUN_CONTEXT.identityEmail(
      requiredE2EEnvironment('E2E_TEST_EMAIL', 'setup'),
    );
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError && !/already registered/i.test(signUpError.message)) {
      throw new Error(`[setup] Failed to create run identity: ${signUpError.message}`);
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError || !authData.user) {
      throw new Error(`[setup] Auth failed: ${authError?.message ?? 'no user returned'}`);
    }

    const { data: habits, error: habitError } = await supabase
      .from('habits')
      .insert(SEED_HABIT_NAMES.map((name) => ({
        user_id: authData.user.id,
        name,
        description: `Owned by functional run ${RUN_CONTEXT.runId}`,
        frequency: { type: 'daily' },
      })))
      .select('id');
    if (habitError || habits?.length !== SEED_HABIT_NAMES.length) {
      throw new Error(`[setup] Failed to seed run-owned habits: ${habitError?.message ?? 'incomplete insert'}`);
    }
    for (const habit of habits) registerFixtureId(FIXTURE_REGISTRY, 'habits', habit.id);

    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .insert({
        user_id: authData.user.id,
        title: SEED_TASK_TITLE,
        description: `Owned by functional run ${RUN_CONTEXT.runId}`,
        priority: 2,
        is_completed: false,
      })
      .select('id');
    if (taskError || tasks?.length !== 1) {
      throw new Error(`[setup] Failed to seed run-owned task: ${taskError?.message ?? 'incomplete insert'}`);
    }
    registerFixtureId(FIXTURE_REGISTRY, 'tasks', tasks[0].id);

    console.log(
      `[setup] Seeded ${habits.length} habits and ${tasks.length} task for ${RUN_CONTEXT.runId}`,
    );
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError && !primaryFailure) {
      throw new Error(`[setup] Sign-out failed: ${signOutError.message}`);
    }
    if (signOutError) console.error('[setup] Sign-out also failed:', signOutError.message);
  }
}

export default globalSetup;
