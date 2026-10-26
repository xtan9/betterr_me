import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RoutinesPageContent } from '@/components/fitness/routines/routines-page-content';
import { currentTemplateCommand } from '@/lib/fitness/template-command-client';
import type { TemplateRead, TemplateRequest } from '@/lib/validations/train-templates';
import fixture from '@/tests/fixtures/workout-templates.json';
import messages from '@/i18n/messages/en.json';
import { WorkoutFinishDialog } from '@/components/fitness/workout-logger/workout-finish-dialog';
import type { WorkoutWithExercises } from '@/lib/db/types';
import type { ReactNode } from 'react';

const owner = fixture.read.template.ownerId;
const auth = vi.hoisted(() => ({ getSession: vi.fn(), listeners: new Set<(event: string, session: { user: { id: string } } | null) => void>() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {
  getSession: auth.getSession,
  onAuthStateChange: (listener: (event: string, session: { user: { id: string } } | null) => void) => {
    auth.listeners.add(listener); return { data: { subscription: { unsubscribe: () => auth.listeners.delete(listener) } } };
  },
} }) }));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const weightPreference = vi.hoisted(() => ({ unit: 'kg' as 'kg' | 'lbs' }));
vi.mock('@/lib/hooks/use-active-workout', () => ({ useWeightUnit: () => weightPreference.unit }));
beforeEach(() => { weightPreference.unit = 'kg'; auth.getSession.mockResolvedValue({ data: { session: { user: { id: owner } } } }); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); auth.listeners.clear(); navigation.push.mockClear(); });
const mount = (content: ReactNode = <RoutinesPageContent />) => render(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
  <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">{content}</NextIntlClientProvider>
</SWRConfig>);

it('edits the real routines page through the captured command API without flattening zero, blank or deferred legacy targets', async () => {
  const read: TemplateRead = structuredClone(fixture.read) as TemplateRead, requests: TemplateRequest[] = [];
  read.template.entries[0].notes = 'Legacy notes '.repeat(200); read.template.entries[0].restSeconds = 777;
  read.startability = { templateVersion: '7', ready: false, reasons: [{ code: 'template_metadata_invalid', field: 'notes' }, { code: 'rest_out_of_range', entryId: read.template.entries[0].id }] };
  const original = structuredClone(read.template.entries);
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith('/capabilities')) return Response.json({ protocolVersion: 1, templates: { contractVersion: 1, ready: true } });
    if (input.endsWith('/definitions')) return Response.json({ protocolVersion: 1, definitions: read.definitions.map(definition => ({ definition, archivedAt: null })), nextCursor: null });
    if (input === '/api/routines/templates') return Response.json({ protocolVersion: 1, templates: [read], nextCursor: null });
    if (input === `/api/routines/templates/${read.template.id}`) return Response.json(read);
    if (input === '/api/routines/templates/commands') {
      const request = JSON.parse(String(init?.body)); requests.push(request);
      expect((init?.headers as Record<string, string>)['X-Train-Owner']).toBe(owner);
      expect(request.command).toEqual({ kind: 'edit', templateId: read.template.id, expectedVersion: '7', changes: [{ kind: 'patch-template', patch: { name: 'Renamed without target loss' } }] });
      read.template.name = 'Renamed without target loss'; read.template.version = '10'; read.startability.templateVersion = '10';
      return Response.json({ protocolVersion: 1, receipt: { operationId: request.operationId, operation: 'edit', ownerId: owner, templateId: read.template.id, acceptedAt: '2026-10-25T12:00:00Z', template: read.template } });
    }
    if (input === '/api/routines') return Response.json({ routines: [] });
    throw new Error(`Unexpected request ${input}`);
  }));
  const user = userEvent.setup(), page = mount();
  await screen.findByRole('heading', { name: read.template.name });
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Renamed without target loss' } });
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  await screen.findByRole('heading', { name: 'Renamed without target loss' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(requests).toHaveLength(1); expect(currentTemplateCommand(owner)).toBeNull(); expect(read.template.entries).toEqual(original);
  page.unmount(); mount();
  await screen.findByRole('heading', { name: 'Renamed without target loss' });
  await user.click(screen.getByRole('button', { name: 'View details' }));
  expect(screen.getByText('0.123')).toBeInTheDocument();
  expect(screen.getAllByText('1.25').length).toBeGreaterThan(0);
});

