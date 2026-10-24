import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { historyFailure, readFocusHistory, uploadFocusHistory } from '@/lib/focus-history/http';
import { FocusHistoryError } from '@/lib/focus-history/repository';

const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
export function OPTIONS() { return new Response(null, { status: 204, headers }); }
export async function GET(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) throw new FocusHistoryError('unauthorized');
    return await readFocusHistory(request, auth.client, headers);
  } catch (error) { return historyFailure(error, headers); }
}
export async function POST(request: Request) {
  try {
    const auth = await authenticateNativeRequest(request);
    if (!auth) throw new FocusHistoryError('unauthorized');
    return await uploadFocusHistory(request, auth.client, headers);
  } catch (error) { return historyFailure(error, headers); }
}
