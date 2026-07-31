import { createClient } from '@supabase/supabase-js';
import { expect, test, type Download } from '@playwright/test';
import Papa from 'papaparse';
import {
  E2E_READ_ONLY,
  RUN_CONTEXT,
  SEED_HABIT_NAMES,
} from './constants';
import { createRunContext, requiredE2EEnvironment } from './run-context';

async function downloadText(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test.describe('Scoped export download', () => {
  test.skip(E2E_READ_ONLY, 'Export isolation requires disposable E2E state');

  test('downloads only the signed-in user\'s habits as CSV', async ({ page }, testInfo) => {
    const admin = createClient(
      requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_URL', 'setup'),
      requiredE2EEnvironment('E2E_SUPABASE_SERVICE_ROLE_KEY', 'setup'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const secondUser = createClient(
      requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_URL', 'setup'),
      requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'setup'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const secondRun = createRunContext(
      `${RUN_CONTEXT.runId}-export-neighbor-${testInfo.retry}-${testInfo.parallelIndex}`,
    );
    const secondUserEmail = secondRun.identityEmail(
      requiredE2EEnvironment('E2E_TEST_EMAIL', 'setup'),
    );
    const secondUserHabitName = `E2E Test - ${secondRun.runId} - Must Not Export`;
    let secondUserId: string | undefined;
    let secondUserHabitId: string | undefined;
    let secondUserAuthenticated = false;

    try {
      const { data: userData, error: userError } = await admin.auth.admin.createUser({
        email: secondUserEmail,
        password: requiredE2EEnvironment('E2E_TEST_PASSWORD', 'setup'),
        email_confirm: true,
      });
      if (userError || !userData.user) {
        throw new Error(`Failed to create export neighbor: ${userError?.message ?? 'no user returned'}`);
      }
      secondUserId = userData.user.id;

      const { error: signInError } = await secondUser.auth.signInWithPassword({
        email: secondUserEmail,
        password: requiredE2EEnvironment('E2E_TEST_PASSWORD', 'setup'),
      });
      if (signInError) {
        throw new Error(`Failed to authenticate export neighbor: ${signInError.message}`);
      }
      secondUserAuthenticated = true;

      const { data: habit, error: habitError } = await secondUser
        .from('habits')
        .insert({
          user_id: secondUserId,
          name: secondUserHabitName,
          description: `Owned by neighboring functional run ${secondRun.runId}`,
          frequency: { type: 'daily' },
        })
        .select('id')
        .single();
      if (habitError || !habit) {
        throw new Error(`Failed to create export neighbor habit: ${habitError?.message}`);
      }
      secondUserHabitId = habit.id;

      await page.goto('/dashboard/settings');
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: /export habits/i }).click();
      const download = await downloadPromise;
      const artifact = await downloadText(download);
      const parsedArtifact = Papa.parse<{ name: string }>(artifact, {
        header: true,
        skipEmptyLines: true,
      });
      const exportedNames = parsedArtifact.data.map(({ name }) => name).sort();

      expect(download.suggestedFilename()).toMatch(
        /^betterrme-habits-\d{4}-\d{2}-\d{2}\.csv$/,
      );
      expect(parsedArtifact.errors).toEqual([]);
      expect(parsedArtifact.meta.fields).toEqual([
        'id',
        'name',
        'description',
        'category_id',
        'frequency_type',
        'frequency_details',
        'status',
        'current_streak',
        'best_streak',
        'created_at',
      ]);
      expect(exportedNames).toEqual([...SEED_HABIT_NAMES].sort());
      expect(exportedNames).not.toContain(secondUserHabitName);
    } finally {
      const cleanupFailures: string[] = [];
      if (secondUserHabitId) {
        const { error } = await secondUser.from('habits').delete().eq('id', secondUserHabitId);
        if (error) cleanupFailures.push(`habit cleanup failed: ${error.message}`);
      }
      if (secondUserAuthenticated) {
        const { error } = await secondUser.auth.signOut();
        if (error) cleanupFailures.push(`sign-out failed: ${error.message}`);
      }
      if (secondUserId) {
        const { error } = await admin.auth.admin.deleteUser(secondUserId);
        if (error) cleanupFailures.push(`identity cleanup failed: ${error.message}`);
      }
      if (cleanupFailures.length > 0) {
        throw new Error(`Export fixture cleanup failed:\n${cleanupFailures.join('\n')}`);
      }
    }
  });
});