it.each([
  { unit: 'kg' as const, label: 'kg', warmup: '40', working: '50', warmupKg: 40, workingKg: 50 },
  { unit: 'lbs' as const, label: 'lb', warmup: '1', working: '2', warmupKg: 0.45359237, workingKg: 0.90718474 },
])('creates ordered heterogeneous targets in $unit with blank defaults, rest and duplicate exercise references', async ({ unit, label, warmup, working, warmupKg, workingKg }) => {
  weightPreference.unit = unit;
  const reads: TemplateRead[] = [], requests: TemplateRequest[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith('/capabilities')) return Response.json({ protocolVersion: 1, templates: { contractVersion: 1, ready: true } });
    if (input.endsWith('/definitions')) return Response.json({ protocolVersion: 1, definitions: fixture.read.definitions.map(definition => ({ definition, archivedAt: null })), nextCursor: null });
    if (input === '/api/routines/templates') return Response.json({ protocolVersion: 1, templates: reads, nextCursor: null });
    if (input === '/api/routines/templates/commands') {
      const request = JSON.parse(String(init?.body)); requests.push(request);
      const entries = request.command.entries;
      expect(entries).toHaveLength(2); expect(entries[0].id).not.toBe(entries[1].id);
      expect(entries[0].exerciseId).toBe(entries[1].exerciseId);
      expect(entries[0].targets).toMatchObject([
        { kind: 'working', measurements: { weightKg: workingKg, reps: 8, durationSeconds: null, distanceMeters: null } },
        { kind: 'warmup', measurements: { weightKg: warmupKg, reps: 5, durationSeconds: null, distanceMeters: null } },
        { kind: 'working', measurements: { weightKg: null, reps: null, durationSeconds: null, distanceMeters: null } },
      ]);
      expect(entries[0].restSeconds).toBe(45); expect(entries[1].restSeconds).toBe(90);
      const read = structuredClone(fixture.read) as TemplateRead;
      read.template = { id: request.operationId, ownerId: owner, version: '3', name: request.command.name, notes: null, archivedAt: null,
        entries: entries.map((entry: Record<string, unknown> & { targets: { id: string; kind: 'working' | 'warmup'; measurements: Record<string, number | null> }[] }) => ({ ...entry, legacySource: null,
          targets: { kind: 'sets', items: entry.targets.map(target => ({ ...target, measurements: Object.fromEntries(Object.entries(target.measurements).map(([field, value]) => [field, value === null ? null : String(value)])) })) } })) };
      read.startability.templateVersion = '3'; reads.push(read);
      return Response.json({ protocolVersion: 1, receipt: { operationId: request.operationId, operation: 'create', ownerId: owner, templateId: request.operationId, acceptedAt: '2026-10-25T12:00:00Z', template: read.template } });
    }
    throw new Error(`Unexpected request ${input}`);
  }));
  const user = userEvent.setup(); mount();
  await user.click(await screen.findByRole('button', { name: 'Create Routine' }));
  const form = within(screen.getByRole('dialog'));
  fireEvent.change(form.getByLabelText('Name'), { target: { value: 'Ordered training' } });
  await user.click(form.getByRole('button', { name: 'Add Exercise' }));
  await user.click(form.getByRole('button', { name: 'Barbell Bench Press' }));
  const entry = within(form.getByRole('group', { name: 'Barbell Bench Press · 1' }));
  const first = within(entry.getByRole('group', { name: 'Targets 1' })), second = within(entry.getByRole('group', { name: 'Targets 2' }));
  expect(first.getByLabelText('Repetitions')).toHaveValue('');
  fireEvent.change(first.getByLabelText(`Load (${label})`), { target: { value: warmup } });
  fireEvent.change(first.getByLabelText('Repetitions'), { target: { value: '5' } });
  await user.selectOptions(first.getByRole('combobox'), 'warmup');
  fireEvent.change(second.getByLabelText(`Load (${label})`), { target: { value: working } });
  fireEvent.change(second.getByLabelText('Repetitions'), { target: { value: '8' } });
  await user.click(second.getByRole('button', { name: 'Move up' }));
  fireEvent.change(entry.getByLabelText('Rest (seconds)'), { target: { value: '45' } });
  await user.click(form.getByRole('button', { name: 'Add Exercise' }));
  await user.click(form.getByRole('button', { name: 'Barbell Bench Press' }));
  await user.click(form.getByRole('button', { name: 'Save' }));
  await screen.findByRole('heading', { name: 'Ordered training' });
  expect(requests).toHaveLength(1); expect(currentTemplateCommand(owner)).toBeNull();
});

