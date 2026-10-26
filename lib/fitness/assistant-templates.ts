import type { ToolContext } from '@/lib/ai/tools/types';
import { RoutinesDB } from '@/lib/db/routines';
import { templateListSchema, type TemplateRead } from '@/lib/validations/train-templates';

/** A trusted MCP read never supplies a caller-selected owner or a generic RPC. */
export async function assistantTemplates(context: ToolContext) {
  const trusted = context.principal?.credential === 'mcp';
  if (trusted && (context.principal?.type !== 'user' || context.principal.userId !== context.userId || !context.permissions?.includes('read'))) {
    throw new Error('Read permission required');
  }
  const rows: TemplateRead[] = [];
  let after: string | null = null;
  do {
    const { data, error } = await (trusted
      ? context.supabase.rpc('mcp_read_train_templates', { p_user_id: context.userId, p_after: after })
      : context.supabase.rpc('read_train_templates', { p_id: null, p_after: after }));
    if (error) throw new Error('Templates unavailable');
    if (data?.status === 'not_ready' && after === null) return new RoutinesDB(context.supabase).getUserRoutines(context.userId);
    if (data?.status !== 'available') throw new Error('Templates unavailable');
    const { status: _status, ...payload } = data;
    const parsed = templateListSchema.safeParse(payload);
    if (!parsed.success || parsed.data.templates.some(row => row.template.ownerId !== context.userId)
      || parsed.data.nextCursor !== null && after !== null && parsed.data.nextCursor <= after) throw new Error('Invalid template response');
    rows.push(...parsed.data.templates);
    after = parsed.data.nextCursor;
  } while (after !== null);
  return rows;
}
