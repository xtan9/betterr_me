import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { exerciseCapabilities,exerciseFailure,exerciseHeaders,exerciseUnavailable } from '@/lib/fitness/exercise-commands';
export function OPTIONS(){return new Response(null,{status:204,headers:exerciseHeaders});}
export async function GET(request:Request) {
  try {
    const auth=await authenticateNativeRequest(request);
    if(!auth)return exerciseFailure('unauthenticated',401);
    const result=await exerciseCapabilities(auth.client);
    return result.ok?Response.json(result.value,{headers:exerciseHeaders}):result.response;
  } catch {return exerciseUnavailable('unexpected_exception');}
}
