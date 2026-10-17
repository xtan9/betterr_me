const CATEGORIES = new Set(['healthy', 'configuration', 'monitor_auth', 'monitor_cleanup', 'assistant_http', 'invalid_stream', 'stream_error', 'response_timeout', 'monitor_session_cleanup', 'notification_state', 'simulated_failure']);
const DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f-]{36}$/;
const isDate = (value) => typeof value === 'string' && DATE.test(value) && Number.isFinite(Date.parse(value));
const marker = (id) => `<!-- assistant-monitor-event:${id} -->`;

export function eventText(event, { test = false } = {}) {
  return [test ? '**TEST — simulated notification; production was not interrupted.**' : '**Production Assistant availability**',
    `Event: ${event.kind} (${event.id})`, `Category: ${event.category}. Root cause: ${event.kind === 'recovery' ? 'probe completed successfully' : 'not yet established'}.`,
    `First observed: ${event.startedAt}. Last observed: ${event.at}.`,
    `Incident duration: ${Math.max(0, Math.round((Date.parse(event.at) - Date.parse(event.startedAt)) / 1000))} seconds. Attempt: ${event.durationMs ?? 'unknown'} ms; HTTP: ${event.httpStatus ?? 'unknown'}.`,
    `Last successful probe: ${event.lastSuccessAt ?? 'unknown'}. Deployed commit: unavailable from the probe.`,
    event.category === 'response_timeout' ? 'The client stopped waiting at 60 seconds; the server may finish later. Availability is unconfirmed.' : '',
    `Run: ${event.runUrl}`].filter(Boolean).join('\n\n');
}

function issueBody(state, test) {
  return `${test ? 'Labeled delivery test.' : 'Maintainer: @xtan9. Automated synthetic Assistant check; no real conversation data.'}\n\nStatus: **${state.phase}**. Last probe: ${state.lastObservedAt}.\n\n${eventText(state.events.at(-1), { test })}\n\n<!-- assistant-monitor-state:${JSON.stringify(state)} -->`;
}

// GitHub issues are public input. Project only the expected, bounded fields;
// never relay arbitrary body/comment content into mail or workflow logs.
export function parseIncident(body, repo) {
  const raw = /<!-- assistant-monitor-state:(\{[^\n]+\}) -->/.exec(body ?? '')?.[1];
  if (!raw || raw.length > 50_000) throw new Error('invalid_incident_state');
  const state = JSON.parse(raw);
  if (state.version !== 1 || !['down', 'recovered'].includes(state.phase) || !isDate(state.startedAt)
    || !isDate(state.lastObservedAt) || !isDate(state.lastAlertAt) || (state.lastSuccessAt !== null && !isDate(state.lastSuccessAt))
    || !Array.isArray(state.events) || state.events.length < 1 || state.events.length > 100) throw new Error('invalid_incident_state');
  const events = state.events.map((event) => {
    const url = new URL(event.runUrl);
    if (!UUID.test(event.id) || !['outage', 'reminder', 'recovery'].includes(event.kind) || !CATEGORIES.has(event.category)
      || !isDate(event.at) || !isDate(event.startedAt) || (event.lastSuccessAt !== null && !isDate(event.lastSuccessAt))
      || !['pending', 'sent'].includes(event.email) || !['pending', 'sent'].includes(event.github)
      || (event.httpStatus !== null && (!Number.isInteger(event.httpStatus) || event.httpStatus < 100 || event.httpStatus > 599))
      || (event.durationMs !== null && (!Number.isFinite(event.durationMs) || event.durationMs < 0 || event.durationMs > 600_000))
      || url.origin !== 'https://github.com' || !url.pathname.startsWith(`/${repo}/actions/runs/`) || url.search || url.hash) throw new Error('invalid_incident_state');
    return Object.fromEntries(['id', 'kind', 'at', 'startedAt', 'lastSuccessAt', 'category', 'httpStatus', 'durationMs', 'runUrl', 'email', 'github'].map((key) => [key, event[key]]));
  });
  return { version: 1, phase: state.phase, startedAt: state.startedAt, lastObservedAt: state.lastObservedAt,
    lastAlertAt: state.lastAlertAt, lastSuccessAt: state.lastSuccessAt, events };
}

export function githubIncidentStore({ token, repo, test = false, fetchImpl = fetch }) {
  const title = test ? '[TEST] Assistant availability notification' : '[Incident] Assistant unavailable';
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) throw new Error('github_configuration');
  const api = async (path, method = 'GET', body) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}${path}`, { method, redirect: 'error',
      signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error('github_delivery');
    return response.status === 204 ? null : response.json();
  };
  const pages = async (path) => {
    const items = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      items.push(...batch);
      if (batch.length < 100) return items;
    }
    throw new Error('github_pagination_limit');
  };
  const get = async () => {
    const issues = await pages('/issues?state=open&creator=github-actions%5Bbot%5D');
    const matches = issues.filter((issue) => !issue.pull_request && issue.title === title && issue.user?.login === 'github-actions[bot]');
    if (matches.length > 1) throw new Error('duplicate_incident');
    if (!matches.length) return null;
    const issue = matches[0];
    return { number: issue.number, url: `https://github.com/${repo}/issues/${issue.number}`, state: parseIncident(issue.body, repo) };
  };
  return {
    get,
    async lastSuccess() {
      const data = await api('/actions/workflows/assistant-availability.yml/runs?status=success&branch=main&per_page=100');
      const run = data.workflow_runs.find((run) => run.display_title === 'Assistant availability — live');
      return run ? new Date(run.updated_at).toISOString() : null;
    },
    async create(state) {
      // The workflow serializes all live/test invocations. Recover a lost create
      // response by looking up the one bot-authored issue before retrying.
      try {
        const issue = await api('/issues', 'POST', { title, body: issueBody(state, test), assignees: ['xtan9'] });
        return { number: issue.number, url: `https://github.com/${repo}/issues/${issue.number}`, state };
      } catch {
        const existing = await get();
        if (existing?.state.events[0].id === state.events[0].id) return existing;
        throw new Error('github_incident_create');
      }
    },
    async save(issue, state) { await api(`/issues/${issue.number}`, 'PATCH', { body: issueBody(state, test) }); },
    async event(issue, event) {
      const comments = await pages(`/issues/${issue.number}/comments`);
      if (comments.some((comment) => comment.user?.login === 'github-actions[bot]' && comment.body?.includes(marker(event.id)))) return;
      await api(`/issues/${issue.number}/comments`, 'POST', { body: `${marker(event.id)}\n\n@xtan9\n\n${eventText(event, { test })}` });
    },
    async close(issue) { await api(`/issues/${issue.number}`, 'PATCH', { state: 'closed', state_reason: 'completed' }); },
  };
}

export function resendDelivery({ key, to, test = false, fetchImpl = fetch }) {
  return async (event, issue) => {
    if (!key || !to) throw new Error('email_configuration');
    const response = await fetchImpl('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `assistant-monitor/${test ? 'test' : 'live'}/${event.id}` },
      body: JSON.stringify({ from: 'BetterR.Me <reminders@betterr.me>', to: [to],
        subject: `${test ? '[TEST] ' : ''}BetterR.Me Assistant: ${event.kind}`,
        text: `${eventText(event, { test })}\n\nIncident: ${issue.url}` }),
    });
    if (!response.ok || !(await response.json()).id) throw new Error('email_delivery');
  };
}
