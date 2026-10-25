import { authenticateNativeRequest } from '@/lib/auth/native-request';

const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (code: string, status: number) => Response.json({ protocolVersion: 1, error: { code } }, { status, headers });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function OPTIONS() { return new Response(null, { status: 204, headers }); }

/** One frozen completion is one database transaction; never replay Web draft commands. */
export async function POST(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) return failure('unauthenticated', 401);
    const text = await request.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { return failure('invalid_request', 400); }
    if (!object(body)) return failure('invalid_request', 400);
    if (body.protocolVersion !== 1) return failure('unsupported_version', 422);
    if (Object.keys(body).some(key => !['protocolVersion', 'operationId', 'completion'].includes(key))
      || typeof body.operationId !== 'string' || !uuid.test(body.operationId) || !object(body.completion)) return failure('invalid_request', 400);
    if (body.completion.ownerId !== auth.userId) return failure('owner_mismatch', 403);
    if (body.completion.id !== body.operationId) return failure('invalid_completion', 422);
    const { data, error } = await auth.client.rpc('upload_completed_workout', { p_operation_id: body.operationId, p_completion: body.completion });
    if (error) return failure('unavailable', 503);
    if (data?.status === 'accepted' && object(data.receipt)) return Response.json({ protocolVersion: 1, receipt: data.receipt }, { headers });
    const statuses: Record<string, number> = { unauthenticated: 401, owner_mismatch: 403, invalid_completion: 422,
      operation_conflict: 409, identity_conflict: 409, reference_unavailable: 409 };
    return data?.status in statuses ? failure(data.status, statuses[data.status]) : failure('unavailable', 503);
  } catch { return failure('unavailable', 503); }
}