it('recovers an uncertain archive after remount with the same request, then restores the same identity', async () => {
  const read = structuredClone(fixture.read) as TemplateRead, requests: TemplateRequest[] = [];
  let firstReceipt: unknown, lose = true;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith('/capabilities')) return Response.json({ protocolVersion: 1, templates: { contractVersion: 1, ready: true } });
    if (input.endsWith('/definitions')) return Response.json({ protocolVersion: 1, definitions: [], nextCursor: null });
    if (input === '/api/routines/templates') return Response.json({ protocolVersion: 1, templates: [read], nextCursor: null });
    if (input === `/api/routines/templates/${read.template.id}`) return Response.json(read);
    if (input === '/api/routines/templates/commands') {
      const request = JSON.parse(String(init?.body)); requests.push(request);
      if (request.command.kind === 'archive') {
        if (!firstReceipt) {
          read.template.archivedAt = '2026-10-25T12:00:00Z'; read.template.version = '9'; read.startability.templateVersion = '9';
          firstReceipt = { protocolVersion: 1, receipt: { operationId: request.operationId, operation: 'archive', ownerId: owner, templateId: read.template.id, acceptedAt: read.template.archivedAt, template: structuredClone(read.template) } };
        }
        if (lose) { lose = false; throw new Error('Response lost after commit'); }
        return Response.json(firstReceipt);
      }
      expect(request.command).toEqual({ kind: 'restore', templateId: read.template.id, expectedVersion: '9' });
      read.template.archivedAt = null; read.template.version = '12'; read.startability.templateVersion = '12';
      return Response.json({ protocolVersion: 1, receipt: { operationId: request.operationId, operation: 'restore', ownerId: owner, templateId: read.template.id, acceptedAt: '2026-10-25T12:05:00Z', template: read.template } });
    }
    throw new Error(`Unexpected request ${input}`);
  }));
  const user = userEvent.setup(), page = mount();
  await user.click(await screen.findByRole('button', { name: 'Archive' }));
  await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive' }));
  await screen.findByText(messages.routines.templates.pending);
  expect(screen.getByRole('alert')).toHaveTextContent(messages.routines.templates.commandFailed);
  const pending = currentTemplateCommand(owner)!.request;
  page.unmount(); mount();
  await user.click(await screen.findByRole('button', { name: 'Retry saved request' }));
  await waitFor(() => expect(currentTemplateCommand(owner)).toBeNull());
  expect(requests.slice(0, 2)).toEqual([pending, pending]);
  expect(screen.queryByRole('heading', { name: read.template.name })).not.toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Archived' }));
  await user.click(await screen.findByRole('button', { name: 'Restore' }));
  await user.click(screen.getByRole('tab', { name: 'Active' }));
  await screen.findByRole('heading', { name: read.template.name });
  expect(read.template.entries).toEqual(fixture.read.template.entries);
});

it('retains a rejected edit across remount and shows current and proposed content before a new reviewed command', async () => {
  const read = structuredClone(fixture.read) as TemplateRead, requests: TemplateRequest[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith('/capabilities')) return Response.json({ protocolVersion: 1, templates: { contractVersion: 1, ready: true } });
    if (input.endsWith('/definitions')) return Response.json({ protocolVersion: 1, definitions: [], nextCursor: null });
    if (input === '/api/routines/templates') return Response.json({ protocolVersion: 1, templates: [read], nextCursor: null });
    if (input === `/api/routines/templates/${read.template.id}`) return Response.json(read);
    if (input === '/api/routines/templates/commands') {
      const request = JSON.parse(String(init?.body)); requests.push(request);
      if (requests.length === 1) {
        read.template.name = 'Other device name'; read.template.version = '10'; read.startability.templateVersion = '10';
        return Response.json({ protocolVersion: 1, error: { code: 'version_conflict' }, rejection: { operationId: request.operationId, operation: 'edit', ownerId: owner, templateId: read.template.id,
          rejectedAt: '2026-10-25T12:00:00Z', code: 'version_conflict', current: read.template } }, { status: 409 });
      }
      expect(request.operationId).not.toBe(requests[0].operationId);
      expect(request.command).toEqual({ kind: 'edit', templateId: read.template.id, expectedVersion: '10', changes: [{ kind: 'patch-template', patch: { name: 'My retained proposal' } }] });
      read.template.name = 'My retained proposal'; read.template.version = '13'; read.startability.templateVersion = '13';
      return Response.json({ protocolVersion: 1, receipt: { operationId: request.operationId, operation: 'edit', ownerId: owner, templateId: read.template.id, acceptedAt: '2026-10-25T12:03:00Z', template: read.template } });
    }
    throw new Error(`Unexpected request ${input}`);
  }));
  const user = userEvent.setup(), page = mount();
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My retained proposal' } });
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(currentTemplateCommand(owner)?.state).toBe('rejected'));
  page.unmount(); mount();
  await user.click(await screen.findByRole('button', { name: 'Review proposal' }));
  const preview = within(screen.getByRole('dialog'));
  expect(await preview.findByText('Other device name')).toBeInTheDocument();
  expect(preview.getByText('My retained proposal')).toBeInTheDocument();
  expect(requests).toHaveLength(1);
  await user.click(preview.getByRole('button', { name: 'Apply reviewed changes' }));
  await screen.findByRole('heading', { name: 'My retained proposal' });
  await waitFor(() => expect(currentTemplateCommand(owner)).toBeNull());
  const journal = JSON.parse(localStorage.getItem(`train:template-command-journal:${owner}`)!);
  expect(journal.rows[0]).toMatchObject({ state: 'superseded', replacementOperationId: requests[1].operationId });
  expect(journal.rows[1]).toMatchObject({ state: 'accepted' });
  expect(read.template.entries).toEqual(fixture.read.template.entries);
});

