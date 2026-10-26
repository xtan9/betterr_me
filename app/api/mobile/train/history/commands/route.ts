import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { executeHistoryCommand,historyFailure,historyHeaders,historyUnavailable } from '@/lib/fitness/train-history';
export function OPTIONS(){return new Response(null,{status:204,headers:historyHeaders});}
export async function POST(request:Request){
 try{const auth=await authenticateNativeRequest(request);if(!auth)return historyFailure('unauthenticated',401);return await executeHistoryCommand(request,auth.client,auth.userId);}catch{return historyUnavailable('unexpected_exception');}
}
