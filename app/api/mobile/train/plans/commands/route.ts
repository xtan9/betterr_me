import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { executeTrainPlan, trainPlanFailure, trainPlanHeaders, trainPlanUnavailable } from '@/lib/fitness/train-plans';
export function OPTIONS() { return new Response(null, { status: 204, headers: trainPlanHeaders }); }
export async function POST(request: Request) { try {
    const auth = await authenticateNativeRequest(request);
    if (!auth)
        return trainPlanFailure('unauthenticated', 401);
    return await executeTrainPlan(request, auth.client, auth.userId);
}
catch {
    return trainPlanUnavailable('unexpected_exception');
} }