it('discloses the existing server conversion and retries Save as Routine after remount without resending client-derived sets or finishing', async () => {
  const timestamp = '2026-10-25T12:00:00Z', workoutId = '00000000-0000-4000-8000-000000000099';
  const workout: WorkoutWithExercises = { id: workoutId, user_id: owner, title: 'Zero legacy work', status: 'in_progress', started_at: timestamp, completed_at: null,
    duration_seconds: null, notes: null, routine_id: null, created_at: timestamp, updated_at: timestamp, exercises: [{
      id: '00000000-0000-4000-8000-000000000098', workout_id: workoutId, exercise_id: fixture.read.definitions[0].exerciseId, sort_order: 0,
      notes: null, rest_timer_seconds: null, created_at: timestamp, exercise: { id: fixture.read.definitions[0].exerciseId, user_id: null, name: 'Bench press', muscle_group_primary: 'chest',
        muscle_groups_secondary: [], equipment: 'barbell', exercise_type: 'weight_reps', is_custom: false, created_at: timestamp, updated_at: timestamp, exercise_media: null },
      sets: [{ id: '00000000-0000-4000-8000-000000000097', workout_exercise_id: '00000000-0000-4000-8000-000000000098', set_number: 1,
        set_type: 'normal', weight_kg: 0.123, reps: 0, duration_seconds: null, distance_meters: null, is_completed: false, rpe: null, created_at: timestamp, updated_at: timestamp }],
    }] };
  const requests: TemplateRequest[] = [], finish = vi.fn(); let receipt: unknown, lose = true;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith('/capabilities')) return Response.json({ protocolVersion: 1, templates: { contractVersion: 1, ready: true } });
    if (input === '/api/routines/templates/commands') {
      const request = JSON.parse(String(init?.body)); requests.push(request);
      expect(request.command).toEqual({ kind: 'save-workout-as-template', workoutId, name: 'Zero legacy work' });
      receipt ??= { protocolVersion: 1, receipt: { operationId: request.operationId, operation: 'save-workout-as-template', ownerId: owner,
        templateId: request.operationId, acceptedAt: timestamp, template: { ...structuredClone(fixture.read.template), id: request.operationId, name: 'Zero legacy work', version: '1' } } };
      if (lose) { lose = false; throw new Error('Lost response'); }
      return Response.json(receipt);
    }
    throw new Error(`Unexpected request ${input}`);
  }));
  const content = <WorkoutFinishDialog open onOpenChange={() => {}} workout={workout} durationSeconds={30} weightUnit="kg" onConfirm={finish} />;
  const user = userEvent.setup(), page = mount(content);
  await user.click(await screen.findByRole('button', { name: 'Save as Routine' }));
  expect(screen.getByText(messages.routines.templates.saveAsDisclosure)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(currentTemplateCommand(owner)?.state).toBe('pending'));
  page.unmount(); mount(content);
  await user.click(await screen.findByRole('button', { name: 'Retry saved request' }));
  await waitFor(() => expect(currentTemplateCommand(owner)).toBeNull());
  expect(requests).toHaveLength(2); expect(requests[0]).toEqual(requests[1]); expect(finish).not.toHaveBeenCalled();
});

