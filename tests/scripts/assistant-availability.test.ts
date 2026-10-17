import { describe, expect, it, vi } from 'vitest';
import { checkAssistant, probeAssistant } from '../../scripts/ci/assistant-probe.mjs';
import { reconcileAvailability } from '../../scripts/ci/assistant-incidents.mjs';
import { githubIncidentStore, parseIncident, resendDelivery } from '../../scripts/ci/assistant-alert-transports.mjs';
import { runMonitor } from '../../scripts/ci/assistant-monitor.mjs';

const identity = '80000000-0000-0000-0000-000000000001';
const options = { appUrl: 'https://app.example', supabaseUrl: 'https://db.example', anonKey: 'public-key', email: 'synthetic@example.test', password: 'private-password', expectedUserId: identity };
function fixture(stream: string) {
  return vi.fn<typeof fetch>(async (url, _init) => {
    if (String(url).includes('/token')) return Response.json({ access_token: 'private-token', user: { id: identity } });
    if (String(url).includes('/rpc/')) return Response.json({ monitor: true, deleted: 0 });
    if (String(url).includes('/logout')) return new Response(null, { status: 204 });
    return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } });
  });
}

describe('production Assistant availability', () => {
  it('treats an HTTP 200 interrupted stream as failed and does not expose its body', async () => {
    const fetchImpl = fixture('{"type":"text","text":"partial"}\n{"type":"error","error":"unavailable","private":"secret"}\n');
    const result = await probeAssistant({ ...options, fetchImpl });
    expect(result).toMatchObject({ healthy: false, category: 'stream_error', httpStatus: 200 });
    expect(JSON.stringify(result)).not.toMatch(/secret|private-token|private-password|partial/);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/logout'))).toBe(true);
  });
  it('requires a fresh completed stream, not partial text or a cached JSON reply', async () => {
    for (const stream of ['{"type":"text","text":"OK"}\n', '{"conversationId":"id","message":"OK"}']) {
      await expect(probeAssistant({ ...options, fetchImpl: fixture(stream) })).resolves.toMatchObject({ healthy: false });
    }
    const fetchImpl = fixture('{"type":"text","text":"OK"}\n{"type":"complete","conversationId":"id","message":"OK"}\n');
    await expect(probeAssistant({ ...options, fetchImpl })).resolves.toMatchObject({ healthy: true });
    await probeAssistant({ ...options, fetchImpl });
    const bodies = fetchImpl.mock.calls.filter(([url]) => String(url).includes('/api/mobile/assistant')).map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies[0].requestId).not.toBe(bodies[1].requestId);
    expect(bodies[0]).not.toHaveProperty('conversationId');
  });
  it('never sends the prompt when the identity is not registered as a synthetic monitor', async () => {
    const fetchImpl = fixture('');
    const base = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async (url) => String(url).includes('/rpc/') ? new Response('private error', { status: 403 }) : base(url));
    await expect(probeAssistant({ ...options, fetchImpl })).resolves.toMatchObject({ healthy: false, category: 'monitor_cleanup' });
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/api/mobile/assistant'))).toBe(false);
  });
  it('rechecks once after 30 seconds and treats a recovered second attempt as healthy', async () => {
    const probe = vi.fn().mockResolvedValueOnce({ healthy: false, category: 'stream_error' }).mockResolvedValueOnce({ healthy: true, category: 'healthy' });
    const sleep = vi.fn();
    await expect(checkAssistant(options, { probe, sleep })).resolves.toMatchObject({ healthy: true, attempts: 2 });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(30_000);
    expect(probe).toHaveBeenCalledTimes(2);
  });
  it('aborts a stalled reply and still revokes the session', async () => {
    const fetchImpl = fixture('');
    const base = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async (url, init) => {
      if (!String(url).includes('/api/mobile/assistant')) return base(url, init);
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('private timeout'))));
    });
    await expect(probeAssistant({ ...options, fetchImpl, timeoutMs: 5 })).resolves.toMatchObject({ healthy: false, category: 'response_timeout', timedOut: true });
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/logout'))).toBe(true);
  });
  it('rejects expired authentication, malformed output, empty completion, and HTTP failures', async () => {
    for (const stream of ['not-json\n', '{"type":"complete","message":"","conversationId":"id"}\n']) {
      await expect(probeAssistant({ ...options, fetchImpl: fixture(stream) })).resolves.toMatchObject({ healthy: false, category: 'invalid_stream' });
    }
    const fetchImpl = fixture('');
    const base = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async (url, init) => String(url).includes('/token') ? new Response(null, { status: 401 }) : base(url, init));
    await expect(probeAssistant({ ...options, fetchImpl })).resolves.toMatchObject({ healthy: false, category: 'monitor_auth', httpStatus: 401 });
    fetchImpl.mockImplementation(async (url, init) => String(url).includes('/api/mobile/assistant') ? new Response(null, { status: 502 }) : base(url, init));
    await expect(probeAssistant({ ...options, fetchImpl })).resolves.toMatchObject({ healthy: false, category: 'assistant_http', httpStatus: 502 });
  });
  it('rejects a mismatched identity before touching Assistant history', async () => {
    const fetchImpl = fixture('');
    const base = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async (url, init) => String(url).includes('/token') ? Response.json({ access_token: 'token', user: { id: 'someone-else' } }) : base(url, init));
    await expect(probeAssistant({ ...options, fetchImpl })).resolves.toMatchObject({ healthy: false, category: 'monitor_auth' });
    expect(fetchImpl.mock.calls.some(([url]) => /\/rpc\/|\/api\/mobile\//.test(String(url)))).toBe(false);
  });
  it.each(['http', 'network'])('reports session cleanup failure after a completed reply (%s)', async (failure) => {
    const fetchImpl = fixture('{"type":"complete","message":"OK","conversationId":"id"}\n');
    const base = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async (url, init) => {
      if (!String(url).includes('/logout')) return base(url, init);
      if (failure === 'http') return new Response(null, { status: 503 });
      throw new Error('private logout failure');
    });
    await expect(probeAssistant({ ...options, fetchImpl })).resolves.toMatchObject({ healthy: false, category: 'monitor_session_cleanup' });
  });
});

