import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { readTrainPlans, trainPlanFailure, trainPlanHeaders, trainPlanUnavailable } from '@/lib/fitness/train-plans';
export function OPTIONS() { return new Response(null, { status: 204, headers: trainPlanHeaders }); }
export async function GET(request: Request) { try {
    const auth = await authenticateNativeRequest(request);
    if (!auth)
        return trainPlanFailure('unauthenticated', 401);
    const url = new URL(request.url);
    return await readTrainPlans(auth.client, auth.userId, { day: url.searchParams.get('date'), id: null, after: url.searchParams.get('after') });
}
catch {
    return trainPlanUnavailable('unexpected_exception');
} }
