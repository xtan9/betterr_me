import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { HevyCsvError, parseHevyCsv } from '@/lib/fitness/hevy-csv';
import { log } from '@/lib/logger';

const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const csv = z.string().min(1).max(5_000_000), fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
const requestSchema = z.discriminatedUnion('action', [
  z.object({ protocolVersion: z.literal(1), action: z.literal('preview'), csv }).strict(),
  z.object({ protocolVersion: z.literal(1), action: z.literal('commit'), csv, fingerprint }).strict(),
  z.object({ protocolVersion: z.literal(1), action: z.literal('undo'), batchId: z.string().uuid() }).strict(),
]);
const count = z.number().int().min(0).max(25000), owner = { protocolVersion: z.literal(1), ownerId: z.string().uuid() };
const receiptSchema = z.object({ ...owner, fingerprint, batchId: z.string().uuid(), importedWorkouts: count, importedSets: count, duplicateWorkouts: count, changedWorkouts: count, workoutIds: z.array(z.string().uuid()).max(2000) }).strict();
const undoSchema = z.object({ ...owner, batchId: z.string().uuid(), removedWorkouts: count, changedWorkouts: count }).strict();
const previewSchema = z.object({ ...owner, fingerprint, workouts: count, sets: count, newWorkouts: count, duplicateWorkouts: count, changedWorkouts: count, previousImport: z.object({ receipt: receiptSchema, undo: undoSchema.nullable() }).strict().nullable() }).strict();
const failure = (code: string, status: number) => Response.json({ protocolVersion: 1, error: { code } }, { status, headers });
const unavailable = () => { log.error('[train] Hevy import unavailable', undefined, { classification: 'unavailable' }); return failure('unavailable', 503); };
export function OPTIONS() { return new Response(null, { status: 204, headers }); }

/** Only a verified native user JWT can preview or commit their own import. */
export async function POST(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return failure('unauthenticated', 401);
    if (Number(request.headers.get('content-length')) > 15_000_000) return failure('too_large', 413);
    const text = await request.text();
    if (text.length > 15_000_000) return failure('too_large', 413);
    const input = requestSchema.safeParse(JSON.parse(text));
    if (!input.success) return failure('invalid_request', 400);
    const body = input.data;
    let hash: string | undefined, workouts: unknown, totals: { workouts: number; sets: number } | undefined;
    if (body.action !== 'undo') {
      const parsed = parseHevyCsv(body.csv);
      if (parsed.workouts.length > 2000) return failure('too_large', 413);
      hash = createHash('sha256').update(body.csv).digest('hex');
      if (body.action === 'commit' && body.fingerprint !== hash) return failure('changed_preview', 409);
      workouts = parsed.workouts.map(workout => JSON.parse(workout.contentKey));
      totals = { workouts: parsed.workouts.length, sets: parsed.sets };
    }
    const { data, error } = await auth.client.rpc('import_hevy_workouts', { p_action: body.action, p_fingerprint: hash ?? null, p_workouts: workouts ?? null, p_batch_id: body.action === 'undo' ? body.batchId : null });
    if (error) return unavailable();
    const response = (body.action === 'undo' ? undoSchema : body.action === 'commit' ? receiptSchema : previewSchema).safeParse(data);
    if (!response.success) {
      const statuses: Record<string, number> = { invalid_request: 422, not_ready: 503, not_found: 404, operation_conflict: 409, unauthenticated: 401 };
      return typeof data?.status === 'string' && Object.hasOwn(statuses, data.status) ? failure(data.status, statuses[data.status]) : unavailable();
    }
    const value = response.data;
    if (value.ownerId !== auth.userId || 'fingerprint' in value && value.fingerprint !== hash
      || body.action === 'undo' && 'batchId' in value && value.batchId !== body.batchId
      || 'newWorkouts' in value && (value.workouts !== totals?.workouts || value.sets !== totals?.sets || value.newWorkouts + value.duplicateWorkouts + value.changedWorkouts !== value.workouts)
      || 'workoutIds' in value && (value.workoutIds.length !== value.importedWorkouts || new Set(value.workoutIds).size !== value.workoutIds.length
        || value.importedWorkouts + value.duplicateWorkouts + value.changedWorkouts !== totals?.workouts || value.importedSets > (totals?.sets ?? -1))) return unavailable();
    if ('previousImport' in value && value.previousImport && (value.previousImport.receipt.ownerId !== auth.userId || value.previousImport.receipt.fingerprint !== hash
      || value.previousImport.undo && (value.previousImport.undo.ownerId !== auth.userId || value.previousImport.undo.batchId !== value.previousImport.receipt.batchId))) return unavailable();
    return Response.json(value, { headers });
  } catch (error) {
    if (error instanceof HevyCsvError) return failure(error.code, 422);
    if (error instanceof SyntaxError) return failure('invalid_request', 400);
    return unavailable();
  }
}
