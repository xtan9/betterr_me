import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentTemplateCommand, prepareTemplateCommand, resolveTemplateRejection, sendTemplateCommand } from '@/lib/fitness/template-command-client';
import fixture from '@/tests/fixtures/workout-templates.json';

const owner = fixture.read.template.ownerId;
const request = fixture.editRequest;
const rejection = { ...fixture.rejected.rejection, operationId: request.operationId };
describe('durable browser template commands', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.stubGlobal('fetch', vi.fn()); vi.spyOn(crypto, 'randomUUID').mockReturnValue(request.operationId as `${string}-${string}-${string}-${string}-${string}`); });
  it('retains the exact pending command across a lost response and local acknowledgement failure', async () => {
    const frozen = prepareTemplateCommand(owner, request.command);
    expect(frozen).toEqual(request);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('lost response'));
    await expect(sendTemplateCommand(owner, frozen)).rejects.toThrow('lost response');
    expect(prepareTemplateCommand(owner, request.command)).toEqual(frozen);
    expect(() => prepareTemplateCommand(owner, { ...request.command, expectedVersion: '9' })).toThrow('pending_command');
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(fixture.accepted));
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('disk full'); });
    await expect(sendTemplateCommand(owner, frozen)).rejects.toThrow('disk full');
    write.mockRestore();
    expect(currentTemplateCommand(owner)).toMatchObject({ state: 'pending', request: frozen });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(fixture.accepted));
    expect(await sendTemplateCommand(owner, frozen)).toEqual(fixture.accepted.receipt);
    expect(currentTemplateCommand(owner)).toBeNull();
    expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as string)).toEqual(frozen);
  });
  it('atomically replaces only a definitive rejection, retaining it when durable replacement fails', async () => {
    const frozen = prepareTemplateCommand(owner, request.command);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ protocolVersion: 1, error: { code: 'version_conflict' }, rejection }, { status: 409 }));
    await expect(sendTemplateCommand(owner, frozen)).rejects.toThrow('version_conflict');
    expect(() => prepareTemplateCommand(owner, request.command)).toThrow('review_required');
    const replacement = { ...request.command, expectedVersion: '10' };
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000042');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('disk full'); });
    expect(() => resolveTemplateRejection(owner, replacement)).toThrow('disk full');
    write.mockRestore();
    expect(currentTemplateCommand(owner)).toMatchObject({ state: 'rejected', request: frozen, rejection });
    const next = resolveTemplateRejection(owner, replacement);
    expect(currentTemplateCommand(owner)).toMatchObject({ state: 'pending', request: next });
    expect(next?.operationId).not.toBe(frozen.operationId);
    expect(currentTemplateCommand('00000000-0000-4000-8000-000000000099')).toBeNull();
  });
  it.each([
    { status: 201, body: fixture.accepted },
    { status: 200, body: { ...fixture.accepted, error: { code: 'unavailable' } } },
    { status: 401, body: { protocolVersion: 1, error: { code: 'version_conflict' }, rejection } },
    { status: 503, body: { protocolVersion: 1, error: { code: 'version_conflict' }, rejection } },
    { status: 409, body: { protocolVersion: 1, error: { code: 'version_conflict', details: 'untrusted' }, rejection } },
  ])('keeps uncertainty across remount when HTTP $status does not carry the exact outcome contract', async ({ status, body }) => {
    const frozen = prepareTemplateCommand(owner, request.command);
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(body, { status }));
    await expect(sendTemplateCommand(owner, frozen)).rejects.toThrow();
    expect(currentTemplateCommand(owner)).toMatchObject({ state: 'pending', request: frozen });
    expect(() => resolveTemplateRejection(owner)).toThrow('review_required');
    // A normal retry of the same persisted bytes can still acknowledge the
    // first receipt; a misleading status must never authorize a new operation.
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(fixture.accepted));
    expect(await sendTemplateCommand(owner, prepareTemplateCommand(owner, request.command))).toEqual(fixture.accepted.receipt);
    expect(currentTemplateCommand(owner)).toBeNull();
  });
});
