import {z} from 'zod';
import {authenticateNativeRequest} from '@/lib/auth/native-request';
import {googleDayRange} from '@/lib/google/planning';
import {assertTaskSchedulesAvailable,CaptureScheduleError,timedTaskScheduleSchema} from '@/lib/ai/timed-capture';
import {isValidLocalDate} from '@/lib/recurring-tasks/scheduling';
import {log} from '@/lib/logger';
import {TrainingCaptureError,trainingCaptureChanges,trainingRevisionChanges,trainingSchedule} from '@/lib/ai/training-capture';

export const maxDuration=60;
const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
const revisionSchema=z.object({
 requestId:z.string().uuid(),conversationId:z.string().uuid(),proposalId:z.string().uuid(),expectedVersion:z.string().uuid(),locale:z.enum(['en','zh']),
 supportsTrainingPlans:z.literal(true).optional(),
 changes:z.union([z.object({title:z.string().trim().min(1).max(100),estimate_minutes:z.number().int().min(1).max(2147483647).nullable().optional(),due_date:z.string().refine(isValidLocalDate).nullable().optional()}).strict(),trainingRevisionChanges]),
 schedule:timedTaskScheduleSchema.nullable().optional(),
}).strict().refine(value=>value.requestId!==value.proposalId&&(!('date' in value.changes)||value.supportsTrainingPlans===true&&value.schedule===undefined));
const captureBody=z.object({items:z.array(z.object({kind:z.string(),schedule:timedTaskScheduleSchema.optional()}).passthrough()).length(1)}).passthrough();
export function OPTIONS(){return new Response(null,{status:204,headers});}

/** Native field edits create a new exact proposal; no inference or task write. */
export async function POST(request:Request){
 try{
  const auth=await authenticateNativeRequest(request);
  if(!auth)return reply({error:'unauthorized'},401);
  if(Number(request.headers.get('content-length')??0)>8192)return reply({error:'invalid'},413);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>8192)return reply({error:'invalid'},413);
  const revision=revisionSchema.parse(JSON.parse(raw));
  const {data,error}=await auth.client.from('planner_ai_proposals').select('body,state,version,proposal_type').eq('user_id',auth.userId).eq('id',revision.proposalId).maybeSingle();
  if(error)return reply({error:'unavailable'},503);
  // A completed revision has rejected its source. Let its exact durable
  // identity replay in SQL before depending on fresh external services.
  if(data?.state==='pending'&&data.version===revision.expectedVersion){
   const parsed=captureBody.safeParse(data.body);
   if(data.proposal_type!=='capture'||!parsed.success)return reply({error:'invalid'},400);
   const item=parsed.data.items[0];
   let schedule;
   if(item.kind==='training-create'){
    if(!revision.supportsTrainingPlans||!('date' in revision.changes))return reply({error:'invalid'},400);
    const current=trainingCaptureChanges.safeParse(item.changes);
    if(!current.success)return reply({error:'unavailable'},503);
    schedule=trainingSchedule({...current.data,...revision.changes},0);
   }else{
    if(item.kind!=='task-create'||'date' in revision.changes)return reply({error:'invalid'},400);
    schedule=revision.schedule===undefined?item.schedule:revision.schedule;
   }
   if(schedule){
    const events=await googleDayRange(auth.userId,schedule.startDate,schedule.endDate,schedule.timezone);
    assertTaskSchedulesAvailable([schedule],events);
   }
  }
  const result=await auth.client.rpc('planner_ai_revise_capture',{p_request:revision});
  if(result.error)return reply({error:'unavailable'},503);
  if(result.data?.status==='complete'&&result.data.response)return reply(result.data.response);
  if(result.data?.status==='past-time')return reply({error:'past-time'},409);
  if(['conflict','not-found','unsupported'].includes(result.data?.status))return reply({error:'conflict'},409);
  if(result.data?.status==='invalid')return reply({error:'invalid'},400);
  return reply({error:'unavailable'},503);
 }catch(error){
  if(error instanceof CaptureScheduleError&&error.reason==='overlap')return reply({error:'conflict'},409);
  const invalid=error instanceof z.ZodError||error instanceof SyntaxError||error instanceof TrainingCaptureError;
  if(!invalid)log.error('[mobile-assistant-revise] Revision failed',undefined,{reason:'unavailable'});
  return reply({error:invalid?'invalid':'unavailable'},invalid?400:503);
 }
}
