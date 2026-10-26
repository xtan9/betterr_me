import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/auth/authenticated-request';
import { historyFailure, historyUnavailable } from './train-history';
export async function historyCookieRoute(request:Request,permission:'read'|'write',handle:(client:SupabaseClient,owner:string)=>Promise<Response>){
 try{
  const auth=await authenticateRequest(request,{allowedCredentials: ['cookie'],requiredPermission:permission});
  if(!auth.ok)return historyFailure('unauthenticated',auth.status);
  if(permission==='write'&&request.headers.get('X-Train-Owner') !== auth.principal.userId)return historyFailure('owner_mismatch',403);
  return await handle(auth.client,auth.principal.userId);
 }catch{return historyUnavailable('unexpected_exception');}
}
