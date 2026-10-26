import { z } from 'zod';
import { exerciseIdSchema } from '@/lib/validations/train-exercises';
import { templateCommandEnvelopeSchema, templateReceiptSchema, templateRejectionSchema, templateReceiptMatchesRequest,
  templateAcceptedResponseSchema, templateRejectedResponseSchema, templateRejectionStatus,
  type TemplateRequest, type TemplateReceipt, type TemplateRejection } from '@/lib/validations/train-templates';

export type { TemplateRequest, TemplateReceipt, TemplateRejection };
export type TemplateJournal = {
  ownerId: string; request: TemplateRequest; state: 'pending' | 'accepted' | 'rejected' | 'resolved' | 'superseded';
  receipt?: TemplateReceipt; rejection?: TemplateRejection; replacementOperationId?: string;
};
const rowSchema = z.object({ ownerId: exerciseIdSchema, request: templateCommandEnvelopeSchema,
  state: z.enum(['pending', 'accepted', 'rejected', 'resolved', 'superseded']), receipt: templateReceiptSchema.optional(),
  rejection: templateRejectionSchema.optional(), replacementOperationId: exerciseIdSchema.optional(),
}).strict().refine(row => {
  if (row.state === 'pending') return !row.receipt && !row.rejection && !row.replacementOperationId;
  const evidence = row.state === 'accepted' ? row.receipt : row.rejection;
  if (!evidence || evidence.ownerId !== row.ownerId || evidence.operationId !== row.request.operationId
    || evidence.operation !== row.request.command.kind || evidence.templateId !== targetId(row.request)) return false;
  return row.state === 'accepted' ? !row.rejection && !row.replacementOperationId && templateReceiptMatchesRequest(row.receipt!, row.request)
    : !row.receipt && (row.state === 'superseded' ? !!row.replacementOperationId : !row.replacementOperationId);
});
const journalSchema = z.object({ version: z.literal(1), ownerId: exerciseIdSchema, active: exerciseIdSchema.nullable(), rows: z.array(rowSchema) }).strict()
  .refine(journal => new Set(journal.rows.map(row => row.request.operationId)).size === journal.rows.length
    && journal.rows.every(row => row.ownerId === journal.ownerId)
    && (journal.active === null || journal.rows.some(row => row.request.operationId === journal.active && ['pending', 'rejected'].includes(row.state))));
