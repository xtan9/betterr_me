import {getLocalDateInTimeZone,addLocalDays} from '@/lib/recurring-tasks/scheduling';
import {createHash} from 'node:crypto';
import {generateText,streamText,Output} from 'ai';
import {z} from 'zod';
import {authenticateNativeRequest} from '@/lib/auth/native-request';
import {llmProvider,structuredOutputProviderOptions} from '@/lib/ai/provider';
import {DEFAULT_MODEL_ID,AVAILABLE_MODELS} from '@/lib/ai/models';
import {checkChatRateLimit} from '@/lib/ai/rate-limit';
import {buildCapturePreview,type CaptureContext} from '@/lib/ai/native-capture';
import {assistantOutput,assistantInstructions,buildAssistantTurn,selectMemories,planningCalendarContext,resolvePlanningHorizon,publicAssistantPrefix,type Memory,type PlanningState} from '@/lib/ai/assistant-orchestrator';
import {nextActionFacts} from '@/lib/ai/next-action';
import {safeAiFailure} from '@/lib/ai/safe-failure';
import {log} from '@/lib/logger';
import {captureStreamResponse,AssistantStreamError} from '@/lib/ai/native-capture-stream';
export const maxDuration=60;
const requestSchema=z.object({requestId:z.string().uuid(),conversationId:z.string().uuid().optional(),consent:z.literal(true),locale:z.enum(['en','zh']),messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().min(1).max(8000)}).strict()).min(1).max(40)}).strict().refine(value=>value.messages.at(-1)?.role==='user');
const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers});
export function OPTIONS(){return new Response(null,{status:204,headers});}
export async function POST(request:Request){
 try{
  if(Number(request.headers.get('content-length')??0)>65536)return respond({error:'invalid'},413);
  const raw=await request.text();if(new TextEncoder().encode(raw).length>65536)return respond({error:'invalid'},413);
  let json:unknown;try{json=JSON.parse(raw);}catch{return respond({error:'invalid'},400);}
  const parsed=requestSchema.safeParse(json);if(!parsed.success)return respond({error:'invalid'},400);
  const input=parsed.data,auth=await authenticateNativeRequest(request);if(!auth)return respond({error:'unauthorized'},401);
  const {client,userId}=auth,fingerprint=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const turn=await client.from('assistant_turns').select('request_fingerprint,response').eq('id',input.requestId).eq('user_id',userId).maybeSingle();
  if(turn.error)return respond({error:'unavailable'},503);
  if(turn.data&&turn.data.request_fingerprint!==fingerprint)return respond({error:'conflict'},409);
  const saved=await client.from('planner_ai_proposals').select('*').eq('id',input.requestId).eq('user_id',userId).maybeSingle();
  if(saved.error)return respond({error:'unavailable'},503);
  if(turn.data?.response){
   if(turn.data.response.proposal&&!saved.data)return respond({error:'unavailable'},503);
   return respond({...turn.data.response,...(saved.data?{proposal:saved.data}:{})});
  }
  if(saved.data){if(saved.data.request_fingerprint!==fingerprint)return respond({error:'conflict'},409);return respond({proposal:saved.data});}
  if(!process.env.LLM_API_KEY)return respond({error:'unavailable'},503);
  const rate=await checkChatRateLimit(client,userId);if(!rate.allowed)return respond({error:rate.reason==='exceeded'?'limited':'unavailable'},rate.reason==='exceeded'?429:503);
  const conversationId=input.conversationId??input.requestId;
  const begun=await client.rpc('assistant_begin_turn',{p_id:input.requestId,p_conversation_id:conversationId,p_new:!input.conversationId,p_fingerprint:fingerprint,p_messages:input.messages});
  if(begun.error)return respond({error:'unavailable'},503);
  if(begun.data?.status==='complete')return respond(begun.data.response);
  if(begun.data?.status!=='prepared')return respond({error:'conflict'},409);
  const [tasks,projects,profile]=await Promise.all([
   client.from('tasks').select('id,title,version,estimate_minutes,due_date,project_id').eq('user_id',userId).eq('is_completed',false).is('archived_at',null).order('id').limit(200),
   client.from('projects').select('id,name,version').eq('user_id',userId).eq('status','active').is('completed_at',null).order('id').limit(200),
   client.from('profiles').select('timezone').eq('id',userId).single(),
  ]);
  if(tasks.error||projects.error||profile.error)return respond({error:'unavailable'},503);
  const context:CaptureContext={tasks:tasks.data??[],projects:projects.data??[],timezone:profile.data?.timezone||'UTC'};
  const [memories,session]=await Promise.all([
   client.from('user_memories').select('id,kind,key,content,confidence,temporality,updated_at,effective_from,effective_until').eq('user_id',userId).eq('status','active').or(`effective_until.is.null,effective_until.gt.${new Date().toISOString()}`).order('temporality',{ascending:false}).order('updated_at',{ascending:false}).limit(200),
   client.from('planning_sessions').select('*').eq('user_id',userId).eq('conversation_id',conversationId).maybeSingle(),
  ]);
  if(memories.error||session.error)return respond({error:'unavailable'},503);
  const previous:PlanningState|null=session.data&&!['applied','cancelled'].includes(session.data.status)?{id:session.data.id,status:session.data.status,horizon:session.data.start_date?{startDate:session.data.start_date,endDate:session.data.end_date,timezone:session.data.timezone}:null,readiness:session.data.readiness,facts:session.data.facts,assumptions:session.data.assumptions}:null;
  const selectedMemories=selectMemories((memories.data??[]) as Memory[],previous,new Date());
  const configured=process.env.LLM_MODEL,modelId=configured&&AVAILABLE_MODELS.some(model=>model.id===configured)?configured:DEFAULT_MODEL_ID;
  const runTurn=async(emit?: (text:string)=>void,signal=request.signal)=>{
  let draftRetryUsed=false,published=false;
  const generateOnce=async(calendar:unknown)=>{
   const options={model:llmProvider(modelId),output:Output.object({schema:assistantOutput}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:Math.min(6144,Math.max(1,Number.parseInt(process.env.LLM_MAX_TOKENS||'6144',10)||6144)),abortSignal:signal,
   system:`${assistantInstructions}${draftRetryUsed?'\nThe previous draft exceeded its size limit. Regenerate a concise prose outline under 2400 characters. Preserve confirmed constraints and explicit unknowns; do not add facts or calendar actions.':''}\nReply in ${input.locale==='zh'?'Simplified Chinese':'English'}, preserving user-entered names. Current instant: ${new Date().toISOString()}; current local date: ${getLocalDateInTimeZone(new Date(),context.timezone)}. Owner context: ${JSON.stringify({capture:context,memories:selectedMemories,planning:previous,calendar})}`,
   messages:begun.data.messages,
   };
   if(!emit)return generateText(options);
   const streamed=streamText({...options,onError:()=>{ /* Sanitized by the stream boundary. */ }});
   for await(const partial of streamed.partialOutputStream){
    if(signal.aborted)throw new Error('Cancelled');
    // Planning needs readiness/calendar validation; recommendations need the engine.
    // Other replies may stream complete, checked sentences while the model works.
    if(['conversation','capture','clarification'].includes(partial.intent??'')&&!partial.planning&&typeof partial.message==='string'){
     const prefix=publicAssistantPrefix(partial.message);if(prefix){published=true;emit(prefix);}
    }
   }
   return {output:await streamed.output};
  };
  const generate=async(calendar:unknown=null)=>{
   try{return await generateOnce(calendar);}catch(error){
    const failure=safeAiFailure(error);
    // Retry only the observed length failure, once per turn, before publication.
    // Reuse original context; invalid output is never trusted, truncated or saved.
    if(draftRetryUsed||published||signal.aborted||failure.name!=='AI_NoObjectGeneratedError'||failure.causeName!=='AI_TypeValidationError'||failure.validationCode!=='too_big'||failure.validationPath!=='planning.draft')throw error;
    draftRetryUsed=true;
    return generateOnce(calendar);
   }
  };
  let result=await generate();
  const classified=assistantOutput.parse(result.output);
  if(classified.intent==='planning'||classified.planning){
   // Read the existing planner snapshot only for planning. It includes recurrence identities;
   // coverageComplete applies to this civil day, never to the whole multi-day horizon.
   const horizon=resolvePlanningHorizon(classified.planning,previous);
   const date=horizon?.startDate??getLocalDateInTimeZone(new Date(),context.timezone);
   const snapshot=await client.rpc('planner_schedule_context',{p_date:date});
   if(snapshot.error||!Array.isArray(snapshot.data?.events))return {body:{error:'unavailable'},status:503};
   const contextRange=horizon??{startDate:date,endDate:addLocalDays(date,13),timezone:context.timezone};
   result=await generate({contextRange,coverageDate:date,coverageComplete:snapshot.data.coverageComplete,events:planningCalendarContext(snapshot.data.events,contextRange)});
  }
  if(signal.aborted)throw new Error('Cancelled');
  const output=buildAssistantTurn(result.output,context,previous,input.messages.at(-1)!.content,input.locale);
  if(output.intent==='next_action'&&output.nextActionWindow){
   const start=Math.max(Date.now(),Date.parse(output.nextActionWindow.start)),end=Date.parse(output.nextActionWindow.end);
   if(end<=start||end-start>86400000||start>Date.now()+30*86400000)return {body:{error:'invalid'},status:400};
   const facts=await nextActionFacts(client,userId,start,end);
   output.message=facts.selected?`${input.locale==='zh'?'下一步':'Next'}: ${facts.selected.title}\n${facts.selected.estimate_minutes} ${input.locale==='zh'?'分钟':'minutes'}`:input.locale==='zh'?'这段时间没有合适的可执行任务。':'No actionable task fits this window.';
   output.capture=buildCapturePreview({message:output.message,actions:[]},context);
  }
  const storedOutput={message:output.message,intent:output.intent,planning:output.planning,missing:output.missing,ui:output.ui,capture:output.capture,memoryUpdates:output.memoryUpdates};
  emit?.(output.message);
  if(signal.aborted)throw new Error('Cancelled');
  const stored=await client.rpc('assistant_finish_turn',{p_id:input.requestId,p_fingerprint:fingerprint,p_output:storedOutput});
  if(stored.error||stored.data?.status!=='complete')return {body:{error:stored.data?.status==='conflict'?'conflict':'unavailable'},status:stored.data?.status==='conflict'?409:502};
  return {body:stored.data.response,status:200};
  };
  if(request.headers.get('accept')?.includes('application/x-ndjson'))return captureStreamResponse(request.signal,headers,async(emit,signal)=>{
   const completed=await runTurn(emit,signal);
   if(completed.status!==200)throw new AssistantStreamError(completed.status===409?'conflict':completed.status===400?'invalid':'unavailable');
   return completed.body;
  });
  const completed=await runTurn();return respond(completed.body,completed.status);
 }catch(error){
  // Provider errors may embed prompts or appointment text. Return only a category.
  if(request.signal.aborted)return new Response(null,{status:499,headers});
  log.error('[mobile-assistant] Request failed',undefined,{failure:safeAiFailure(error)});
  return respond({error:'unavailable'},502);
 }
}

