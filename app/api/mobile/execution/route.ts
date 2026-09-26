import {z} from 'zod';
import {authenticateNativeRequest} from '@/lib/auth/native-request';
import {checkChatRateLimit} from '@/lib/ai/rate-limit';
import {currentExecutionWindow,executionRecommendation} from '@/lib/ai/assistant-execution';

const common={consent:z.literal(true)};
const selection={end:z.string().datetime({offset:true}),excluded:z.array(z.string().uuid()).max(50).default([])};
const schema=z.discriminatedUnion('operation',[
 z.object({...common,operation:z.literal('window')}).strict(),
 z.object({...common,...selection,operation:z.literal('recommend'),available:z.literal(true)}).strict(),
 z.object({...common,...selection,operation:z.enum(['start','later']),available:z.literal(true),operationId:z.string().uuid(),taskId:z.string().uuid(),expectedVersion:z.string().uuid(),until:z.string().datetime({offset:true})}).strict(),
]);
const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers});
export function OPTIONS(){return new Response(null,{status:204,headers});}
export async function POST(request:Request){
 try{
  const raw=await request.text();if(new TextEncoder().encode(raw).length>10000)return respond({error:'invalid'},413);
  let json:unknown;try{json=JSON.parse(raw);}catch{return respond({error:'invalid'},400);}
  const parsed=schema.safeParse(json);if(!parsed.success)return respond({error:'invalid'},400);
  const auth=await authenticateNativeRequest(request);if(!auth)return respond({error:'unauthorized'},401);
  const input=parsed.data,{client,userId}=auth;
  const command=input.operation==='start'||input.operation==='later'?{operation:input.operation,operationId:input.operationId,taskId:input.taskId,expectedVersion:input.expectedVersion,until:input.until}:null;
  // A lost response must replay the exact completed command, even after the window ends.
  if(command){
   const previous=await client.from('assistant_execution_events').select('request').eq('user_id',userId).eq('operation_id',command.operationId).maybeSingle();
   if(previous.error)return respond({error:'unavailable'},503);
   if(previous.data){const result=await client.rpc('assistant_execution_command',{p_request:command});return !result.error&&result.data?.status==='already-applied'?respond({status:'already-applied'}):respond({error:'conflict'},409);}
  }
  const rate=await checkChatRateLimit(client,userId);if(!rate.allowed)return respond({error:rate.reason==='exceeded'?'limited':'unavailable'},rate.reason==='exceeded'?429:503);
  if(input.operation==='window')return respond({window:await currentExecutionWindow(client,userId)});
  const now=Date.now(),end=Date.parse(input.end);
  if(end<=now||end>now+60*60_000)return respond({error:'conflict'},409);
  const facts=await executionRecommendation(client,userId,end,input.excluded,now);
  if(input.operation==='recommend')return respond({selected:facts.selected,window:facts.window,generatedAt:facts.generatedAt});
  if(!command||facts.selected?.id!==input.taskId||facts.selected.version!==input.expectedVersion)return respond({error:'conflict'},409);
  const until=Date.parse(input.until);
  if(until<=now||until>now+7*86400_000||input.operation==='start'&&until>Math.min(end,now+facts.selected.estimate_minutes!*60_000+60_000))return respond({error:'invalid'},400);
  if(request.signal.aborted)return respond({error:'unavailable'},499);
  const result=await client.rpc('assistant_execution_command',{p_request:command});
  if(result.error)return respond({error:'unavailable'},503);
  if(!['complete','already-applied'].includes(result.data?.status))return respond({error:result.data?.status==='invalid'?'invalid':'conflict'},result.data?.status==='invalid'?400:409);
  return respond({status:result.data.status});
 }catch{return respond({error:'unavailable'},503);}
}