type Journal = z.infer<typeof journalSchema>;
const event = 'train-template-command-changed';
const key = (owner: string) => `train:template-command-journal:${owner}`;
function targetId(request: TemplateRequest) {
  return ['create', 'save-workout-as-template'].includes(String(request.command.kind)) ? request.operationId : request.command.templateId;
}
function read(owner: string): Journal {
  const saved = localStorage.getItem(key(owner));
  if (!saved) return { version: 1, ownerId: owner, active: null, rows: [] };
  const parsed = journalSchema.safeParse(JSON.parse(saved));
  if (!parsed.success || parsed.data.ownerId !== owner) throw new Error('invalid_command_journal');
  return parsed.data;
}
function write(journal: Journal) {
  // One atomic storage replacement contains both the predecessor outcome and
  // its replacement request/pointer; interruption cannot tear those facts.
  localStorage.setItem(key(journal.ownerId), JSON.stringify(journal));
  window.dispatchEvent(new Event(event));
}
export function currentTemplateCommand(owner: string): TemplateJournal | null {
  const journal = read(owner);
  return journal.rows.find(row => row.request.operationId === journal.active) ?? null;
}
export function prepareTemplateCommand(owner: string, command: Record<string, unknown>): TemplateRequest {
  const journal = read(owner), current = journal.rows.find(row => row.request.operationId === journal.active);
  if (current?.state === 'pending') {
    if (JSON.stringify(current.request.command) !== JSON.stringify(command)) throw new Error('pending_command');
    return current.request;
  }
  if (current?.state === 'rejected') throw new Error('review_required');
  const request: TemplateRequest = { protocolVersion: 1, operationId: crypto.randomUUID(), command: JSON.parse(JSON.stringify(command)) };
  write({ ...journal, active: request.operationId, rows: [...journal.rows, { ownerId: owner, request, state: 'pending' }] });
  return request;
}
export function resolveTemplateRejection(owner: string, replacement?: Record<string, unknown>): TemplateRequest | undefined {
  const journal = read(owner), current = journal.rows.find(row => row.request.operationId === journal.active);
  if (current?.state !== 'rejected') throw new Error('review_required');
  const request: TemplateRequest | undefined = replacement ? { protocolVersion: 1, operationId: crypto.randomUUID(), command: JSON.parse(JSON.stringify(replacement)) } : undefined;
  if (request && (request.command.kind !== current.request.command.kind
    || !['create', 'save-workout-as-template'].includes(String(request.command.kind)) && targetId(request) !== targetId(current.request))) throw new Error('invalid_replacement');
  const rows: TemplateJournal[] = journal.rows.map(row => row === current
    ? request ? { ...row, state: 'superseded', replacementOperationId: request.operationId } : { ...row, state: 'resolved' }
    : row);
  if (request) rows.push({ ownerId: owner, request, state: 'pending' });
  write({ ...journal, active: request?.operationId ?? null, rows });
  return request;
}
export class TemplateCommandError extends Error {
  constructor(readonly code: string, readonly rejection?: TemplateRejection) { super(code); }
}
export async function sendTemplateCommand(owner: string, request: TemplateRequest): Promise<TemplateReceipt> {
  const current = currentTemplateCommand(owner);
  if (current?.state !== 'pending' || JSON.stringify(current.request) !== JSON.stringify(request)) throw new TemplateCommandError('invalid_command_journal');
  const response = await fetch('/api/routines/templates/commands', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Train-Owner': owner }, body: JSON.stringify(request) });
  const body = await response.json().catch(() => null);
  const accepted = response.status === 200 ? templateAcceptedResponseSchema.safeParse(body) : undefined;
  const rejected = templateRejectedResponseSchema.safeParse(body);
  const value = accepted?.success ? accepted.data.receipt
    : rejected.success && response.status === templateRejectionStatus[rejected.data.rejection.code] ? rejected.data.rejection : undefined;
  if (value) {
    if (value.ownerId !== owner || value.operationId !== request.operationId || value.operation !== request.command.kind || value.templateId !== targetId(request)) throw new TemplateCommandError('invalid_response');
    let updated: TemplateJournal;
    if ('template' in value && templateReceiptMatchesRequest(value, request)) updated = { ...current, state: 'accepted', receipt: value };
    else if ('code' in value) updated = { ...current, state: 'rejected', rejection: value };
    else throw new TemplateCommandError('invalid_response');
    const journal = read(owner), row = journal.rows.find(row => row.request.operationId === request.operationId);
    if (!row || JSON.stringify(row.request) !== JSON.stringify(request)) throw new TemplateCommandError('invalid_command_journal');
    if (row.state === 'pending') write({ ...journal, active: journal.active === request.operationId && updated.state === 'accepted' ? null : journal.active,
      rows: journal.rows.map(row => row.request.operationId === request.operationId ? updated : row) });
    else if (JSON.stringify(row.receipt ?? row.rejection) !== JSON.stringify(value)) throw new TemplateCommandError('invalid_response');
    if ('template' in value) return value;
    throw new TemplateCommandError(value.code, value);
  }
  const transient = ['not_ready', 'unavailable', 'unauthenticated', 'invalid_request', 'unsupported_version', 'operation_conflict'];
  throw new TemplateCommandError(transient.includes(body?.error?.code) ? body.error.code : 'unavailable');
}
export function observeTemplateCommands(listener: () => void) {
  window.addEventListener(event, listener); window.addEventListener('storage', listener);
  return () => { window.removeEventListener(event, listener); window.removeEventListener('storage', listener); };
}
