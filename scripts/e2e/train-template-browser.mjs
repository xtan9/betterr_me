import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

/** Real browser → cookie routes → the runner's disposable local database. */
export async function verifyTemplateBrowser({ origin, user, request, legacyTemplateId, artifactDirectory }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(user.cookies.map(cookie => ({ ...cookie, url: origin })));
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const diagnostics = [];
  page.on('pageerror', error => diagnostics.push({ type: 'pageerror', name: error.name, message: error.message.slice(0, 300) }));
  page.on('request', value => {
    const url = new URL(value.url());
    if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/_next')) diagnostics.push({ type:'request', path:url.pathname, method:value.method() });
  });
  page.on('response', value => {
    const url = new URL(value.url());
    if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/_next')) diagnostics.push({ type:'response', path:url.pathname, status:value.status() });
  });
  const commandsPath = '/api/routines/templates/commands';
  const response = (path, method = 'POST') => page.waitForResponse(value => new URL(value.url()).pathname === path && value.request().method() === method);
  const card = name => page.locator('[data-slot="card"]').filter({ has: page.getByRole('heading', { name, exact: true }) });
  async function loseResponse(action) {
    let observed, failed;
    const received = new Promise((done, reject) => { observed = done; failed = reject; });
    const timeout = setTimeout(() => failed(new Error('Expected browser command was not observed')), 60_000);
    timeout.unref();
    await page.route(`**${commandsPath}`, async route => {
      try {
        const result = await route.fetch();
        expect(result.status()).toBe(200);
        observed({ request: route.request().postDataJSON(), body: await result.json() });
      } catch (error) { failed(error); }
      finally { await route.abort('failed'); }
    }, { times: 1 });
    try { await action(); return await received; }
    finally { clearTimeout(timeout); }
  }
  try {
    // Fixture setup declares the preferred unit; the actual template fields
    // and persistence below still run through the normal UI and real routes.
    await request('/api/preferences/fitness', user, { type: 'setWeightUnit', weightUnit: 'kg' }, 200, true);
    await page.goto(`${origin}/workouts/routines`);
    const legacyBefore = await request(`/api/mobile/train/templates/${legacyTemplateId}`, user);
    await card('A compatible routine').getByRole('button', { name: 'Edit', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('textbox', { name: 'Repetitions', exact: true }).first()).toHaveValue('0');
    await dialog.getByRole('textbox', { name: 'Notes', exact: true }).fill('Metadata edit keeps legacy zeros');
    const metadata = response(commandsPath);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await metadata).status()).toBe(200);
    await expect(dialog).not.toBeVisible();
    expect((await request(`/api/mobile/train/templates/${legacyTemplateId}`, user)).template.entries).toEqual(legacyBefore.template.entries);
    await page.getByRole('button', { name: 'Create Routine', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser ordered targets');
    await dialog.getByRole('button', { name: 'Add Exercise', exact: true }).click();
    await dialog.getByRole('button', { name: 'Barbell Bench Press', exact: true }).click();
    const entry = dialog.getByRole('group', { name: 'Barbell Bench Press · 1', exact: true });
    await entry.getByRole('textbox', { name: 'Load (kg)', exact: true }).nth(0).fill('0.123');
    await entry.getByRole('textbox', { name: 'Repetitions', exact: true }).nth(0).fill('5');
    await entry.getByRole('textbox', { name: 'Load (kg)', exact: true }).nth(1).fill('2.5');
    await entry.getByRole('textbox', { name: 'Repetitions', exact: true }).nth(1).fill('7');
    await entry.getByRole('combobox', { name: 'Targets', exact: true }).nth(1).selectOption('warmup');
    await entry.getByRole('group', { name: 'Targets 2', exact: true }).getByRole('button', { name: 'Move up', exact: true }).click();
    await entry.getByRole('spinbutton', { name: 'Rest (seconds)', exact: true }).fill('');
    await dialog.getByRole('button', { name: 'Add Exercise', exact: true }).click();
    await dialog.getByRole('button', { name: 'Barbell Bench Press', exact: true }).click();
    const first = await loseResponse(() => dialog.getByRole('button', { name: 'Save', exact: true }).click());
    await expect(dialog.getByText('The change is not confirmed. Your request is kept.')).toBeVisible();
    await page.reload();
    const retried = response(commandsPath);
    await page.getByRole('button', { name: 'Retry saved request', exact: true }).click();
    expect(await (await retried).json()).toEqual(first.body);
    await expect(card('Browser ordered targets')).toBeVisible();
    const templateId = first.body.receipt.templateId;
    const read = async () => request(`/api/mobile/train/templates/${templateId}`, user);
    const created = await read();
    expect(created.template.entries).toHaveLength(2);
    expect(created.template.entries[0].exerciseId).toBe(created.template.entries[1].exerciseId);
    expect(created.template.entries[0].id).not.toBe(created.template.entries[1].id);
    expect(created.template.entries[0].restSeconds).toBeNull();
    expect(created.template.entries[0].targets.items.map(target => [target.kind, target.measurements.weightKg, target.measurements.reps]))
      .toEqual([['warmup', '2.5', '7'], ['working', '0.123', '5'], ['working', null, null]]);

    // An intervening real command makes the open editor's captured version
    // stale. The replacement must follow visible current/proposed review.
    await card('Browser ordered targets').getByRole('button', { name: 'Edit', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Browser reviewed targets');
    await request('/api/mobile/train/templates/commands', user, { protocolVersion: 1, operationId: randomUUID(), command: {
      kind: 'edit', templateId, expectedVersion: created.template.version,
      changes: [{ kind: 'patch-template', patch: { notes: 'Changed from another installation' } }],
    } });
    const conflict = response(commandsPath);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await conflict).status()).toBe(409);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Review proposal', exact: true }).click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Current routine', exact: true })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Result after applying', exact: true })).toBeVisible();
    await expect(dialog.getByText('Changed from another installation', { exact: true }).first()).toBeVisible();
    const replacement = response(commandsPath);
    await dialog.getByRole('button', { name: 'Apply reviewed changes', exact: true }).click();
    expect((await replacement).status()).toBe(200);
    await expect(card('Browser reviewed targets')).toBeVisible();
    const reviewed = await read();
    expect(reviewed.template.notes).toBe('Changed from another installation');
    expect(reviewed.template.entries).toEqual(created.template.entries);

    await card('Browser reviewed targets').getByRole('button', { name: 'Archive', exact: true }).click();
    const archived = response(commandsPath);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archive', exact: true }).click();
    expect((await archived).status()).toBe(200);
    await expect(card('Browser reviewed targets')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Archived', exact: true }).click();
    await expect(card('Browser reviewed targets')).toBeVisible();
    const restored = response(commandsPath);
    await card('Browser reviewed targets').getByRole('button', { name: 'Restore', exact: true }).click();
    expect((await restored).status()).toBe(200);
    await page.getByRole('tab', { name: 'Active', exact: true }).click();
    await expect(card('Browser reviewed targets')).toBeVisible();
    await page.screenshot({ path: resolve(artifactDirectory, 'train-419-browser-library.png'), fullPage: true });

    const started = response(`/api/routines/${templateId}/start`);
    await card('Browser reviewed targets').getByRole('button', { name: 'Start', exact: true }).click();
    const startedResponse = await started;
    expect(startedResponse.status()).toBe(201);
    const workout = (await startedResponse.json()).workout;
    expect(workout.exercises.flatMap(entry => entry.sets).every(set => !set.is_completed)).toBe(true);
    await expect(page).toHaveURL(/\/workouts\/active$/);
    const working = workout.exercises[0].sets[1];
    const completed = response(`/api/workouts/${workout.id}/exercises/${workout.exercises[0].id}/sets/${working.id}`, 'PATCH');
    await page.getByRole('checkbox').nth(1).check();
    expect((await completed).status()).toBe(200);
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    const finish = page.getByRole('alertdialog');
    await finish.getByRole('button', { name: 'Save as Routine', exact: true }).click();
    await expect(finish.getByText(/Save as Routine keeps the existing representative conversion:/)).toBeVisible();
    await finish.getByPlaceholder('Name for the new routine').fill('Browser representative copy');
    const conversion = await loseResponse(() => finish.getByRole('button', { name: 'Save', exact: true }).click());
    await expect(finish.getByText('Saving is not confirmed. The exact request is kept for retry.')).toBeVisible();
    const conversionRetry = response(commandsPath);
    await finish.getByRole('button', { name: 'Retry saved request', exact: true }).click();
    expect(await (await conversionRetry).json()).toEqual(conversion.body);
    expect(conversion.body.receipt.template.entries[0].targets.items.map(target => target.measurements.weightKg)).toEqual(['0.123']);
    const finished = response(`/api/workouts/${workout.id}`, 'PATCH');
    await finish.getByRole('button', { name: 'Finish Workout', exact: true }).click();
    expect((await finished).status()).toBe(200);
    await page.goto(`${origin}/workouts/routines`);
    await expect(card('Browser representative copy')).toBeVisible();
    expect((await read()).template.entries).toEqual(created.template.entries);
    await page.screenshot({ path: resolve(artifactDirectory, 'train-419-browser-conversion.png'), fullPage: true });
    return { templateId, workoutId: workout.id, copyId: conversion.body.receipt.templateId,
      cases: ['ordered targets/duplicate identities', 'lost-response create and exact remount retry', 'CAS current/proposal review',
        'archive/restore', 'unfinished Start then explicit completion', 'representative conversion disclosure and exact retry'] };
  } catch (error) {
    await page.screenshot({ path: resolve(artifactDirectory, 'train-419-browser-failure.png'), fullPage: true }).catch(() => {});
    writeFileSync(resolve(artifactDirectory,'train-419-browser-diagnostics.json'), JSON.stringify(diagnostics,null,2));
    throw error;
  } finally { await context.close(); await browser.close(); }
}
