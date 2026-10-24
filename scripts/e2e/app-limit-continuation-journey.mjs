import { randomUUID } from 'node:crypto';

/** Runs only inside run-focus-history's guarded disposable Auth/HTTP environment. */
export async function continuationJourney({ request, token, otherToken, cleanToken, cookie, check }) {
  const path = '/api/mobile/focus/app-limits/continuations', history = '/api/mobile/focus/app-limits/history';
  const source = { id: randomUUID(), label: 'Previous native journal', platform: 'ios' };
  const target = { id: randomUUID(), label: 'Replacement native journal', platform: 'ios' };
  const baseline = { schemaVersion: 1, id: randomUUID(), sequence: 1, kind: 'app-limit-baseline', observedAt: 1790000060000, appVersion: '0.1.0',
    ruleId: randomUUID(), reason: 'baseline', before: null, after: { label: 'Social', day: '2026-10-24', dailyUnlocks: 3, minutes: 5, current: 2, best: 4, status: 'paused', usedToday: 1, overridesToday: 0 } };
  const command = { schemaVersion: 1, operationId: randomUUID(), source: { sourceId: source.id, ruleId: baseline.ruleId, expectedCheckpoint: 1, expectedEvent: { eventId: baseline.id, sequence: 1 } },
    destination: { source: target, ruleId: randomUUID(), expectedCheckpoint: 0, expectedRuleEvent: null, applyEventId: randomUUID(), label: 'Continued Social', dailyUnlocks: 2, minutes: 5 } };
  const sourceUpload = events => ({ schemaVersion: 1, source, events });
  await request(history, token, sourceUpload([baseline]));
  const query = new URLSearchParams({ sourceId: source.id, sourceRuleId: baseline.ruleId, destinationSourceId: target.id, destinationRuleId: command.destination.ruleId });
  await request(`${path}/context?${query}`, null, undefined, 401);
  const context = await request(`${path}/context?${query}`, token);
  check(context.eligibility.allowed && context.source.latest.snapshot.current === 2 && context.destination.latestRule === null, 'Review context did not expose current source/destination');
  const [confirmed, duplicate] = await Promise.all([request(path, token, command), request(path, token, command)]);
  check(JSON.stringify(confirmed) === JSON.stringify(duplicate), 'Concurrent operation replay produced different receipts');
  const recovered = await request(`${path}?operationId=${command.operationId}`, cleanToken);
  check(JSON.stringify(confirmed) === JSON.stringify(recovered) && recovered.application.state === 'awaiting-device', 'Lost confirmation response could not be recovered');
  await request(path, token, { ...command, destination: { ...command.destination, label: 'Different' } }, 409);
  const lineage = `destinationSourceId=${target.id}&applyEventId=${command.destination.applyEventId}`;
  await request(`${path}?${lineage}`, token, undefined, 404);
  await request(`${path}?operationId=${command.operationId}`, otherToken, undefined, 404);
  const fresh = { ...command, operationId: randomUUID(), destination: { ...command.destination, applyEventId: randomUUID() } };
  await request(path, token, { ...fresh, destination: { ...fresh.destination, minutes: 6 } }, 422);
  await request(path, token, { ...fresh, destination: { ...fresh.destination, dailyUnlocks: 4 } }, 422);
  await request(path, token, { ...fresh, source: { ...fresh.source, expectedCheckpoint: 2 } }, 409);
  for (const field of ['selectionTokens', 'authorizationApproved', 'activeGrant', 'monitorRegistration']) {
    await request(path, token, { ...fresh, destination: { ...fresh.destination, [field]: true } }, 400);
  }
  const applied = { ...baseline, id: command.destination.applyEventId, ruleId: command.destination.ruleId, kind: 'app-limit-change', reason: 'limitCreated',
    observedAt: 1791000060000, after: { ...baseline.after, label: 'Continued Social', dailyUnlocks: 2, day: '2026-11-01', status: 'counting', usedToday: 0 } };
  const appliedUpload = events => ({ schemaVersion: 1, source: target, events });
  await request(history, token, appliedUpload([{ ...applied, after: { ...applied.after, current: 3 } }]), 400);
  await request(history, token, appliedUpload([applied])); // Discard acknowledgment, then replay.
  await request(history, token, appliedUpload([applied]));
  const historyRead = await request(history, cleanToken);
  check(historyRead.items.filter(item => item.source.id === target.id).length === 1, 'Continuation replay duplicated native history');
  const row = historyRead.items.find(item => item.event.id === applied.id);
  const cleanLineage = `destinationSourceId=${row.source.id}&applyEventId=${row.event.id}`;
  const restored = await request(`${path}?${cleanLineage}`, cleanToken);
  check(restored.application.state === 'recorded' && restored.receipt.source.source.id === source.id && restored.receipt.restored.current === 2, 'Clean history cannot resolve continued origin');
  const web = await request(`/api/focus/app-limits/continuations?${cleanLineage}`, null, undefined, 200, cookie);
  check(JSON.stringify(web) === JSON.stringify(restored), 'Web/native lineage diverged');
  await request(`${path}?${cleanLineage}`, otherToken, undefined, 404);
  await request(`/api/focus/app-limits/continuations?${cleanLineage}`, token, undefined, 401);
  await request(path, token, fresh, 409);
  const reset = { ...baseline, id: randomUUID(), sequence: 3, kind: 'app-limit-change', reason: 'extraUnlock', before: baseline.after,
    after: { ...baseline.after, current: 0, overridesToday: 1 } };
  await request(history, token, sourceUpload([reset]));
  const newTarget = { ...fresh, destination: { ...fresh.destination, source: { ...target, id: randomUUID() } } };
  const gapped = await request(path, token, newTarget, 409);
  check(gapped.error === 'source_incomplete', 'Post-gap reset did not block continuation');
  await request(history, token, sourceUpload([{ ...baseline, id: randomUUID(), sequence: 2, kind: 'app-limit-change', reason: 'resumed', before: baseline.after }]));
  const ended = await request(path, token, newTarget, 422);
  check(ended.error === 'source_ended', 'Old positive source bypassed confirmed reset');
  const unchanged = await request(path, token, command);
  check(JSON.stringify(unchanged.receipt) === JSON.stringify(confirmed.receipt), 'Source reset rewrote confirmed independent origin');
  check(row.event.after.day === '2026-11-01' && row.event.after.current === 2, 'Continuation invented credit for the gap');
  console.log('PASS continuation current-version review, concurrent idempotent confirmation, lost-response recovery, validated apply, clean-client/Web lineage, owner isolation and post-gap reset rejection');
}
