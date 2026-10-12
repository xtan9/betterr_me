import type { SupabaseClient } from '@supabase/supabase-js';

export type DeletionPreview = {
  status: 'complete'; kind: 'task' | 'project'; id: string; title: string; version: string;
  children: { id: string; version: string }[];
  plan: { id: string; title: string; start_date: string; start_time: string; end_date: string; end_time: string; timezone: string; is_protected: boolean }[];
  retained: { id: string; title: string }[];
  reminders: { id: string; fire_at: string; channels: string[] }[];
  eventVersions: { event_id: string; version: string }[];
};
export type DeletionCommand = { operationId: string; preview: DeletionPreview };
export class DeletionError extends Error {
  constructor(public readonly reason: string) { super(reason); }
}
export async function previewDeletion(client: SupabaseClient, kind: DeletionPreview['kind'], id: string): Promise<DeletionPreview> {
  const { data, error } = await client.rpc('item_deletion_preview', { p_kind: kind, p_id: id });
  if (error) throw new DeletionError('unavailable');
  if (data?.status !== 'complete') throw new DeletionError(data?.status ?? 'unavailable');
  if (data.id !== id || data.kind !== kind || !data.version || !Array.isArray(data.plan) || !Array.isArray(data.reminders) || !Array.isArray(data.retained) || !Array.isArray(data.children) || !Array.isArray(data.eventVersions)) throw new DeletionError('unavailable');
  return data;
}
export async function executeDeletion(client: SupabaseClient, command: DeletionCommand): Promise<void> {
  const { data, error } = await client.rpc('item_delete_command', { p_operation_id: command.operationId, p_preview: command.preview });
  if (error) throw new DeletionError('unavailable');
  if (!['complete', 'already-applied'].includes(data?.status)) throw new DeletionError(data?.status ?? 'unavailable');
}
