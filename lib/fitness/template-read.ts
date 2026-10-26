import type { SupabaseClient } from '@supabase/supabase-js';
import { exerciseIdSchema } from '@/lib/validations/train-exercises';
import { templateDefinitionListSchema, templateListSchema, templateReadSchema } from '@/lib/validations/train-templates';
import { templateFailure, templateHeaders, templateUnavailable } from './template-commands';

export async function readTemplates(client: SupabaseClient, ownerId: string, id: string | null, after: string | null) {
  if ((id !== null && !exerciseIdSchema.safeParse(id).success) || (after !== null && !exerciseIdSchema.safeParse(after).success)) return templateFailure('invalid_request', 400);
  const { data, error } = await client.rpc('read_train_templates', { p_id: id, p_after: after });
  if (error) return templateUnavailable('rpc_error');
  if (data?.status === 'not_ready') return templateFailure('not_ready', 503);
  if (data?.status === 'not_found') return templateFailure('not_found', 404);
  if (data?.status !== 'available') return templateUnavailable('invalid_rpc_response');
  const { status: _status, ...payload } = data;
  const result = id === null ? templateListSchema.safeParse(payload) : templateReadSchema.safeParse(payload);
  if (!result.success) return templateUnavailable('invalid_rpc_response');
  const templates = 'template' in result.data ? [result.data] : result.data.templates;
  if (templates.some(row => row.template.ownerId !== ownerId || (id !== null && row.template.id !== id))) return templateUnavailable('invalid_rpc_response');
  return Response.json(result.data, { headers: templateHeaders });
}
export async function readTemplateDefinitions(client: SupabaseClient, ownerId: string, after: string | null) {
  if (after !== null && !exerciseIdSchema.safeParse(after).success) return templateFailure('invalid_request', 400);
  const { data, error } = await client.rpc('read_train_template_definitions', { p_after: after });
  if (error) return templateUnavailable('rpc_error');
  if (data?.status === 'not_ready') return templateFailure('not_ready', 503);
  if (data?.status !== 'available') return templateUnavailable('invalid_rpc_response');
  const { status: _status, ...payload } = data;
  const result = templateDefinitionListSchema.safeParse(payload);
  if (!result.success || result.data.definitions.some(row => row.definition.kind === 'custom' && row.definition.definition.ownerId !== ownerId)) return templateUnavailable('invalid_rpc_response');
  return Response.json(result.data, { headers: templateHeaders });
}
