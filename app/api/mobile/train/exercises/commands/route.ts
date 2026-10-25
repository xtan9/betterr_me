import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { executeExerciseCommand,exerciseCapabilities,exerciseFailure,exerciseHeaders,exerciseUnavailable } from '@/lib/fitness/exercise-commands';
export function OPTIONS(){return new Response(null,{status:204,headers:exerciseHeaders});}
export async function POST(request:Request) {
  try {
    const auth=await authenticateNativeRequest(request);
    if(!auth)return exerciseFailure('unauthenticated',401);
    const capabilities=await exerciseCapabilities(auth.client);
    if(!capabilities.ok)return capabilities.response;
    if(!capabilities.value.customExercises.ready)return exerciseFailure('not_ready',503);
    return await executeExerciseCommand(request,auth.client,auth.userId);
  } catch {return exerciseUnavailable('unexpected_exception');}
}
