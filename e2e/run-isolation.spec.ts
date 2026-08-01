import { createClient } from '@supabase/supabase-js';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
} from '@playwright/test';
import { E2E_READ_ONLY, RUN_CONTEXT } from './constants';
import { createRunContext, requiredE2EEnvironment, type E2ERunContext } from './run-context';

async function authenticatedRequest(
  browser: Browser,
  baseURL: string,
  run: E2ERunContext,
  baseEmail: string,
  password: string,
) {
  const email = run.identityEmail(baseEmail);
  const supabase = createClient(
    requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_URL', 'setup'),
    requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'setup'),
  );
  let userId: string | undefined;
  let context: BrowserContext | undefined;

  try {
    const { data: signUpData, error } = await supabase.auth.signUp({ email, password });
    userId = signUpData.user?.id;
    if (error && !/already registered/i.test(error.message)) throw error;
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !authData.user) {
      throw new Error(`Failed to authenticate isolation identity: ${signInError?.message}`);
    }
    userId = authData.user.id;

    context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto('/auth/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /log\s*in|sign\s*in/i }).click();
    await page.waitForURL('/dashboard', { timeout: 15_000 });
    return { context, request: page.request, userId };
  } catch (error) {
    const cleanupFailures: string[] = [];
    if (context) {
      try {
        await context.close();
      } catch (cleanupError) {
        cleanupFailures.push(String(cleanupError));
      }
    }
    if (userId) {
      const admin = createClient(
        requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_URL', 'teardown'),
        requiredE2EEnvironment('E2E_SUPABASE_SERVICE_ROLE_KEY', 'teardown'),
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
      if (cleanupError) cleanupFailures.push(cleanupError.message);
    }
    throw new Error(
      `Isolation identity setup failed: ${String(error)}`
      + (cleanupFailures.length ? `\nCleanup also failed:\n${cleanupFailures.join('\n')}` : ''),
    );
  }
}

async function createHabit(request: APIRequestContext, run: E2ERunContext) {
  const response = await request.post('/api/habits', {
    data: {
      name: run.ownedName('Concurrent Flow'),
      description: `Isolation verification for ${run.runId}`,
      frequency: { type: 'daily' },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json() as { habit: { id: string; name: string } }).habit;
}

test.describe('Run-owned fixture isolation', () => {
  test.skip(E2E_READ_ONLY, 'Stateful verification never runs against production-backed targets');

  test('concurrent run identities cannot read or delete one another records', async (
    { browser },
    testInfo,
  ) => {
    const baseURL = testInfo.project.use.baseURL;
    if (typeof baseURL !== 'string') throw new Error('Isolation verification requires a baseURL');
    const baseEmail = requiredE2EEnvironment('E2E_TEST_EMAIL', 'setup');
    const password = requiredE2EEnvironment('E2E_TEST_PASSWORD', 'setup');
    const attempt = `repeat-${testInfo.repeatEachIndex}-retry-${testInfo.retry}`;
    const runs = [
      createRunContext(`${RUN_CONTEXT.runId}-${attempt}-a`),
      createRunContext(`${RUN_CONTEXT.runId}-${attempt}-b`),
    ];
    const admin = createClient(
      requiredE2EEnvironment('NEXT_PUBLIC_SUPABASE_URL', 'teardown'),
      requiredE2EEnvironment('E2E_SUPABASE_SERVICE_ROLE_KEY', 'teardown'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const authenticationResults = await Promise.allSettled(
      runs.map((run) => authenticatedRequest(browser, baseURL, run, baseEmail, password)),
    );
    const authenticated = authenticationResults
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    if (authenticated.length !== runs.length) {
      await Promise.allSettled(authenticated.flatMap(({ context, userId }) => [
        context.close(),
        admin.auth.admin.deleteUser(userId),
      ]));
      throw new Error(`${runs.length - authenticated.length} isolation identity setup(s) failed`);
    }
    const createdIds: Array<string | undefined> = [];

    try {
      const creationResults = await Promise.allSettled([
        createHabit(authenticated[0].request, runs[0]),
        createHabit(authenticated[1].request, runs[1]),
      ]);
      for (const [index, result] of creationResults.entries()) {
        if (result.status === 'fulfilled') createdIds[index] = result.value.id;
      }
      const creationFailures = creationResults.filter((result) => result.status === 'rejected');
      if (creationFailures.length > 0) {
        throw new Error(`${creationFailures.length} concurrent isolation flow(s) failed to create`);
      }
      const [first, second] = creationResults.map((result) => {
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      });
      const [firstRead, secondRead, crossRead] = await Promise.all([
        authenticated[0].request.get(`/api/habits/${first.id}`),
        authenticated[1].request.get(`/api/habits/${second.id}`),
        authenticated[0].request.get(`/api/habits/${second.id}`),
      ]);
      expect(firstRead.ok()).toBe(true);
      expect(secondRead.ok()).toBe(true);
      expect(crossRead.status()).toBe(404);

      const crossDelete = await authenticated[0].request.delete(`/api/habits/${second.id}`);
      expect(crossDelete.status()).toBe(404);
      expect((await authenticated[1].request.get(`/api/habits/${second.id}`)).ok()).toBe(true);

      const firstDelete = await authenticated[0].request.delete(`/api/habits/${first.id}`);
      expect(firstDelete.ok()).toBe(true);
      expect((await authenticated[1].request.get(`/api/habits/${second.id}`)).ok()).toBe(true);

      const secondDelete = await authenticated[1].request.delete(`/api/habits/${second.id}`);
      expect(secondDelete.ok()).toBe(true);
    } finally {
      const recordCleanup = await Promise.allSettled(createdIds.map((id, index) => (
        id ? authenticated[index].request.delete(`/api/habits/${id}`) : Promise.resolve()
      )));
      const contextCleanup = await Promise.allSettled(
        authenticated.map(({ context }) => context.close()),
      );
      const identityCleanup = await Promise.allSettled(
        authenticated.map(({ userId }) => admin.auth.admin.deleteUser(userId)),
      );
      const cleanupFailures = [
        ...recordCleanup.flatMap((result) => {
          if (result.status === 'rejected') return [String(result.reason)];
          return result.value && result.value.status() !== 404 && !result.value.ok()
            ? [`record cleanup returned ${result.value.status()}`]
            : [];
        }),
        ...contextCleanup.flatMap((result) => (
          result.status === 'rejected' ? [String(result.reason)] : []
        )),
        ...identityCleanup.flatMap((result) => {
          if (result.status === 'rejected') return [String(result.reason)];
          return result.value.error ? [result.value.error.message] : [];
        }),
      ];
      if (cleanupFailures.length > 0) {
        throw new Error(`Isolation cleanup failed:\n${cleanupFailures.join('\n')}`);
      }
    }
  });
});
