import type { ToolContext } from '@/lib/ai/tools/types';
import { createWorkoutWrites } from './writes';

/** The MCP route verified this principal and scope; no caller-supplied user override. */
export function assistantWorkoutWrites(context: ToolContext) {
  if (context.principal?.credential !== 'mcp') return createWorkoutWrites(context.supabase);
  if (context.principal.type !== 'user' || context.principal.userId !== context.userId || !context.permissions?.includes('write')) {
    throw new Error('Write permission required');
  }
  return createWorkoutWrites(context.supabase, (name, args) => {
    if (args.p_user_id !== context.userId || !['start_workout_from_routine', 'start_train_template_workout', 'complete_workout_atomically'].includes(name)) {
      throw new Error('Unsupported MCP workout operation');
    }
    return context.supabase.rpc('mcp_workout_command', { p_user_id: context.userId, p_operation: name, p_request: args });
  });
}
