import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { log } from '@/lib/logger';
import { trainCompletionEnvelopeSchema, trainCompletionProtocolSchema } from '@/lib/validations/workout-completion';

const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const failure = (code: string, status: number) => Response.json({ protocolVersion: 1, error: { code } }, { status, headers });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const unavailable = (classification: 'rpc_error' | 'invalid_rpc_response' | 'unexpected_exception') => {
  // Exceptions and RPC errors may contain credentials or workout data. Only
  // this fixed classification crosses the logging boundary.
  log.error('[train] Completed workout upload unavailable', undefined, { classification });
  return failure('unavailable', 503);
};

export function OPTIONS() { return new Response(null, { status: 204, headers }); }

/** One frozen completion is one database transaction; never replay Web draft commands. */
export async function POST(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return failure('unauthenticated', 401);
    const text = await request.text();
    let input: unknown;
    try { input = JSON.parse(text); } catch { return failure('invalid_request', 400); }
    const protocol = trainCompletionProtocolSchema.safeParse(input);
    if (!protocol.success) return failure('invalid_request', 400);
    if (protocol.data.protocolVersion !== 1) return failure('unsupported_version', 422);
    const envelope = trainCompletionEnvelopeSchema.safeParse(input);
    if (!envelope.success) return failure('invalid_request', 400);
    const body = envelope.data;
    if (body.completion.ownerId !== auth.userId) return failure('owner_mismatch', 403);
    if (body.completion.id !== body.operationId) return failure('invalid_completion', 422);
    const { data, error } = await auth.client.rpc('upload_completed_workout', { p_operation_id: body.operationId, p_completion: body.completion });
    if (error) return unavailable('rpc_error');
    if (data?.status === 'accepted' && object(data.receipt)) return Response.json({ protocolVersion: 1, receipt: data.receipt }, { headers });
    const statuses: Record<string, number> = { unauthenticated: 401, owner_mismatch: 403, invalid_completion: 422,
      operation_conflict: 409, identity_conflict: 409, reference_unavailable: 409 };
    return Object.hasOwn(statuses, data?.status) ? failure(data.status, statuses[data.status]) : unavailable('invalid_rpc_response');
  } catch { return unavailable('unexpected_exception'); }
}
