import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

/** Uses only the existing isolated runner's generated accounts and cleanup. */
export async function verifyPriorResults({ origin, a, b, request, sql, completion, presetId, artifactDirectory }) {
  const cases = [];
  const passed = name => { cases.push(name); writeFileSync(resolve(artifactDirectory, 'train-420-reader-cases.json'), JSON.stringify({ cases }, null, 2)); };
  const endpoint = '/api/mobile/train/prior-results';
  const target = { identity: { kind: 'catalog', catalogKey: completion.exercises[0].definition.catalogKey },
    mode: 'weight_reps', equipment: 'barbell', convention: 'barbell-total' };
  const query = { protocolVersion: 1, ownerId: a.id, target, excludeWorkoutId: null, before: null };
  const initial = await request(endpoint, a, query);
  expect(initial.status).toBe('found');
  expect(initial.result.workout.id).toBe(completion.id);
  expect(initial.result.groups[0].sets[0].performed.weightKg).toBe(0.123);
  expect(await request('/api/workouts/prior-results', a, query, 200, true)).toEqual(initial);
  expect((await request(endpoint, b, query, 403)).error.code).toBe('owner_mismatch');
  expect((await request(endpoint, b, { ...query, ownerId: b.id })).status).toBe('exhausted');
  expect((await request(endpoint, a, { ...query, before: { startedAt: 'tomorrow', id: randomUUID() } }, 400)).error.code).toBe('invalid_request');
  passed('v4 native/cookie capture and owner isolation');

  const upload = async document => request('/api/mobile/train/completions', a,
    { protocolVersion: 1, operationId: document.id, completion: document });
  const { templateOrigin: _origin, ...base } = completion;
  const old = { ...base, version: 1, id: randomUUID(), sourceId: randomUUID(),
    exercises: [{ id: randomUUID(), definition: completion.exercises[0].definition,
      sets: [{ id: randomUUID(), performed: { weightKg: 0.123, reps: 5, kind: 'warmup' } }] }] };
  await upload(old);
  const oldResult = await request(endpoint, a, { ...query, excludeWorkoutId: completion.id });
  expect(oldResult.result.workout.id).toBe(old.id);
  expect(oldResult.result.groups[0].sets[0].performed).toEqual({ mode: 'weight_reps', weightKg: 0.123, reps: 5, kind: 'warmup' });
  passed('v1 projected performed shape');

  const duplicate = { ...base, version: 2, id: randomUUID(), sourceId: randomUUID(),
    startedAt: '2026-10-25T10:01:00.123455Z', completedAt: '2026-10-25T10:06:00.123455Z',
    exercises: [0, 1].map(index => ({ id: randomUUID(), definition: completion.exercises[0].definition,
      sets: [{ id: randomUUID(), performed: { mode: 'weight_reps', weightKg: index ? 0.45359237 : 0.123, reps: index ? 8 : 5, kind: index ? 'working' : 'warmup' } }] })) };
  await upload(duplicate);
  // Ordinary historical rows have actual performed facts but no captured meaning.
  // One transaction satisfies the normal deferred completion constraint.
  const legacy = Array.from({ length: 21 }, () => ({ workout: randomUUID(), entry: randomUUID(), set: randomUUID() }));
  sql(`begin;
    ${legacy.map(item => `insert into public.workouts(id,user_id,status,started_at,completed_at,duration_seconds)
      values('${item.workout}','${a.id}','completed','2026-10-25T10:01:00.123456Z','2026-10-25T10:06:00.123456Z',300);
      insert into public.workout_exercises(id,workout_id,exercise_id,sort_order) values('${item.entry}','${item.workout}','${presetId}',0);
      insert into public.workout_sets(id,workout_exercise_id,set_number,set_type,weight_kg,reps,is_completed)
      values('${item.set}','${item.entry}',1,'normal',200,10,true);`).join('\n')}
    commit;`);
  const first = await request(endpoint, a, query);
  const ordered = legacy.map(item => item.workout).sort().reverse();
  expect(first).toEqual({ protocolVersion: 1, ownerId: a.id, status: 'searching', observedWorkoutIds: ordered.slice(0, 20),
    nextCursor: { startedAt: '2026-10-25T10:01:00.123456+00:00', id: ordered[19] } });
  const second = await request(endpoint, a, { ...query, before: first.nextCursor });
  expect(second.status).toBe('found');
  expect(second.observedWorkoutIds).toEqual([ordered[20], duplicate.id]);
  expect(second.result.workout.startedAt).toBe('2026-10-25T10:01:00.123455+00:00');
  expect(second.result.groups).toEqual(duplicate.exercises.map(entry => ({ exerciseEntryId: entry.id, definition: entry.definition,
    sets: entry.sets.map(set => ({ setId: set.id, performed: set.performed })) })));
  passed('21 legacy parents with exact microsecond cursor and duplicate v2 groups');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(a.cookies.map(cookie => ({ ...cookie, url: origin })));
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  let browserWorkoutId;
  try {
    await request('/api/preferences/fitness', a, { type: 'setWeightUnit', weightUnit: 'kg' }, 200, true);
    await page.goto(`${origin}/workouts`);
    await expect(page.getByRole('button', { name: 'Start Workout', exact: true })).toBeVisible({ timeout: 60_000 });
    const response = (path, method = 'POST') => page.waitForResponse(value => new URL(value.url()).pathname === path && value.request().method() === method);
    const started = response('/api/workouts');
    await page.getByRole('button', { name: 'Start Workout', exact: true }).click();
    const active = (await (await started).json()).workout; browserWorkoutId = active.id;
    await expect(page).toHaveURL(/\/workouts\/active$/);
    // Match the established completion journey's persisted Start readback;
    // the pre-existing overview cache can still hold its earlier empty result.
    await page.reload();
    await page.getByRole('button', { name: 'Add Exercise', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Search exercises...').fill('Barbell Bench Press');
    const added = response(`/api/workouts/${active.id}/exercises`);
    await dialog.getByRole('button', { name: /^Barbell Bench Press/ }).click();
    const entry = (await (await added).json()).exercise;
    const setsPath = `/api/workouts/${active.id}/exercises/${entry.id}/sets`;
    const created = response(setsPath);
    await page.getByRole('button', { name: '+ Add Set', exact: true }).click();
    const set = (await (await created).json()).set;
    const setPath = `${setsPath}/${set.id}`;
    const before = (await request('/api/workouts/active', a, undefined, 200, true)).workout;
    const writes = [];
    page.on('request', value => { if (value.method() === 'PATCH' && new URL(value.url()).pathname === setPath) writes.push(value.postDataJSON()); });
    await page.getByRole('button', { name: 'Previous results', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Continue search', exact: true }).click();
    await expect(dialog.getByText('Exercise occurrence 2', { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    await page.route('**/api/workouts/prior-results', route => route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ protocolVersion: 1, ownerId: a.id, status: 'unavailable', reason: 'service_unavailable' }) }), { times: 1 });
    await dialog.getByRole('button', { name: 'Refresh reference', exact: true }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByText('Exercise occurrence 2', { exact: true })).toBeVisible();
    await page.route(`**${setPath}`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture interruption' }) }), { times: 1 });
    await dialog.getByRole('button', { name: 'Use these measurements', exact: true }).first().click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    expect((await request('/api/workouts/active', a, undefined, 200, true)).workout.exercises[0].sets).toEqual(before.exercises[0].sets);
    const copied = response(setPath, 'PATCH');
    await dialog.getByRole('button', { name: 'Use these measurements', exact: true }).first().click();
    expect((await copied).status()).toBe(200);
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Weight (kg)', exact: true })).toHaveValue('0.123');
    await expect(page.getByRole('textbox', { name: 'Reps', exact: true })).toHaveValue('5');
    const after = (await request('/api/workouts/active', a, undefined, 200, true)).workout;
    expect(after.exercises[0].sets).toHaveLength(1);
    expect(after.exercises[0].rest_timer_seconds).toBe(before.exercises[0].rest_timer_seconds);
    expect(after.exercises[0].sets[0]).toMatchObject({ id: set.id, weight_kg: 0.123, reps: 5, is_completed: false, set_type: set.set_type });
    expect(writes).toEqual([{ weight_kg: 0.123, reps: 5 }, { weight_kg: 0.123, reps: 5 }]);
    await page.screenshot({ path: resolve(artifactDirectory, 'train-420-web-reuse.png'), fullPage: true });
    passed('Chromium explicit copy and transient failures preserve unfinished target/kind/rest');
  } catch (error) {
    await page.screenshot({ path: resolve(artifactDirectory, 'train-420-web-failure.png'), fullPage: true });
    writeFileSync(resolve(artifactDirectory, 'train-420-web-failure.txt'), await page.locator('body').innerText());
    throw error;
  } finally {
    await browser.close();
    if (browserWorkoutId) expect((await a.client.from('workouts').delete().eq('id', browserWorkoutId)).error).toBeNull();
  }

  const operationId = randomUUID();
  const created = await request('/api/mobile/train/exercises/commands', a, { protocolVersion: 1, operationId,
    command: { kind: 'create', definition: { name: 'Captured custom name', equipment: 'barbell', mode: 'weight_reps',
      convention: 'barbell-total', primaryMuscle: 'other', secondaryMuscles: [] } } });
  const custom = created.receipt.definition;
  const customCompletion = { ...base, version: 3, id: randomUUID(), sourceId: randomUUID(),
    exercises: [{ id: randomUUID(), definition: { reference: { kind: 'custom', exerciseId: custom.id, ownerId: a.id },
      name: custom.name, mode: custom.mode, equipment: custom.equipment, convention: custom.convention },
      sets: [{ id: randomUUID(), performed: { mode: 'weight_reps', weightKg: 0.123, reps: 5, kind: 'working' } }] }] };
  await upload(customCompletion);
  const renamed = await request('/api/mobile/train/exercises/commands', a, { protocolVersion: 1, operationId: randomUUID(),
    command: { kind: 'update-metadata', exerciseId: custom.id, expectedVersion: custom.version, patch: { name: 'Renamed current custom' } } });
  await request('/api/mobile/train/exercises/commands', a, { protocolVersion: 1, operationId: randomUUID(),
    command: { kind: 'archive', exerciseId: custom.id, expectedVersion: renamed.receipt.definition.version } });
  const customQuery = { ...query, target: { ...target, identity: { kind: 'custom', exerciseId: custom.id, ownerId: a.id } } };
  let customResult = await request(endpoint, a, customQuery);
  while (customResult.status === 'searching') customResult = await request(endpoint, a, { ...customQuery, before: customResult.nextCursor });
  expect(customResult.result.workout.id).toBe(customCompletion.id);
  expect(customResult.result.groups[0].definition.name).toBe('Captured custom name');
  expect((await request(endpoint, b, { ...customQuery, ownerId: b.id })).reason).toBe('definition_unavailable');
  passed('v3 renamed archived custom capture and foreign reference');
  return { cases,
    workoutIds: [completion.id, old.id, duplicate.id, ...legacy.map(item => item.workout), customCompletion.id] };
}
