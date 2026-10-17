import { randomUUID } from 'node:crypto';

// Never return upstream bodies, credentials, or generated text to the reporter.
export async function probeAssistant({ appUrl, supabaseUrl, anonKey, email, password,
  expectedUserId, fetchImpl = fetch, timeoutMs = 60_000, now = Date.now }) {
  const started = now();
  let token;
  let category = 'configuration';
  let httpStatus;
  let result;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const request = async (url, init = {}) => {
    httpStatus = undefined;
    const response = await fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal });
    httpStatus = response.status;
    if (!response.ok) throw new Error('http_failure');
    return response;
  };
  try {
    if (![appUrl, supabaseUrl, anonKey, email, password, expectedUserId].every(Boolean)) throw new Error('configuration');
    for (const url of [appUrl, supabaseUrl]) {
      if (new URL(url).protocol !== 'https:') throw new Error('configuration');
    }
    category = 'monitor_auth';
    const auth = await (await request(new URL('/auth/v1/token?grant_type=password', supabaseUrl), {
      method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    })).json();
    token = auth.access_token;
    if (!token || auth.user?.id !== expectedUserId) throw new Error('wrong_identity');
    category = 'monitor_cleanup';
    // This RPC also verifies the account is server-registered as synthetic.
    // Run before every attempt, even if generation remains unavailable.
    const cleanup = await (await request(new URL('/rest/v1/rpc/cleanup_assistant_monitor', supabaseUrl), {
      method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
    })).json();
    if (cleanup?.monitor !== true) throw new Error('unregistered_identity');
    category = 'assistant_http';
    const response = await request(new URL('/api/mobile/assistant', appUrl), {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify({ requestId: randomUUID(), consent: true, locale: 'en', messages: [{ role: 'user', content: 'This is a synthetic availability check. Reply briefly with OK. Do not remember anything, propose work, or use external connections.' }] }),
    });
    category = 'invalid_stream';
    if (!response.headers.get('content-type')?.includes('application/x-ndjson')) throw new Error('not_stream');
    let buffer = '', size = 0, complete = false;
    const decoder = new TextDecoder();
    const inspect = (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === 'error') { category = 'stream_error'; throw new Error('stream_error'); }
      if (complete) throw new Error('events_after_completion');
      if (event.type === 'complete') {
        if (typeof event.message !== 'string' || !event.message.trim() || typeof event.conversationId !== 'string') throw new Error('invalid_completion');
        complete = true;
      }
    };
    if (!response.body) throw new Error('missing_body');
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 1_048_576) throw new Error('oversized_stream');
      buffer += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) { inspect(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
    }
    inspect(buffer + decoder.decode());
    if (!complete) throw new Error('incomplete_stream');
    result = { healthy: true, category: 'healthy', httpStatus };
  } catch {
    result = { healthy: false, category: controller.signal.aborted && !category.startsWith('monitor_') ? 'response_timeout' : category,
      ...(controller.signal.aborted ? { timedOut: true } : {}), ...(httpStatus ? { httpStatus } : {}) };
  } finally {
    clearTimeout(timer);
    if (token) {
      try {
        const logout = await fetchImpl(new URL('/auth/v1/logout?scope=local', supabaseUrl), {
          method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(10_000),
        });
        if (!logout.ok) throw new Error('logout');
      } catch {
        if (result?.healthy) result = { healthy: false, category: 'monitor_session_cleanup' };
      }
    }
  }
  return { ...result, durationMs: Math.max(0, now() - started) };
}

export async function checkAssistant(options, { probe = probeAssistant, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const first = await probe(options);
  if (first.healthy) return { ...first, attempts: 1 };
  await sleep(30_000);
  return { ...await probe(options), attempts: 2 };
}