describe('availability transports', () => {
  const at = '2026-10-17T10:00:00.000Z';
  const event = { id: '70170000-0000-0000-0000-000000000001', kind: 'outage', at, startedAt: at, lastSuccessAt: null, category: 'stream_error', httpStatus: 200, durationMs: 1000, runUrl: 'https://github.com/example/repo/actions/runs/42', email: 'pending', github: 'pending' };
  const state = { version: 1, phase: 'down', startedAt: at, lastAlertAt: at, lastObservedAt: at, lastSuccessAt: null, events: [event] };
  const issue = { number: 3, url: 'https://github.com/example/repo/issues/3', state };
  it('retries email with identical content and an event-scoped idempotency key', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ id: 'email-id' }));
    const send = resendDelivery({ key: 'private-key', to: 'private@example.test', test: true, fetchImpl });
    await send(event, issue);
    await send({ ...event, github: 'sent' }, issue);
    expect(fetchImpl.mock.calls[0][1]?.body).toEqual(fetchImpl.mock.calls[1][1]?.body);
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ 'Idempotency-Key': `assistant-monitor/test/${event.id}` });
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).subject).toMatch(/^\[TEST\]/);
  });
  it('recovers a lost GitHub create acknowledgement and deduplicates already-posted event comments', async () => {
    let savedBody = '';
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === 'POST') {
        savedBody = JSON.parse(String(init.body)).body;
        throw new Error('lost acknowledgement');
      }
      if (String(url).includes('/comments')) return Response.json([{ user: { login: 'github-actions[bot]' }, body: `<!-- assistant-monitor-event:${event.id} -->` }]);
      return Response.json([{ number: 3, title: '[Incident] Assistant unavailable', user: { login: 'github-actions[bot]' }, body: savedBody }]);
    });
    const store = githubIncidentStore({ token: 'token', repo: 'example/repo', fetchImpl });
    await expect(store.create(state)).resolves.toMatchObject({ number: 3 });
    await store.event(issue, event);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });
  it('rejects corrupt public state and projects away unexpected fields', () => {
    const body = (value: unknown) => `<!-- assistant-monitor-state:${JSON.stringify(value)} -->`;
    expect(parseIncident(body({ ...state, private: 'secret' }), 'example/repo')).not.toHaveProperty('private');
    expect(() => parseIncident(body({ ...state, events: [{ ...event, category: 'private provider error' }] }), 'example/repo')).toThrow();
    expect(() => parseIncident(body({ ...state, events: [{ ...event, runUrl: 'https://attacker.example' }] }), 'example/repo')).toThrow();
  });
  it('attempts stable fallback email when GitHub is unavailable, even after a healthy probe', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('api.github.com')) throw new Error('private GitHub failure');
      return Response.json({ id: 'email-id' });
    });
    const check = vi.fn().mockResolvedValue({ healthy: true, category: 'healthy', durationMs: 1, attempts: 1 });
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', GITHUB_REPOSITORY: 'example/repo', GITHUB_RUN_ID: '42', GH_TOKEN: 'token', RESEND_API_KEY: 'key', ASSISTANT_ALERT_EMAIL: 'private@example.test' };
    await expect(runMonitor({ env, fetchImpl, check, now: () => new Date(at) })).resolves.toMatchObject({ deliveryFailures: ['github_state'] });
    await runMonitor({ env: { ...env, GITHUB_RUN_ID: '43' }, fetchImpl, check, now: () => new Date('2026-10-17T10:05:00.000Z') });
    const sends = fetchImpl.mock.calls.filter(([url]) => String(url).includes('api.resend.com'));
    expect(sends).toHaveLength(2);
    expect(sends[0][1]?.body).toBe(sends[1][1]?.body);
    expect(sends[0][1]?.headers).toEqual(sends[1][1]?.headers);
  });
  it('keeps GitHub delivery and email recovery working beyond 100 pending transitions', async () => {
    let savedIssue: { number: number; title: string; body: string; user: { login: string } } | null = null;
    const comments: Array<{ id: number; body: string; user: { login: string } }> = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const payload = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.pathname.includes('/actions/')) return Response.json({ workflow_runs: [] });
      if (url.pathname.endsWith('/issues') && method === 'POST') {
        savedIssue = { ...payload, number: 3, user: { login: 'github-actions[bot]' } };
        return Response.json(savedIssue);
      }
      if (url.pathname.endsWith('/issues')) return Response.json(savedIssue ? [savedIssue] : []);
      const commentId = /\/issues\/comments\/(\d+)$/.exec(url.pathname)?.[1];
      if (commentId) {
        const comment = comments.find((entry) => entry.id === Number(commentId))!;
        if (method === 'PATCH') comment.body = payload.body;
        return Response.json(comment);
      }
      if (url.pathname.endsWith('/comments')) {
        if (method === 'POST') {
          const comment = { id: comments.length + 1, body: payload.body, user: { login: 'github-actions[bot]' } };
          comments.push(comment);
          return Response.json(comment);
        }
        const start = (Number(url.searchParams.get('page')) - 1) * 100;
        return Response.json(comments.slice(start, start + 100));
      }
      if (payload.state === 'closed') savedIssue = null;
      else savedIssue!.body = payload.body;
      return Response.json({});
    });
    const sendEmail = vi.fn().mockRejectedValue(new Error('mail unavailable'));
    for (let index = 0; index < 105; index++) {
      // A new adapter per run reproduces process restart and durable recovery.
      const store = githubIncidentStore({ token: 'token', repo: 'example/repo', fetchImpl });
      const healthy = index % 2 === 1;
      await reconcileAvailability({ store, sendEmail, result: { healthy, category: healthy ? 'healthy' : 'stream_error' }, runUrl: event.runUrl, now: () => new Date(Date.parse(at) + index * 300_000) });
    }
    expect(comments.filter((comment) => comment.body.includes('assistant-monitor-event:'))).toHaveLength(105);
    sendEmail.mockResolvedValue(undefined);
    for (let index = 105; savedIssue && index < 140; index++) {
      const store = githubIncidentStore({ token: 'token', repo: 'example/repo', fetchImpl });
      const before = sendEmail.mock.calls.length;
      await reconcileAvailability({ store, sendEmail, result: { healthy: true, category: 'healthy' }, runUrl: event.runUrl, now: () => new Date(Date.parse(at) + index * 300_000) });
      expect(sendEmail.mock.calls.length - before).toBeLessThanOrEqual(4);
    }
    expect(savedIssue).toBeNull();
    expect(comments.filter((comment) => comment.body.includes('assistant-monitor-event:'))).toHaveLength(106);
  });
  it('recovers a newer paged transition when its manifest write was interrupted', async () => {
    const recovery = { ...event, id: '70170000-0000-0000-0000-000000000002', kind: 'recovery', at: '2026-10-17T10:05:00.000Z', category: 'healthy', lastSuccessAt: '2026-10-17T10:05:00.000Z' };
    const body = (value: unknown) => `<!-- assistant-monitor-state:${JSON.stringify(value)} -->`;
    const fetchImpl = vi.fn<typeof fetch>(async (url) => String(url).includes('/issues/comments/')
      ? Response.json({ user: { login: 'github-actions[bot]' }, body: body({ ...state, phase: 'recovered', events: [event, recovery] }) })
      : Response.json([{ number: 3, title: '[Incident] Assistant unavailable', user: { login: 'github-actions[bot]' }, body: body({ ...state, outboxPages: [11] }) }]));
    const store = githubIncidentStore({ token: 'token', repo: 'example/repo', fetchImpl });
    const restored = await store.get();
    expect(restored?.state.phase).toBe('recovered');
    expect(restored?.state.lastSuccessAt).toBe(recovery.at);
    const sendEmail = vi.fn();
    const restoredStore = { ...store, save: vi.fn(), event: vi.fn(), close: vi.fn() };
    await reconcileAvailability({ store: restoredStore, sendEmail, result: { healthy: true, category: 'healthy' }, runUrl: event.runUrl, now: () => new Date('2026-10-17T10:10:00.000Z') });
    expect(sendEmail.mock.calls.filter(([entry]) => entry.kind === 'recovery')).toHaveLength(1);
    expect(sendEmail.mock.calls.find(([entry]) => entry.kind === 'recovery')?.[0].id).toBe(recovery.id);
  });
});

