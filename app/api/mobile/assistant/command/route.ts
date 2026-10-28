import {z} from 'zod';
import {authenticateNativeRequest} from '@/lib/auth/native-request';
import {googleDayRange} from '@/lib/google/planning';
import {assertTaskSchedulesAvailable,CaptureScheduleError,timedTaskScheduleSchema} from '@/lib/ai/timed-capture';
import {log} from '@/lib/logger';

export const maxDuration=60;
const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
const commandSchema=z.object({operation:z.enum(['accept','reject']),operationId:z.string().uuid(),proposalId:z.string().uuid(),expectedVersion:z.string().uuid(),supportsTimedTasks:z.literal(true).optional(),revalidate:z.literal(true).optional()}).strict().refine(command=>!command.revalidate||command.operation==='accept');
const captureBody=z.object({items:z.array(z.object({kind:z.string(),schedule:timedTaskScheduleSchema.optional()}).passthrough()).max(10)}).passthrough();
export function OPTIONS(){return new Response(null,{status:204,headers});}
export async function POST(request:Request){
 try{
  const auth=await authenticateNativeRequest(request);
  if(!auth)return reply({error:'unauthorized'},401);
  if(Number(request.headers.get('content-length')??0)>4096)return reply({error:'invalid'},413);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>4096)return reply({error:'invalid'},413);
  const command=commandSchema.parse(JSON.parse(raw));
  if(command.operation==='accept'){
   const {data,error}=await auth.client.from('planner_ai_proposals').select('body,state,version,proposal_type').eq('user_id',auth.userId).eq('id',command.proposalId).maybeSingle();
   if(error){log.error('[mobile-assistant-command] Proposal read failed',undefined,{reason:'unavailable'});return reply({error:'unavailable'},503);}
   if(!data||data.proposal_type!=='capture'||data.state==='pending'&&data.version!==command.expectedVersion)return reply({error:'conflict'},409);
   // Applied and rejected retries must reach the database receipt check unchanged.
   if(data.state==='pending'){
    const parsed=captureBody.safeParse(data.body);
    if(!parsed.success)return reply({error:'unavailable'},503);
    const schedules=parsed.data.items.flatMap(item=>item.schedule?[item.schedule]:[]);
    if(schedules.length){
     if(!command.supportsTimedTasks)return reply({error:'invalid'},400);
     if(parsed.data.items.some(item=>item.schedule&&item.kind!=='task-create'))return reply({error:'unavailable'},503);
     const external=(await Promise.all([...new Set(schedules.map(schedule=>schedule.timezone))].map(timezone=>{
      const local=schedules.filter(schedule=>schedule.timezone===timezone);
      return googleDayRange(auth.userId,local.map(schedule=>schedule.startDate).sort()[0],local.map(schedule=>schedule.endDate).sort().at(-1)!,timezone);
     }))).flat();
     assertTaskSchedulesAvailable(schedules,external);
    }
   }
  }
  const result=await auth.client.rpc('planner_ai_proposal_command',{p_request:command});
  if(result.error){log.error('[mobile-assistant-command] Command failed',undefined,{reason:'unavailable'});return reply({error:'unavailable'},503);}
  return reply(result.data);
 }catch(error){
  if(error instanceof CaptureScheduleError&&error.reason==='overlap')return reply({error:'conflict'},409);
  const invalid=error instanceof z.ZodError||error instanceof SyntaxError;
  if(!invalid)log.error('[mobile-assistant-command] Request failed',undefined,{reason:'unavailable'});
  return reply({error:invalid?'invalid':'unavailable'},invalid?400:503);
 }
}
