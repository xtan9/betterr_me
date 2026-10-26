import { authenticateNativeRequest } from '@/lib/auth/native-request';
import { historyReadResponse,historyFailure,historyHeaders,historyUnavailable } from '@/lib/fitness/train-history';
export function OPTIONS(){return new Response(null,{status:204,headers:historyHeaders});}
export async function GET(request:Request, context:{params:Promise<{id:string}>}){
 try{const auth=await authenticateNativeRequest(request);if(!auth)return historyFailure('unauthenticated',401);return await historyReadResponse('detail',request,auth.client,auth.userId,(await context.params).id);}catch{return historyUnavailable('unexpected_exception');}
}
