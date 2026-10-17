import { randomUUID } from 'node:crypto';

const REMINDER_MS = 30 * 60_000;

// The issue body is the outbox: persist immutable events before either delivery.
// Each transport also uses the event ID to recover an uncertain acknowledgement.
export async function reconcileAvailability({ result, store, sendEmail, runUrl, now = () => new Date(), deliveryLimit = 4 }) {
  const at = now().toISOString();
  let issue = await store.get();
  if (!issue && result.healthy) return { deliveryFailures: [] };
  const state = issue ? structuredClone(issue.state) : {
    version: 1, phase: 'down', startedAt: at, lastAlertAt: null,
    lastSuccessAt: await store.lastSuccess(), events: [],
  };
  state.lastObservedAt = at;
  let kind;
  if (result.healthy && state.phase === 'down') {
    kind = 'recovery';
    state.phase = 'recovered';
    state.lastSuccessAt = at;
  } else if (!result.healthy) {
    if (!issue || state.phase === 'recovered') {
      kind = 'outage';
      state.phase = 'down';
      state.startedAt = at;
    } else if (Date.parse(at) - Date.parse(state.lastAlertAt) >= REMINDER_MS) kind = 'reminder';
    if (kind) state.lastAlertAt = at;
  }
  if (kind) {
    // Unsent reminders are replaceable snapshots; retaining every reminder
    // during a mail outage would eventually overflow GitHub's issue body.
    // Outage/recovery transitions remain queued until each channel delivers.
    state.events = state.events.filter((event) => (event.email !== 'sent' || event.github !== 'sent')
      && (kind !== 'reminder' || event.kind !== 'reminder'));
    state.events.push({ id: randomUUID(), kind, at, startedAt: state.startedAt,
      lastSuccessAt: state.lastSuccessAt, category: result.category,
      httpStatus: result.httpStatus ?? null, durationMs: result.durationMs ?? null,
      runUrl, email: 'pending', github: 'pending' });
    if (!issue) issue = await store.create(state);
    else await store.save(issue, state);
  } else await store.save(issue, state);

  const deliveryFailures = new Set();
  // Give each channel a bounded turn. A backlog of slow mail failures cannot
  // exhaust the worker timeout before the current GitHub event is attempted.
  for (const channel of ['github', 'email']) {
    const deadline = Date.now() + 60_000;
    const pending = state.events.filter((event) => event[channel] !== 'sent');
    for (const event of pending.slice(0, deliveryLimit)) {
      if (Date.now() >= deadline) break;
      try {
        if (channel === 'email') await sendEmail(event, issue);
        else await store.event(issue, event);
        event[channel] = 'sent';
        await store.save(issue, state);
      } catch { deliveryFailures.add(channel); }
    }
    if (state.events.some((event) => event[channel] !== 'sent')) deliveryFailures.add(channel);
  }
  if (state.events.every((event) => event.email === 'sent' && event.github === 'sent')) {
    if (state.phase === 'recovered') await store.close(issue);
    else if (state.events.length > 1) {
      state.events = state.events.slice(-1);
      await store.save(issue, state);
    }
  }
  return { incident: issue.url, deliveryFailures: [...deliveryFailures] };
}
