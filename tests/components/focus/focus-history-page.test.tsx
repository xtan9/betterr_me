import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/en.json';
import { FocusHistoryPage } from '@/app/focus/focus-history-page';

const auth = vi.hoisted(() => ({ listener: null as null | ((event: string, session: { user: { id: string } } | null) => void), refresh: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { onAuthStateChange: (listener: typeof auth.listener) => {
  auth.listener = listener; return { data: { subscription: { unsubscribe() {} } } };
} } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: auth.refresh }) }));
const id = (value: number) => `a0000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const device = (value: number, label = 'My iPhone') => ({ id: id(value), label, platform: 'ios' });
const session = (value: number, source = device(1)) => ({ source, receivedAt: 1792864800000, event: {
  id: id(value), sequence: value, kind: 'focus-session-completed', observedAt: 1792864500000, appVersion: '1.0',
  session: { id: id(value + 100), startedAt: 1792861200000, endedAt: 1792863000000, completedRounds: 2,
    settings: { preset: 'classic', focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
    link: { kind: 'task', id: 'historic-task', title: `Completed work ${value}`, projectName: 'Thesis' },
    segments: [{ start: 1792861200000, end: 1792862400000 }] },
} });
const page = (items: unknown[], nextCursor: string | null = null) => Response.json({ schemaVersion: 1, items, nextCursor });
const snapshot = { label: 'Social' as string | null, day: '2026-10-24', dailyUnlocks: 3, minutes: 5, current: 2, best: 4, status: 'counting', usedToday: 1, overridesToday: 0 };
const limit = (value: number, rule = 10, source = device(1)) => ({ source, receivedAt: 1792864800000, acknowledgedThrough: 5, event: {
  schemaVersion: 1, id: id(value), sequence: value, kind: 'app-limit-baseline', observedAt: 1792864500000, appVersion: '1.0', ruleId: id(rule), reason: 'baseline', before: null as typeof snapshot | null, after: { ...snapshot },
} });
const fetcher = vi.fn<typeof fetch>();
function mount(ownerId = 'owner-a') {
  return render(<NextIntlClientProvider locale="en" messages={messages}><FocusHistoryPage ownerId={ownerId} /></NextIntlClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetcher); fetcher.mockReset(); auth.listener = null; });

it('reads completed sessions by device with recorded and received dates, without presenting a live timer', async () => {
  fetcher.mockImplementation(async input => String(input).includes('app-limits') ? page([]) : page([session(2), session(3, device(4, 'Replacement iPhone'))]));
  mount();
  expect(await screen.findByRole('heading', { name: 'My iPhone' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Replacement iPhone' })).toBeVisible();
  expect(screen.getByText('Completed work 2')).toBeVisible();
  expect(screen.getAllByText('20 minutes focused · 2 completed rounds')).toHaveLength(2);
  expect(screen.getAllByText(/Received in cloud:/)).toHaveLength(2);
  expect(screen.getByText(/cannot see unuploaded changes/)).toBeVisible();
  expect(screen.queryByRole('button', { name: /start|restore|unlock/i })).not.toBeInTheDocument();
});

it('keeps confirmed rows on a failed next page, retries that page and deduplicates replayed records', async () => {
  const user = userEvent.setup();
  let moreAttempts = 0;
  fetcher.mockImplementation(async input => {
    if (String(input).includes('app-limits')) return page([]);
    if (String(input).includes('after=')) {
      moreAttempts++;
      return moreAttempts === 1 ? new Response(null, { status: 503 }) : page([session(2), session(3)]);
    }
    return page([session(2)], 'opaque-next-page');
  });
  mount();
  await screen.findByText('Completed work 2');
  expect(screen.getByText(/More cloud records are available/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Load more' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh history');
  expect(screen.getByText('Completed work 2')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Completed work 3')).toBeVisible();
  expect(screen.getAllByText('Completed work 2')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
});

it('discards an old account response and clears all history immediately on signout', async () => {
  let resolveOld!: (response: Response) => void;
  fetcher.mockImplementation(input => String(input).includes('app-limits') ? Promise.resolve(page([])) : new Promise(resolve => { resolveOld = resolve; }));
  const view = mount();
  fetcher.mockImplementation(async input => String(input).includes('app-limits') ? page([]) : page([session(8, device(9, 'Second account device'))]));
  view.rerender(<NextIntlClientProvider locale="en" messages={messages}><FocusHistoryPage ownerId="owner-b" /></NextIntlClientProvider>);
  expect(await screen.findByText('Completed work 8')).toBeVisible();
  await act(async () => resolveOld(page([session(2)])));
  expect(screen.queryByText('Completed work 2')).not.toBeInTheDocument();
  act(() => auth.listener?.('SIGNED_OUT', null));
  expect(screen.queryByText('Completed work 8')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/auth/login');
});

it('separates device/rule streaks, orders by source sequence despite clock skew, and shows exact reset values and gaps', async () => {
  const baseline = limit(1);
  const reset = { ...limit(2), event: { ...limit(2).event, kind: 'app-limit-change', reason: 'extraUnlock', before: snapshot,
    observedAt: 1792800000000, after: { ...snapshot, current: 0, overridesToday: 1 } } };
  const unnamed = { ...limit(3, 11), event: { ...limit(3, 11).event, after: { ...snapshot, label: null, current: 4 } } };
  const other = { ...limit(6, 10, device(12, 'Other iPhone')), acknowledgedThrough: 4 };
  fetcher.mockImplementation(async input => String(input).includes('app-limits') ? page([baseline, reset, unnamed, other]) : page([]));
  const user = userEvent.setup(); mount();
  await user.click(screen.getByRole('tab', { name: 'App limits' }));
  const social = within(await screen.findByRole('region', { name: `My iPhone · ${id(1)}` })).getByRole('region', { name: `Social · ${id(10)}` });
  expect(within(social).getByText('Latest confirmed observation: 0 days · Best: 4 days')).toBeVisible();
  expect(within(social).getByText('Extra unlock')).toBeVisible();
  expect(within(social).getByText('Streak: 2 → 0 days')).toBeVisible();
  expect(screen.getByRole('heading', { name: `Unnamed limit · ${id(11).slice(-8)}` })).toBeVisible();
  expect(screen.getByText(/Earlier device records are missing/)).toBeVisible();
  expect(screen.queryByText(/6 days|8 days/)).not.toBeInTheDocument();
});

it('resolves a continued origin from the history row alone and retries unavailable lineage without hiding history', async () => {
  const applied = { ...limit(2), event: { ...limit(2).event, kind: 'app-limit-change', reason: 'limitCreated' } };
  const origin = device(30, 'Previous iPhone');
  const receipt = { schemaVersion: 1, operationId: id(40), confirmedAt: 1792864400000,
    source: { source: origin, ruleId: id(31), checkpoint: 9, event: { eventId: id(32), sequence: 9 }, snapshot, observedAt: 1792000000000, receivedAt: 1792000010000 },
    destination: { source: applied.source, ruleId: id(10), expectedCheckpoint: 1, expectedRuleEvent: null, applyEventId: id(2), label: 'Social', dailyUnlocks: 3, minutes: 5 }, restored: { current: 2, best: 4 } };
  let attempts = 0;
  fetcher.mockImplementation(async input => {
    if (String(input).includes('/continuations?')) return ++attempts === 1 ? new Response(null, { status: 503 }) : Response.json({ schemaVersion: 1, receipt, application: { state: 'recorded', eventId: id(2), sequence: 2, receivedAt: 1792864800000 } });
    return String(input).includes('app-limits') ? page([applied]) : page([]);
  });
  const user = userEvent.setup(); mount();
  await user.click(screen.getByRole('tab', { name: 'App limits' }));
  await user.click(await screen.findByRole('button', { name: 'View continuation source' }));
  expect(await screen.findByText('Continuation details are unavailable.')).toBeVisible();
  expect(screen.getByText('Limit created')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Retry continuation details' }));
  expect(await screen.findByText('Continued from Previous iPhone · Social')).toBeVisible();
  expect(screen.getByText('2 recorded days continued. Unobserved gaps were not credited.')).toBeVisible();
  expect(screen.queryByRole('button', { name: /restore|apply|unlock/i })).not.toBeInTheDocument();
});

it('distinguishes unavailable history from a confirmed empty account and expires both tabs on an unauthorized read', async () => {
  fetcher.mockImplementation(async input => String(input).includes('app-limits') ? page([]) : new Response(null, { status: 503 }));
  const user = userEvent.setup(); mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('History is unavailable. Try again.');
  expect(screen.queryByText('No completed sessions received yet.')).not.toBeInTheDocument();
  fetcher.mockImplementation(async () => page([]));
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('No completed sessions received yet.')).toBeVisible();
  fetcher.mockImplementation(async () => new Response(null, { status: 401 }));
  await user.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByRole('link', { name: 'Sign in again' })).toBeVisible();
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
});

it('treats a legacy event without lineage as ordinary history, not a failed restore', async () => {
  const applied = { ...limit(2), event: { ...limit(2).event, kind: 'app-limit-change', reason: 'limitCreated' } };
  fetcher.mockImplementation(async input => String(input).includes('/continuations?') ? Response.json({ error: 'not_found' }, { status: 404 })
    : String(input).includes('app-limits') ? page([applied]) : page([]));
  const user = userEvent.setup(); mount();
  await user.click(screen.getByRole('tab', { name: 'App limits' }));
  await user.click(await screen.findByRole('button', { name: 'View continuation source' }));
  expect(await screen.findByText('No recorded continuation for this change.')).toBeVisible();
  expect(screen.getByText('Limit created')).toBeVisible();
});
