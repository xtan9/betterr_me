import { rmSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { E2E_READ_ONLY, FIXTURE_REGISTRY, RUN_CONTEXT } from './constants';
import { cleanupRegisteredFixtures, requiredE2EEnvironment } from './run-context';

async function globalTeardown() {
  if (E2E_READ_ONLY) {
    console.log(`[teardown] ${RUN_CONTEXT.runId} was read-only; no cleanup is needed`);
    return;
  }

  const supabase = createClient(
    requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_URL', 'teardown'),
    requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'teardown'),
  );
  const failures: Error[] = [];

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: RUN_CONTEXT.identityEmail(requiredE2EEnvironment('E2E_TEST_EMAIL', 'teardown')),
    password: requiredE2EEnvironment('E2E_TEST_PASSWORD', 'teardown'),
  });
  if (authError || !authData.user) {
    throw new Error(`[teardown] Auth failed: ${authError?.message ?? 'no user returned'}`);
  }

  try {
    await cleanupRegisteredFixtures(FIXTURE_REGISTRY, {
      habits: async (id) => {
        const recordFailures: string[] = [];
        const { error: logsError } = await supabase.from('habit_logs').delete().eq('habit_id', id);
        if (logsError) recordFailures.push(`log deletion failed: ${logsError.message}`);
        const { error: habitError } = await supabase.from('habits').delete().eq('id', id);
        if (habitError) recordFailures.push(`habit deletion failed: ${habitError.message}`);
        if (recordFailures.length > 0) throw new Error(recordFailures.join('; '));
      },
      tasks: async (id) => {
        const { error } = await supabase.from('tasks').delete().eq('id', id);
        if (error) throw new Error(`task deletion failed: ${error.message}`);
      },
    });
  } catch (error) {
    failures.push(error instanceof Error ? error : new Error(String(error)));
  }

  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) failures.push(new Error(`sign-out failed: ${signOutError.message}`));

  const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    failures.push(new Error('missing E2E_SUPABASE_SERVICE_ROLE_KEY for run identity cleanup'));
  } else {
    const admin = createClient(
      requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_URL', 'teardown'),
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error: identityError } = await admin.auth.admin.deleteUser(authData.user.id);
    if (identityError) failures.push(new Error(`identity deletion failed: ${identityError.message}`));
  }

  if (failures.length > 0) {
    throw new Error(
      `[teardown] Cleanup failed for ${RUN_CONTEXT.runId}:\n${failures.map((error) => error.message).join('\n')}`,
    );
  }

  rmSync(path.dirname(FIXTURE_REGISTRY), { force: true, recursive: true });
  console.log(`[teardown] Cleaned exact registered fixtures for ${RUN_CONTEXT.runId}`);
}

export default globalTeardown;