describe('availability incident delivery', () => {
  it('persists pending deliveries across runs and never lets a failed email suppress GitHub', async () => {
    let saved: unknown;
    const store = {
      get: vi.fn(async () => saved ? { number: 2, url: 'https://github.com/example/repo/issues/2', state: structuredClone(saved) } : null),
      lastSuccess: vi.fn(async () => null),
      create: vi.fn(async (state) => { saved = structuredClone(state); return { number: 2, url: 'https://github.com/example/repo/issues/2', state }; }),
      save: vi.fn(async (_issue, state) => { saved = structuredClone(state); }),
      event: vi.fn(async () => {}), close: vi.fn(async () => {}),
    };
    const sendEmail = vi.fn().mockRejectedValueOnce(new Error('private transport failure')).mockResolvedValue(undefined);
    const params = { store, sendEmail, result: { healthy: false, category: 'response_timeout' }, runUrl: 'https://github.com/example/repo/actions/runs/2', now: () => new Date('2026-10-17T10:00:00Z') };
    await expect(reconcileAvailability(params)).resolves.toMatchObject({ deliveryFailures: ['email'] });
    expect(store.event).toHaveBeenCalledTimes(1);
    await reconcileAvailability({ ...params, now: () => new Date('2026-10-17T10:05:00Z') });
    expect(sendEmail.mock.calls[0][0].id).toBe(sendEmail.mock.calls[1][0].id);
    expect(store.event).toHaveBeenCalledTimes(1);
    await reconcileAvailability({ ...params, now: () => new Date('2026-10-17T10:30:00Z') });
    expect(sendEmail).toHaveBeenCalledTimes(3);
    expect(sendEmail.mock.calls[2][0].kind).toBe('reminder');
    expect(store.create).toHaveBeenCalledTimes(1);
  });
  it('sends one outage, suppresses repeats for 30 minutes, then sends one recovery', async () => {
    let incident: { number: number; url: string; state: unknown } | null = null;
    const store = {
      get: vi.fn(async () => incident),
      lastSuccess: vi.fn(async () => null),
      create: vi.fn(async (state) => (incident = { number: 1, url: 'https://github.com/example/repo/issues/1', state })),
      save: vi.fn(async (_issue, state) => { incident!.state = structuredClone(state); }),
      event: vi.fn(async () => {}),
      close: vi.fn(async () => { incident = null; }),
    };
    const sendEmail = vi.fn(async () => {});
    const params = { store, sendEmail, runUrl: 'https://github.com/example/repo/actions/runs/1', now: () => new Date('2026-10-17T10:00:00Z') };
    await reconcileAvailability({ ...params, result: { healthy: false, category: 'stream_error' } });
    await reconcileAvailability({ ...params, result: { healthy: false, category: 'stream_error' }, now: () => new Date('2026-10-17T10:05:00Z') });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(store.create).toHaveBeenCalledTimes(1);
    await reconcileAvailability({ ...params, result: { healthy: true, category: 'healthy' }, now: () => new Date('2026-10-17T10:10:00Z') });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(store.close).toHaveBeenCalledTimes(1);
    await reconcileAvailability({ ...params, result: { healthy: true, category: 'healthy' } });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
