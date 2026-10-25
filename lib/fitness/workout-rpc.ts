import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkoutRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export const userWorkoutRpc = (client: SupabaseClient): WorkoutRpc => (name, args) => client.rpc(name, args);
