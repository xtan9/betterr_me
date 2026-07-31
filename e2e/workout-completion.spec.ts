import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import {
  E2E_READ_ONLY,
  RUN_CONTEXT,
} from './constants';
import { requiredE2EEnvironment } from './run-context';

test.describe('Workout completion journey', () => {
  test.skip(E2E_READ_ONLY, 'Stateful verification never runs against production-backed targets');
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'Workout completion is covered by the desktop Chromium project',
    );
  });

  let createdWorkoutId: string | undefined;

  test.afterEach(async () => {
    const workoutId = createdWorkoutId;
    createdWorkoutId = undefined;
    if (!workoutId) return;

    const supabase = createClient(
      requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_URL', 'teardown'),
      requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'teardown'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: RUN_CONTEXT.identityEmail(requiredE2EEnvironment('E2E_TEST_EMAIL', 'teardown')),
      password: requiredE2EEnvironment('E2E_TEST_PASSWORD', 'teardown'),
    });
    if (authError || !authData.user) {
      throw new Error(`workout cleanup auth failed: ${authError?.message ?? 'no user returned'}`);
    }

    const { error: deleteError } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId)
      .eq('user_id', authData.user.id);
    if (deleteError) throw new Error(`workout cleanup failed: ${deleteError.message}`);

    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw new Error(`workout cleanup sign-out failed: ${signOutError.message}`);
  });

  test('saves, finishes, and reads back a completed workout', async ({ page }) => {
    const workoutTitle = RUN_CONTEXT.ownedName('Workout Completion');

    await page.goto('/workouts');

    const startResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/workouts'
    ));
    await page.getByRole('button', { name: 'Start Workout', exact: true }).click();

    const startResponse = await startResponsePromise;
    const started = await startResponse.json() as {
      workout: { id: string; title: string; status: string };
    };
    const workoutId = started.workout.id;
    createdWorkoutId = workoutId;

    expect(startResponse.status(), JSON.stringify(started)).toBe(201);
    expect(started.workout.status).toBe('in_progress');

    await expect(page).toHaveURL(/\/workouts\/active$/);
    await page.reload();

    await page.getByRole('button', { name: 'Workout', exact: true }).click();
    const titleInput = page.getByRole('textbox').first();
    await expect(titleInput).toBeFocused();

    const updateResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'PATCH'
      && new URL(response.url()).pathname === `/api/workouts/${workoutId}`
    ));
    await titleInput.fill(workoutTitle);
    await titleInput.press('Enter');

    const updateResponse = await updateResponsePromise;
    const updated = await updateResponse.json() as {
      workout: { title: string };
    };
    expect(updateResponse.status(), JSON.stringify(updated)).toBe(200);
    expect(updated.workout.title).toBe(workoutTitle);

    await page.reload();
    await expect(page.getByRole('button', { name: workoutTitle, exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    const finishDialog = page.getByRole('alertdialog');
    await expect(finishDialog).toBeVisible();
    await expect(finishDialog.getByRole('heading', { name: 'Finish Workout?', exact: true })).toBeVisible();

    const finishResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'PATCH'
      && new URL(response.url()).pathname === `/api/workouts/${workoutId}`
    ));
    await finishDialog.getByRole('button', { name: 'Finish Workout', exact: true }).click();

    const finishResponse = await finishResponsePromise;
    const completed = await finishResponse.json() as {
      workout: { id: string; status: string; completed_at: string | null };
    };
    expect(finishResponse.status(), JSON.stringify(completed)).toBe(200);
    expect(completed.workout).toMatchObject({
      id: workoutId,
      status: 'completed',
    });
    expect(completed.workout.completed_at).not.toBeNull();
    await expect(page.getByRole('heading', { name: 'No active workout', exact: true })).toBeVisible();

    await page.goto('/workouts');
    await page.reload();
    const historyCard = page.getByRole('link').filter({ hasText: workoutTitle });
    await expect(historyCard).toBeVisible();
    await historyCard.click();

    await expect(page).toHaveURL(new RegExp(`/workouts/${workoutId}$`));
    await expect(page.getByRole('heading', { name: workoutTitle, exact: true })).toBeVisible();
    await expect(page.getByText(/Completed on/)).toBeVisible();
  });
});
