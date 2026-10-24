import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServerClient } from '@supabase/ssr';
import { chromium, expect } from '@playwright/test';

/** Only called by the guarded local runner. No hosted credentials or target accepted. */
export async function webFocusHistoryJourney({ origin, api, anonKey, createUser, signIn, request, check, root, rows }) {
  check(new URL(origin).hostname === '127.0.0.1' && new URL(origin).port !== '8082' && api === 'http://127.0.0.1:54321', 'Web UAT requires isolated loopback services');
  const owner = await createUser(), other = await createUser();
  const native = await signIn(owner);
  async function webIdentity(user) {
    const jar = new Map();
    const client = createServerClient(api, anonKey, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => jar.set(name, value)) } });
    const result = await client.auth.signInWithPassword(user.credentials);
    check(!result.error && result.data.session, 'Web fixture cookie sign-in failed');
    return { cookie: [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; '), cookies: [...jar].map(([name, value]) => ({ name, value, url: origin, sameSite: 'Lax' })) };
  }
  const a = await webIdentity(owner), b = await webIdentity(other);
  async function cookieRequest(path, method = 'GET', body, status = 200) {
    const response = await fetch(`${origin}${path}`, { method, headers: { Cookie: a.cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000), redirect: 'manual' });
    check(response.status === status, `Web compatibility ${method} ${path.split('?')[0]} expected ${status}, received ${response.status}`);
    return response.json();
  }
  const phone = { id: randomUUID(), label: 'UAT iPhone', platform: 'ios' }, mac = { id: randomUUID(), label: 'UAT Mac', platform: 'macos' };
  const makeSession = (sequence, title) => ({ id: randomUUID(), sequence, kind: 'focus-session-completed', observedAt: 1792864500000, appVersion: '1.0', session: {
    id: randomUUID(), startedAt: 1792861200000, endedAt: 1792863000000, completedRounds: 2,
    settings: { preset: 'classic', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
    link: { kind: 'task', id: randomUUID(), title, projectName: 'Historical project snapshot' }, segments: [{ start: 1792861200000, end: 1792862400000 }],
  } });
  const sessions = Array.from({ length: 51 }, (_, index) => makeSession(index + 1, index === 50 ? 'Last paged work' : `Recorded work ${index + 1}`));
  for (let index = 0; index < sessions.length; index += 25) await request('/api/mobile/focus/history', native.token, { schemaVersion: 1, source: phone, events: sessions.slice(index, index + 25) });
  await request('/api/mobile/focus/history', native.token, { schemaVersion: 1, source: mac, events: [makeSession(1, 'Independent Mac session')] });
  const snapshot = { label: 'Social', day: '2026-10-24', dailyUnlocks: 3, minutes: 5, current: 2, best: 4, status: 'paused', usedToday: 0, overridesToday: 0 };
  const baseline = { schemaVersion: 1, id: randomUUID(), sequence: 1, kind: 'app-limit-baseline', observedAt: 1792864500000, appVersion: '1.0', ruleId: randomUUID(), reason: 'baseline', before: null, after: snapshot };
  const limitsPath = '/api/mobile/focus/app-limits/history';
  await request(limitsPath, native.token, { schemaVersion: 1, source: phone, events: [baseline] });
  const replacement = { id: randomUUID(), label: 'UAT iPhone', platform: 'ios' };
  const command = { schemaVersion: 1, operationId: randomUUID(), source: { sourceId: phone.id, ruleId: baseline.ruleId, expectedCheckpoint: 1, expectedEvent: { eventId: baseline.id, sequence: 1 } },
    destination: { source: replacement, ruleId: randomUUID(), expectedCheckpoint: 0, expectedRuleEvent: null, applyEventId: randomUUID(), label: 'Continued Social', dailyUnlocks: 2, minutes: 5 } };
  await request('/api/mobile/focus/app-limits/continuations', native.token, command);
  const applied = { ...baseline, id: command.destination.applyEventId, kind: 'app-limit-change', ruleId: command.destination.ruleId, reason: 'limitCreated',
    after: { ...snapshot, label: 'Continued Social', dailyUnlocks: 2, status: 'counting' } };
  await request(limitsPath, native.token, { schemaVersion: 1, source: replacement, events: [applied] });
  const reset = { ...baseline, id: randomUUID(), sequence: 2, kind: 'app-limit-change', reason: 'extraUnlock', observedAt: 1792800000000, before: snapshot,
    after: { ...snapshot, current: 0, status: 'counting', overridesToday: 1 } };
  const unnamed = { ...baseline, id: randomUUID(), sequence: 3, ruleId: randomUUID(), after: { ...snapshot, label: null } };
  const anotherUnnamed = { ...unnamed, id: randomUUID(), sequence: 4, ruleId: randomUUID() };
  await request(limitsPath, native.token, { schemaVersion: 1, source: phone, events: [reset, unnamed, anotherUnnamed] });
  const task = (await cookieRequest('/api/tasks', 'POST', { title: 'Preserved planner task', status: 'todo', priority: 1 }, 201)).task;
  rows.tasks.push(task.id);
  const conversation = (await cookieRequest('/api/conversations', 'POST', {}, 201)).conversation;
  rows.conversations.push(conversation.id);
  await cookieRequest(`/api/conversations/${conversation.id}`, 'PATCH', { title: 'Preserved legacy conversation' });
  await cookieRequest(`/api/conversations/${conversation.id}/messages`, 'POST', { role: 'user', content: 'Keep this existing Web chat message' }, 201);
  const historyBefore = await cookieRequest(`/api/conversations/${conversation.id}/messages`);
  const nativeChatBefore = await request('/api/mobile/assistant/history', native.token);
  check(nativeChatBefore.messages.length === 0, 'Legacy Web chat appeared in native Assistant history');

  const artifacts = resolve(root, '.artifacts/web-focus-history'); await mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' });
    const page = await context.newPage(); page.setDefaultTimeout(30_000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/focus`); await expect(page).toHaveURL(/\/auth\/login/);
    await context.addCookies(a.cookies);
    await page.goto(`${origin}/focus`);
    await expect(page.getByRole('heading', { name: 'Focus history', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'UAT iPhone', exact: true })).toBeVisible();
    await expect(page.getByText('Recorded work 1', { exact: true })).toBeVisible();
    await expect(page.getByText(/More cloud records are available/)).toBeVisible();
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(page.getByText('Last paged work', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'UAT Mac', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);
    check(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(await page.getByRole('tabpanel').evaluate(node => node.outerHTML)), 'Session UI exposes an internal ID');
    await page.getByRole('heading', { name: 'Focus history', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(artifacts, 'sessions.png') });
    await page.route('**/api/focus/history?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }));
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    const historyError = page.getByRole('alert').filter({ hasText: 'Could not refresh history' });
    await expect(historyError).toBeVisible();
    await expect(page.getByText('Last paged work', { exact: true })).toBeVisible();
    await page.unroute('**/api/focus/history?*');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(historyError).toHaveCount(0);
    await page.getByRole('tab', { name: 'App limits', exact: true }).click();
    const original = page.getByRole('region', { name: 'UAT iPhone · History 1', exact: true });
    await expect(original.getByText('Latest confirmed observation: 0 days · Best: 4 days', { exact: true })).toBeVisible();
    await expect(original.getByText('Streak: 2 → 0 days', { exact: true })).toBeVisible();
    await expect(original.getByRole('heading', { name: 'Unnamed limit 2', exact: true })).toBeVisible();
    await expect(original.getByRole('heading', { name: 'Unnamed limit 3', exact: true })).toBeVisible();
    const continued = page.getByRole('region', { name: 'UAT iPhone · History 2', exact: true });
    await expect(continued.getByText('Latest confirmed observation: 2 days · Best: 4 days', { exact: true })).toBeVisible();
    await continued.getByRole('button', { name: 'View continuation source' }).click();
    await expect(continued.getByText('Continued from UAT iPhone · History 1 · Social · Limit 1', { exact: true })).toBeVisible();
    check(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(await page.getByRole('tabpanel').evaluate(node => node.outerHTML)), 'App-limit UI or lineage exposes an internal ID');
    await page.screenshot({ path: resolve(artifacts, 'app-limits.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Focus history', exact: true })).toBeVisible();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Focus history overflows narrow viewport');
    await page.screenshot({ path: resolve(artifacts, 'narrow.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto(`${origin}/tasks`);
    await expect(page.getByText('Preserved planner task', { exact: true })).toBeVisible();
    await cookieRequest(`/api/tasks/${task.id}`, 'PATCH', { title: 'Planner edit still works' });
    check((await cookieRequest(`/api/tasks/${task.id}`)).task.title === 'Planner edit still works', 'Existing planner command/readback changed');
    await page.reload(); await expect(page.getByText('Planner edit still works', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Focus', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Focus history', exact: true })).toBeVisible();
    check(JSON.stringify(await cookieRequest(`/api/conversations/${conversation.id}/messages`)) === JSON.stringify(historyBefore), 'Focus history changed legacy Web messages');
    check((await request('/api/mobile/assistant/history', native.token)).messages.length === 0, 'Focus page migrated Web messages into native Assistant');

    await context.clearCookies(); await context.addCookies(b.cookies); await page.goto(`${origin}/focus`);
    await expect(page.getByText('No completed sessions received yet.', { exact: true })).toBeVisible();
    await expect(page.getByText('Last paged work', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'App limits', exact: true }).click();
    await expect(page.getByText('No app-limit records received yet.', { exact: true })).toBeVisible();
    await expect(page.getByText('Social', { exact: true })).toHaveCount(0);
    check(errors.length === 0, `Web history runtime errors: ${errors.join('; ')}`);
    console.log('PASS real Web cookie UI, 52-session paging, retained-error/retry, separate device/rule streaks, clock skew, clean-client continuation lineage, 390px layout, owner switch and planner/legacy-chat compatibility');
  } finally { await browser.close(); }
}
