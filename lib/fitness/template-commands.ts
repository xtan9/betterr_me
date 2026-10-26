import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { exerciseProtocolSchema } from '@/lib/validations/train-exercises';
import { templateCapabilitiesSchema, templateCommandEnvelopeSchema, templateReceiptSchema, templateRejectionSchema, templateReceiptMatchesRequest, templateRejectionStatus } from '@/lib/validations/train-templates';

export const templateHeaders = {
  'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
export const templateFailure = (code: string, status: number) => Response.json(
  { protocolVersion: 1, error: { code } }, { status, headers: templateHeaders },
);
export function templateUnavailable(classification: 'rpc_error' | 'invalid_rpc_response' | 'unexpected_exception') {
  log.error('[train] Template request unavailable', undefined, { classification });
  return templateFailure('unavailable', 503);
}
export async function templateCapabilities(client: SupabaseClient) {
  const { data, error } = await client.rpc('train_template_capabilities');
  if (error) return { ok: false as const, response: templateUnavailable('rpc_error') };
  const parsed = templateCapabilitiesSchema.safeParse(data);
  return parsed.success ? { ok: true as const, value: parsed.data }
    : { ok: false as const, response: templateUnavailable('invalid_rpc_response') };
}
/** Old aggregate editors cannot represent per-set authority after cutover. */
export async function legacyRoutineBoundary(client: SupabaseClient): Promise<Response | null> {
  const capability = await templateCapabilities(client);
  if (!capability.ok) return capability.response;
  return capability.value.templates.ready
    ? Response.json({ error: 'Refresh the routine editor to continue.', code: 'refresh_required' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
    : null;
}
export async function executeTemplateCommand(request: Request, client: SupabaseClient, ownerId: string) {
  let input: unknown;
  try { input = JSON.parse(await request.text()); }
  catch { return templateFailure('invalid_request', 400); }
  const protocol = exerciseProtocolSchema.safeParse(input);
  if (!protocol.success) return templateFailure('invalid_request', 400);
  if (protocol.data.protocolVersion !== 1) return templateFailure('unsupported_version', 422);
  const parsed = templateCommandEnvelopeSchema.safeParse(input);
  if (!parsed.success) return templateFailure('invalid_request', 400);
  const body = parsed.data;
  const { data, error } = await client.rpc('execute_train_template_command', { p_request: body });
  if (error) return templateUnavailable('rpc_error');
  const evidence = data?.status === 'accepted' ? templateReceiptSchema.safeParse(data.receipt) : templateRejectionSchema.safeParse(data?.rejection);
  if (evidence.success) {
    const result = evidence.data;
    const targetId = ['create', 'save-workout-as-template'].includes(String(body.command.kind)) ? body.operationId : body.command.templateId;
    if (result.operationId !== body.operationId || result.ownerId !== ownerId || result.operation !== body.command.kind || result.templateId !== targetId) return templateUnavailable('invalid_rpc_response');
    if (data.status === 'accepted' && 'template' in result) {
      if (!templateReceiptMatchesRequest(result, body)) return templateUnavailable('invalid_rpc_response');
      const expected = body.command.expectedVersion;
      if (typeof expected === 'string' && (!/^[1-9][0-9]*$/.test(expected) || BigInt(result.template.version) <= BigInt(expected))) return templateUnavailable('invalid_rpc_response');
      return Response.json({ protocolVersion: 1, receipt: data.receipt }, { headers: templateHeaders });
    }
    if ('code' in result && result.code === data.status) return Response.json(
      { protocolVersion: 1, error: { code: result.code }, rejection: data.rejection },
      { status: templateRejectionStatus[result.code], headers: templateHeaders },
    );
  }
  const transient: Record<string, number> = { invalid_request: 400, unsupported_version: 422, unauthenticated: 401, operation_conflict: 409, not_ready: 503 };
  return Object.hasOwn(transient, data?.status) && data?.receipt === undefined && data?.rejection === undefined
    ? templateFailure(data.status, transient[data.status]) : templateUnavailable('invalid_rpc_response');
}
