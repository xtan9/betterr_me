import { randomUUID } from 'node:crypto';

/**
 * Generated fixture cleanup uses the same owner/CAS boundary as the product.
 * Callers retain their local-only target and run-owned identity guards.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} ownerId
 * @param {string} workoutId
 */
export async function deleteFixtureWorkout(client, ownerId, workoutId) {
  const current = await client.rpc('read_train_history_record', { p_id: workoutId });
  if (current.error) throw current.error;
  if (current.data?.status === 'not_ready' || current.data?.status === 'not_found') {
    let query = client.from('workouts').delete().eq('id', workoutId).eq('user_id', ownerId);
    // A retains its legacy deletion contract. C permits direct draft deletion
    // only; a concurrent finish must not turn cleanup into an unreviewed delete.
    if (current.data.status === 'not_found') query = query.neq('status', 'completed');
    const removed = await query;
    if (removed.error) throw removed.error;
    return;
  }
  const record = current.data?.record;
  if (record?.id !== workoutId || record.ownerId !== ownerId || !/^[1-9]\d*$/.test(record.revision)
    || !['alive', 'deleted'].includes(record.state)) throw new Error('Invalid fixture history identity');
  if (record.state === 'deleted') return;
  const operationId = randomUUID();
  const removed = await client.rpc('execute_train_history_command', { p_request: {
    protocolVersion: 1, ownerId, operationId,
    command: { kind: 'delete-workout', workoutId, expectedRevision: record.revision },
  } });
  if (removed.error) throw removed.error;
  const receipt = removed.data?.receipt;
  if (removed.data?.protocolVersion !== 1 || removed.data?.error !== undefined || receipt?.ownerId !== ownerId || receipt.workoutId !== workoutId
    || receipt.operationId !== operationId || receipt.operation !== 'delete-workout'
    || receipt.revision !== String(BigInt(record.revision) + 1n)
    || receipt.current?.state !== 'deleted' || receipt.current.id !== workoutId || receipt.current.ownerId !== ownerId
    || receipt.current.revision !== receipt.revision) throw new Error('Fixture workout deletion was not accepted');
}