it('keeps a late previous-owner acceptance out of the newly authenticated account’s screen and journal', async () => {
  const other = '00000000-0000-4000-8000-000000000222'; let release: (() => void) | undefined;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith('/capabilities')) return Response.json({ protocolVersion: 1, templates: { contractVersion: 1, ready: true } });
    if (input.endsWith('/definitions')) return Response.json({ protocolVersion: 1, definitions: [], nextCursor: null });
    if (input === '/api/routines/templates') return Response.json({ protocolVersion: 1, templates: [], nextCursor: null });
    if (input === '/api/routines/templates/commands') {
      const request = JSON.parse(String(init?.body));
      expect((init?.headers as Record<string, string>)['X-Train-Owner']).toBe(owner);
      await new Promise<void>(resolve => { release = resolve; });
      return Response.json({ protocolVersion: 1, receipt: { operationId: request.operationId, operation: 'create', ownerId: owner, templateId: request.operationId, acceptedAt: '2026-10-25T12:00:00Z',
        template: { id: request.operationId, ownerId: owner, version: '1', name: request.command.name, notes: null, archivedAt: null, entries: [] } } });
    }
    throw new Error(`Unexpected request ${input}`);
  }));
  const user = userEvent.setup(); mount();
  await user.click(await screen.findByRole('button', { name: 'Create Routine' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Private owner A proposal' } });
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(release).toBeTypeOf('function'));
  await act(async () => { auth.listeners.forEach(listener => listener('SIGNED_IN', { user: { id: other } })); });
  await screen.findByRole('button', { name: 'Create Routine' });
  await act(async () => { release!(); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByText('Private owner A proposal')).not.toBeInTheDocument();
  expect(currentTemplateCommand(other)).toBeNull();
  expect(localStorage.getItem(`train:template-command-journal:${other}`)).toBeNull();
});

it('does not read or write an ownerless library when session recovery fails', async () => {
  auth.getSession.mockRejectedValue(new Error('Session unavailable'));
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); mount();
  await screen.findByText(messages.routines.templates.unavailable);
  expect(fetcher).not.toHaveBeenCalled();
});

it('preserves the deferred duration-plus-load editor and rejects newly authored zero duration until explicitly corrected', async () => {
  const exerciseId = fixture.read.definitions[0].exerciseId, requests: TemplateRequest[] = [], reads: TemplateRead[] = [];
  const definition = { kind: 'unkeyed-preset' as const, exerciseId, version: '1', name: 'Legacy loaded hold', equipment: 'band' as const, mode: 'duration_weight' as const, convention: null };
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (input.endsWith('/capabilities')) return Response.json({ protocolVersion: 1, templates: { contractVersion: 1, ready: true } });
    if (input.endsWith('/definitions')) return Response.json({ protocolVersion: 1, definitions: [{ definition, archivedAt: null }], nextCursor: null });
    if (input === '/api/routines/templates') return Response.json({ protocolVersion: 1, templates: reads, nextCursor: null });
    if (input === '/api/routines/templates/commands') {
      const request = JSON.parse(String(init?.body)); requests.push(request);
      expect(request.command.entries[0].targets[0].measurements).toEqual({ weightKg: 12.5, reps: null, durationSeconds: 90, distanceMeters: null });
      const entry = request.command.entries[0], template = { id: request.operationId, ownerId: owner, version: '3', name: request.command.name, notes: null, archivedAt: null,
        entries: [{ ...entry, legacySource: null, targets: { kind: 'sets', items: entry.targets.map((target: { id: string; kind: 'working'; measurements: Record<string, number | null> }) => ({ ...target,
          measurements: Object.fromEntries(Object.entries(target.measurements).map(([field, value]) => [field, value === null ? null : String(value)])) })) } }] };
      reads.push({ protocolVersion: 1, template, definitions: [definition], startability: { templateVersion: '3', ready: false, reasons: [{ code: 'mode_unsupported', entryId: entry.id }] }, usage: { lastPerformedAt: null } });
      return Response.json({ protocolVersion: 1, receipt: { operationId: request.operationId, operation: 'create', ownerId: owner, templateId: request.operationId, acceptedAt: '2026-10-25T12:00:00Z', template } });
    }
    if (input.endsWith('/start')) return Response.json({ workout: { id: '00000000-0000-4000-8000-000000000555' } });
    throw new Error(`Unexpected request ${input}`);
  }));
  const user = userEvent.setup(); mount();
  await user.click(await screen.findByRole('button', { name: 'Create Routine' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Timed band work' } });
  await user.click(screen.getByRole('button', { name: 'Add Exercise' }));
  await user.click(screen.getByRole('button', { name: 'Legacy loaded hold' }));
  const target = within(screen.getByRole('group', { name: 'Targets 1' }));
  fireEvent.change(target.getByLabelText('Load (kg)'), { target: { value: '12.5' } });
  fireEvent.change(target.getByLabelText('Duration (seconds)'), { target: { value: '0' } });
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(messages.routines.measurementInvalid); expect(requests).toHaveLength(0);
  fireEvent.change(target.getByLabelText('Duration (seconds)'), { target: { value: '90' } });
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('heading', { name: 'Timed band work' });
  expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Start' }));
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/workouts/active'));
});
