import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import {
  E2E_READ_ONLY,
  RUN_CONTEXT,
} from './constants';
import { requiredE2EEnvironment } from './run-context';

test.describe('Current Profile preference journey', () => {
  test.skip(E2E_READ_ONLY, 'Stateful verification never runs against production-backed targets');
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium',
      'The Current Profile acceptance journey is covered by desktop Chromium',
    );

    for (const path of ['/api/profile', '/api/profile/preferences']) {
      await page.route(`**${path}`, async () => {
        throw new Error(`Legacy Profile client path was requested: ${path}`);
      });
    }
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
      throw new Error(`Current Profile cleanup auth failed: ${authError?.message ?? 'no user returned'}`);
    }

    const { error: deleteError } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId)
      .eq('user_id', authData.user.id);
    if (deleteError) throw new Error(`Current Profile cleanup failed: ${deleteError.message}`);

    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) throw new Error(`Current Profile cleanup sign-out failed: ${signOutError.message}`);
  });

  test('changes Weight Unit in Settings and renders an existing workout in pounds without reload', async ({ page }) => {
    const workoutTitle = RUN_CONTEXT.ownedName('Current Profile Weight Unit');

    const startResponse = await page.request.post('/api/workouts', {
      data: { title: workoutTitle },
    });
    expect(startResponse.status()).toBe(201);
    const started = await startResponse.json() as {
      workout: { id: string };
    };
    createdWorkoutId = started.workout.id;

    const exercisesResponse = await page.request.get('/api/exercises');
    expect(exercisesResponse.status()).toBe(200);
    const exercisesBody = await exercisesResponse.json() as {
      exercises: Array<{ id: string; exercise_type: string }>;
    };
    const weightExercise = exercisesBody.exercises.find(
      (exercise) => exercise.exercise_type === 'weight_reps',
    );
    expect(weightExercise).toBeDefined();

    const addExerciseResponse = await page.request.post(
      `/api/workouts/${createdWorkoutId}/exercises`,
      { data: { exercise_id: weightExercise!.id } },
    );
    expect(addExerciseResponse.status()).toBe(201);
    const addedExercise = await addExerciseResponse.json() as {
      exercise: { id: string };
    };

    const addSetResponse = await page.request.post(
      `/api/workouts/${createdWorkoutId}/exercises/${addedExercise.exercise.id}/sets`,
      { data: { weight_kg: 10, reps: 5, is_completed: true } },
    );
    expect(addSetResponse.status()).toBe(201);

    const finishResponse = await page.request.patch(`/api/workouts/${createdWorkoutId}`, {
      data: { status: 'completed' },
    });
    expect(finishResponse.status()).toBe(200);

    await page.goto('/dashboard/settings');
    let documentNavigations = 0;
    page.on('request', (request) => {
      if (request.isNavigationRequest() && request.resourceType() === 'document') {
        documentNavigations += 1;
      }
    });
    const poundsOption = page.getByRole('radio', { name: 'Pounds (lbs)', exact: true });
    await expect(poundsOption).toBeVisible();
    await poundsOption.click();

    const saveResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/preferences/fitness'
    ));
    const saveButton = page.getByRole('button', { name: 'Save', exact: true }).nth(1);
    await saveButton.click();
    const saveResponse = await saveResponsePromise;
    expect(saveResponse.status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

    // Navigate through the authenticated app shell without reloading the page.
    await page.getByRole('link', { name: 'Workouts', exact: true }).click();
    await expect(page).toHaveURL(/\/workouts$/);

    const historyCard = page.getByRole('link').filter({ hasText: workoutTitle });
    await expect(historyCard).toBeVisible();
    await historyCard.click();

    await expect(page).toHaveURL(new RegExp(`/workouts/${createdWorkoutId}$`));
    expect(documentNavigations).toBe(0);
    await expect(page.getByText('LBS', { exact: true })).toBeVisible();
    await expect(page.getByText('22.05', { exact: true })).toBeVisible();
  });
});
