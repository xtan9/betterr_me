import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { readTrainPlans, trainPlanFailure, trainPlanHeaders, trainPlanUnavailable } from '@/lib/fitness/train-plans';
export function OPTIONS() { return new Response(null, { status: 204, headers: trainPlanHeaders }); }
export async function GET(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { try {
    const auth = await authenticateNativeRequest(request);
    if (!auth)
        return trainPlanFailure('unauthenticated', 401);
    return await readTrainPlans(auth.client, auth.userId, { day: null, id: (await params).id, after: null });
}
catch {
    return trainPlanUnavailable('unexpected_exception');
} }
