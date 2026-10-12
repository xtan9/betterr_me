import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DeletionError, executeDeletion, previewDeletion } from '../lib/deletion/client';

/** Only called with the authenticated disposable run identity. */
export async function deleteRunItem(client: SupabaseClient, kind: 'task' | 'project', id: string) {
  try {
    const preview = await previewDeletion(client, kind, id);
    await executeDeletion(client, { operationId: randomUUID(), preview });
  } catch (error) {
    if (!(error instanceof DeletionError) || error.reason !== 'not-found') throw error;
  }
}
