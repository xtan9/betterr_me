import {z} from 'zod';
import {authenticateNativeRequest} from '@/lib/auth/native-request';
const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers});
const token=z.string().max(249).regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/);
const settings=z.object({enabled:z.boolean(),timezone:z.string().min(1).max(100),startMinute:z.number().int().min(0).max(1439),endMinute:z.number().int().min(1).max(1440),locale:z.enum(['en','zh']),expectedVersion:z.string().uuid().nullable(),token:token.nullable()}).strict().refine(s=>s.startMinute<s.endMinute&&(!s.enabled||s.token!==null));
export function OPTIONS(){return new Response(null,{status:204,headers});}
export async function GET(request:Request){try{
 const auth=await authenticateNativeRequest(request);if(!auth)return respond({error:'unauthorized'},401);
 const result=await auth.client.from('assistant_reminder_settings').select('enabled,timezone,start_minute,end_minute,locale,version').eq('user_id',auth.userId).maybeSingle();
 if(result.error)return respond({error:'unavailable'},503);return respond({settings:result.data});
}catch{return respond({error:'unavailable'},503);}}
export async function POST(request:Request){try{
 const raw=await request.text();if(raw.length>4000)return respond({error:'invalid'},413);
 let json:unknown;try{json=JSON.parse(raw);}catch{return respond({error:'invalid'},400);}
 const parsed=z.union([settings,z.object({operation:z.literal('unregister'),token}).strict()]).safeParse(json);if(!parsed.success)return respond({error:'invalid'},400);
 const auth=await authenticateNativeRequest(request);if(!auth)return respond({error:'unauthorized'},401);
 const result=await auth.client.rpc('assistant_reminder_settings_command',{p_request:parsed.data});
 if(result.error)return respond({error:'unavailable'},503);
 return result.data?.status==='complete'?respond({status:'complete'}):respond({error:result.data?.status==='invalid'?'invalid':'conflict'},result.data?.status==='invalid'?400:409);
}catch{return respond({error:'unavailable'},503);}}
