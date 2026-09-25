import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleConnectionError, type ConnectionRecord, type GoogleConnectionStore, type GoogleService } from './contracts';
const unavailable = () => new GoogleConnectionError('unavailable');
const recordFromRow = (row: ReturnType<typeof rowFromRecord>): ConnectionRecord => ({ userId: row.user_id, service: row.service, revision: row.revision, status: row.status, email: row.email, subject: row.subject, credential: row.credential, selectedCalendars: row.selected_calendars });
const rowFromRecord = (record: ConnectionRecord) => ({ user_id: record.userId, service: record.service, revision: record.revision, status: record.status, email: record.email, subject: record.subject, credential: record.credential, selected_calendars: record.selectedCalendars });

/** Called only after the route verifies the BetterRMe JWT; all operations retain an explicit owner filter. */
export function googleConnectionStore(client: SupabaseClient): GoogleConnectionStore {
  return {
    async list(userId) {
      const { data, error } = await client.from('google_connections').select('*').eq('user_id', userId);
      if (error) throw unavailable();
      return (data ?? []).map(recordFromRow);
    },
    async get(userId: string, service: GoogleService) {
      const { data, error } = await client.from('google_connections').select('*').eq('user_id', userId).eq('service', service).maybeSingle();
      if (error) throw unavailable();
      return data ? recordFromRow(data) : null;
    },
    async begin(record, stateHash, attempt, expectedRevision) {
      const saved = expectedRevision
        ? await client.from('google_connections').update(rowFromRecord(record)).eq('user_id', record.userId).eq('service', record.service).eq('revision', expectedRevision).select('revision').maybeSingle()
        : await client.from('google_connections').insert(rowFromRecord(record)).select('revision').maybeSingle();
      if (saved.error?.code === '23505' || !saved.error && !saved.data) throw new GoogleConnectionError('conflict');
      if (saved.error) throw unavailable();
      const { error } = await client.from('google_connection_attempts').upsert({ state_hash: stateHash, user_id: attempt.userId, service: attempt.service, revision: attempt.revision, verifier: attempt.verifier, expires_at: attempt.expiresAt }, { onConflict: 'user_id,service' });
      if (error) throw unavailable();
    },
    async consume(userId, stateHash, now) {
      const { data, error } = await client.from('google_connection_attempts').delete().eq('user_id', userId).eq('state_hash', stateHash).gt('expires_at', now).select('*').maybeSingle();
      if (error) throw unavailable();
      return data ? { userId: data.user_id, service: data.service, revision: data.revision, verifier: data.verifier, expiresAt: data.expires_at } : null;
    },
    async save(record, expectedRevision) {
      const { data, error } = await client.from('google_connections').update(rowFromRecord(record)).eq('user_id', record.userId).eq('service', record.service).eq('revision', expectedRevision).select('revision').maybeSingle();
      if (error) throw unavailable();
      return !!data;
    },
    async remove(userId, service, revision) {
      const { data, error } = await client.from('google_connections').delete().eq('user_id', userId).eq('service', service).eq('revision', revision).select('revision').maybeSingle();
      if (error) throw unavailable();
      return !!data;
    },
  };
}
