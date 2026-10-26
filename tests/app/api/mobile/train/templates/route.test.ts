import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/mobile/train/templates/commands/route';
import { GET as capabilities } from '@/app/api/mobile/train/templates/capabilities/route';
import { GET as list } from '@/app/api/mobile/train/templates/route';
import { GET as detail } from '@/app/api/mobile/train/templates/[id]/route';
import { GET as definitions } from '@/app/api/mobile/train/templates/definitions/route';

const { rpc, getUser } = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock('@supabase/supabase-js', async importOriginal => ({
  ...await importOriginal<typeof import('@supabase/supabase-js')>(),
  createClient: vi.fn(() => ({ rpc, auth: { getUser } })),
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const owner = '64190000-0000-4000-8000-000000000001';
const id = '64190000-0000-4000-8000-000000000002';
const envelope = { protocolVersion: 1, operationId: id,
  command: { kind: 'create', name: 'Empty session', notes: null, entries: [] } };
const template = { id, ownerId: owner, version: '9007199254740993', name: 'Empty session', notes: null, archivedAt: null, entries: [] };
const receipt = { operationId: id, operation: 'create', ownerId: owner, templateId: id, acceptedAt: '2026-10-26T00:00:00Z', template };
const ready = (enabled: boolean) => ({ protocolVersion: 1, templates: { contractVersion: 1, ready: enabled } });
const request = (body: unknown, bearer = true) => new Request('https://example.test/api/mobile/train/templates/commands', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer fixture-session' } : {}) }, body: JSON.stringify(body),
});

describe('authenticated saved-template command boundary', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.test');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fixture-public-key');
    getUser.mockReset().mockResolvedValue({ data: { user: { id: owner } }, error: null });
    rpc.mockReset().mockImplementation(async (name: string) => ({ data: name === 'train_template_capabilities' ? ready(true) : { status: 'accepted', receipt }, error: null }));
  });
  afterEach(() => vi.unstubAllEnvs());
  it('saves an empty template without rounding its revision or changing the frozen request', async () => {
    const response = await POST(request(envelope));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ protocolVersion: 1, receipt });
    expect(rpc).toHaveBeenLastCalledWith('execute_train_template_command', { p_request: envelope });
  });
  it('keeps a false rollout capability and missing bearer separate from durable rejection', async () => {
    rpc.mockResolvedValue({ data: ready(false), error: null });
    const response = await capabilities(new Request('https://example.test', { headers: { Authorization: 'Bearer fixture-session' } }));
    expect(await response.json()).toEqual(ready(false));
    expect(await (await POST(request(envelope))).json()).toEqual({ protocolVersion: 1, error: { code: 'not_ready' } });
    expect((await POST(request(envelope, false))).status).toBe(401);
    expect(rpc.mock.calls.some(([name]) => name === 'execute_train_template_command')).toBe(false);
  });
  it('reads raw target authority, owned closures and real selection identities through paged native routes', async () => {
    const unkeyed = { kind: 'unkeyed-preset', exerciseId: id, version: '9007199254740993', name: 'Actual legacy name', equipment: 'band', mode: 'duration_weight', convention: null };
    const read = { protocolVersion: 1, template, definitions: [], startability: { templateVersion: template.version, ready: true, reasons: [] }, usage: { lastPerformedAt: null } };
    rpc.mockResolvedValueOnce({ data: { status: 'available', protocolVersion: 1, templates: [read], nextCursor: id }, error: null })
      .mockResolvedValueOnce({ data: { status: 'available', ...read }, error: null })
      .mockResolvedValueOnce({ data: { status: 'available', protocolVersion: 1, definitions: [{ definition: unkeyed, archivedAt: '2026-10-25T01:00:00Z' }], nextCursor: null }, error: null });
    const headers = { Authorization: 'Bearer fixture-session' };
    expect(await (await list(new Request(`https://example.test?after=${owner}`, { headers }))).json()).toEqual({ protocolVersion: 1, templates: [read], nextCursor: id });
    expect(await (await detail(new Request('https://example.test', { headers }), { params: Promise.resolve({ id }) })).json()).toEqual(read);
    expect(await (await definitions(new Request('https://example.test', { headers }))).json()).toEqual({ protocolVersion: 1, definitions: [{ definition: unkeyed, archivedAt: '2026-10-25T01:00:00Z' }], nextCursor: null });
    expect(rpc.mock.calls).toEqual([
      ['read_train_templates', { p_id: null, p_after: owner }], ['read_train_templates', { p_id: id, p_after: null }], ['read_train_template_definitions', { p_after: null }],
    ]);
  });
  it('passes opaque command keys unchanged to authoritative SQL validation', async () => {
    const command = JSON.parse('{"kind":"create","name":"Empty session","notes":null,"entries":[],"__proto__":{"kept":"as data"}}');
    rpc.mockImplementation(async (name: string) => ({ data: name === 'train_template_capabilities' ? ready(true) : { status: 'invalid_request' }, error: null }));
    const response = await POST(request({ ...envelope, command }));
    expect(response.status).toBe(400);
    const sent = rpc.mock.calls.find(([name]) => name === 'execute_train_template_command')![1].p_request.command;
    expect(Object.hasOwn(sent, '__proto__')).toBe(true);
    expect(sent).toEqual(command);
  });
  it.each([
    { result: { data: null, error: { message: 'private SQL details' } } },
    { result: { data: { status: 'accepted', receipt: { ...receipt, ownerId: id } }, error: null } },
    { result: { data: { status: 'accepted', receipt: { ...receipt, template: { ...template, name: 'Another proposal' } } }, error: null } },
  ])('does not acknowledge unavailable or mismatched command results', async ({ result }) => {
    rpc.mockImplementation(async (name: string) => name === 'train_template_capabilities' ? { data: ready(true), error: null } : result);
    const response = await POST(request(envelope));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ protocolVersion: 1, error: { code: 'unavailable' } });
  });
  it('does not expose another owner or malformed data from any read boundary', async () => {
    const foreign = { protocolVersion: 1, template: { ...template, ownerId: id }, definitions: [],
      startability: { templateVersion: template.version, ready: true, reasons: [] }, usage: { lastPerformedAt: null } };
    const headers = { Authorization: 'Bearer fixture-session' };
    rpc.mockResolvedValueOnce({ data: { status: 'available', ...foreign }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'private template error' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'private definition error' } });
    const responses = [await detail(new Request('https://example.test', { headers }), { params: Promise.resolve({ id }) }),
      await list(new Request('https://example.test', { headers })), await definitions(new Request('https://example.test', { headers }))];
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ protocolVersion: 1, error: { code: 'unavailable' } });
    }
  });
  it('handles capability failure and thrown transport errors without reflecting private details', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'private capability error' } });
    expect((await POST(request(envelope))).status).toBe(503);
    getUser.mockRejectedValueOnce(new Error('private transport details'));
    expect(await (await POST(request(envelope))).json()).toEqual({ protocolVersion: 1, error: { code: 'unavailable' } });
  });
});
