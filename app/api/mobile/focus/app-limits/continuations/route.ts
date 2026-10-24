import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { continuationHeaders, continuationFailure, readContinuation, confirmContinuation } from '@/lib/app-limit-continuations/http';
import { ContinuationError } from '@/lib/app-limit-continuations/repository';
export function OPTIONS() { return new Response(null, { status: 204, headers: continuationHeaders }); }
export async function GET(request: Request) {
  try { const auth = await authenticateNativeRequest(request); if (!auth) throw new ContinuationError('unauthorized');
    return await readContinuation(request, auth.client, continuationHeaders);
  } catch (error) { return continuationFailure(error, continuationHeaders); }
}
export async function POST(request: Request) {
  try { const auth = await authenticateNativeRequest(request); if (!auth) throw new ContinuationError('unauthorized');
    return await confirmContinuation(request, auth.client, continuationHeaders);
  } catch (error) { return continuationFailure(error, continuationHeaders); }
}
