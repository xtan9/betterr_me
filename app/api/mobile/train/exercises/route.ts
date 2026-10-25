import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { exerciseFailure,exerciseHeaders,exerciseUnavailable } from '@/lib/fitness/exercise-commands';
import { readCustomExercises } from '@/lib/fitness/custom-exercise-read';
export function OPTIONS(){return new Response(null,{status:204,headers:exerciseHeaders});}
export async function GET(request:Request) {
  try {
    const auth=await authenticateNativeRequest(request);
    if(!auth)return exerciseFailure('unauthenticated',401);
    return await readCustomExercises(auth.client,auth.userId,null,new URL(request.url).searchParams.get('after'));
  } catch {return exerciseUnavailable('unexpected_exception');}
}
