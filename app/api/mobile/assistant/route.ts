import {getLocalDateInTimeZone,addLocalDays} from '@/lib/recurring-tasks/scheduling';
import {createHash} from 'node:crypto';
import {generateText,streamText,Output} from 'ai';
import {z} from 'zod';
import {authenticateNativeRequest} from '@/lib/auth/native-request';
import {llmProvider,structuredOutputProviderOptions} from '@/lib/ai/provider';
import {DEFAULT_MODEL_ID,AVAILABLE_MODELS} from '@/lib/ai/models';
import {checkChatRateLimit} from '@/lib/ai/rate-limit';
import {buildCapturePreview,type CaptureContext} from '@/lib/ai/native-capture';
import {assistantOutput,assistantInstructions,buildAssistantTurn,selectMemories,planningCalendarContext,resolvePlanningHorizon,publicAssistantPrefix,requestedReplyLocale,dayReviewChoices,type Memory,type PlanningState} from '@/lib/ai/assistant-orchestrator';
import {nextActionFacts} from '@/lib/ai/next-action';
import {emptyTaskChoices} from '@/lib/ai/assistant-orchestrator';
import {safeAiFailure} from '@/lib/ai/safe-failure';
import {latestCaptureTurn} from '@/lib/ai/assistant-capture-context';
import {log} from '@/lib/logger';
import {captureStreamResponse,AssistantStreamError} from '@/lib/ai/native-capture-stream';
export const maxDuration=120;
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
  const latest=input.messages.at(-1)!.content;
  const genericNextStep=['what should i do next?','接下来做什么？'].includes(latest.trim().toLowerCase());
  // A translated suggestion continues the saved conversation. Do not let the
  // provider reinterpret ordinary advice as a fresh task-selection workflow.
  const priorTurn=input.conversationId
   ?await client.from('assistant_turns').select('response').eq('user_id',userId).eq('conversation_id',conversationId).not('response','is',null).order('created_at',{ascending:false}).limit(1).maybeSingle()
   :{data:null,error:null};
  if(priorTurn.error)return respond({error:'unavailable'},503);
  const continuingAdvice=genericNextStep&&priorTurn.data?.response?.intent==='conversation';
  const captureTurn=input.conversationId?await latestCaptureTurn(client,userId,conversationId):{data:null,error:null};
  if(captureTurn.error)return respond({error:'unavailable'},503);
  const previousCapture=captureTurn.data?.response?.proposal?.body?.items;
  const declinedReview=Object.values(dayReviewChoices).some(choices=>choices.some(choice=>choice.id==='decline-review'&&choice.value===latest.trim()));
  const emptyTaskChoice=Object.values(emptyTaskChoices).flat().find(choice=>choice.value===latest.trim());
  const requestedLocale=requestedReplyLocale(begun.data.messages);
  const intentSchema=declinedReview||emptyTaskChoice?assistantOutput.extend({intent:z.literal('conversation'),followUp:z.null(),planning:z.null(),cancelPlanning:z.literal(false).optional(),nextActionWindow:z.null(),actions:assistantOutput.shape.actions.max(0),message:z.string().trim().min(1).max(160)}):continuingAdvice?assistantOutput.extend({intent:z.literal('conversation'),planning:z.null(),nextActionWindow:z.null(),actions:assistantOutput.shape.actions.max(0)}):assistantOutput;
  const generationSchema=requestedLocale?intentSchema.extend({replyLocale:z.literal(requestedLocale)}):intentSchema;
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
  const previous:PlanningState|null=session.data&&!['applied','cancelled'].includes(session.data.status)?{id:session.data.id,status:session.data.status,horizon:session.data.start_date?{startDate:session.data.start_date,endDate:session.data.end_date,timezone:session.data.timezone}:null,readiness:session.data.readiness,facts:session.data.facts,assumptions:session.data.assumptions,travelMinutes:session.data.travel_minutes??null}:null;
  let selectedMemories=selectMemories((memories.data??[]) as Memory[],previous,new Date());
  const configured=process.env.LLM_MODEL,modelId=configured&&AVAILABLE_MODELS.some(model=>model.id===configured)?configured:DEFAULT_MODEL_ID;
  const runTurn=async(emit?: (text:string)=>void,signal=request.signal)=>{
  let schemaRetryHint:string|null=null,published=false;
  const generateOnce=async(calendar:unknown)=>{
   const options={model:llmProvider(modelId),output:Output.object({schema:generationSchema}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:Math.min(6144,Math.max(1,Number.parseInt(process.env.LLM_MAX_TOKENS||'6144',10)||6144)),abortSignal:signal,
   system:`${assistantInstructions}${schemaRetryHint!==null?`\nThe previous reply did not match the output schema (${schemaRetryHint}). Regenerate from the original context, include every required field with its declared type, and use only declared enum values. Keep planning.draft under 2400 characters and memoryUpdates at most 10 items. Preserve confirmed constraints and explicit unknowns; do not add facts or calendar actions. Prioritize durable planning preferences and combine related memories rather than listing every detail separately.`:''}\nInterface language fallback: ${input.locale==='zh'?'Simplified Chinese':'English'}. Honor the requested reply language via replyLocale; the interface language is only a fallback. Current instant: ${new Date().toISOString()}; current local date: ${getLocalDateInTimeZone(new Date(),context.timezone)}. Owner context: ${JSON.stringify({capture:context,memories:selectedMemories,planning:previous,calendar})}`,
   messages:begun.data.messages,
   };
   if(continuingAdvice)options.system+='\nThis next-step suggestion continues the preceding ordinary advice. Return conversation with one gentle, untimed step based on that advice. Do not ask for available time or choose a task from the queue.';
   if(declinedReview)options.system+='\nThe user declined the day-review offer. Acknowledge in one short sentence, without a new question, checklist or suggestion. Return followUp=null; do not start planning.';
   if(emptyTaskChoice)options.system+=emptyTaskChoice.id==='rest'?'\nThe user chose rest after an empty task recommendation. Acknowledge briefly without another offer, question or checklist. Return ordinary conversation, followUp=null, no actions or planning.':'\nThe user chose one small action after an empty task recommendation. Suggest one gentle, untimed action respecting their existing constraints. Do not search the queue again, ask for availability, or offer planning. Return ordinary conversation, followUp=null and no actions.';
   if(previousCapture?.length)options.system+=`\nPrevious capture preview items (historical proposal, not evidence of acceptance or saved tasks): ${JSON.stringify(previousCapture)}. When the user revises this preview, retain its other items and unchanged details in the replacement proposal. Use current owner task/project context for edits to saved entities. Never treat a proposal item ID as a saved task ID.`;
   if(requestedLocale)options.system+=`\nReply in ${requestedLocale==='zh'?'Simplified Chinese':'English'}. This is the latest explicit language choice in the stored conversation and takes precedence over the interface or a translated quick suggestion. Set replyLocale accordingly.`;
   if(!emit)return generateText(options);
   const streamed=streamText({...options,onError:()=>{ /* Sanitized by the stream boundary. */ }});
   for await(const partial of streamed.partialOutputStream){
    if(signal.aborted)throw new Error('Cancelled');
    // Planning needs readiness/calendar validation; recommendations need the engine.
    // Other replies may stream complete, checked sentences while the model works.
    // An active draft can be cancelled by this reply. Its acknowledgement must
    // wait for the versioned transaction, even before the flag has streamed in.
    if(!previous&&['conversation','capture','clarification'].includes(partial.intent??'')&&!partial.planning&&!partial.cancelPlanning&&typeof partial.message==='string'){
     const prefix=publicAssistantPrefix(partial.message);if(prefix){published=true;emit(prefix);}
    }
   }
   return {output:await streamed.output};
  };
  const generate=async(calendar:unknown=null)=>{
   try{return await generateOnce(calendar);}catch(error){
    const failure=safeAiFailure(error);
    // Retry model schema failures once per turn, before publication. Domain,
    // proposal and persistence failures occur outside this generation boundary.
    // Reuse original context; invalid output is never trusted, truncated or saved.
    if(schemaRetryHint!==null||published||signal.aborted||failure.name!=='AI_NoObjectGeneratedError'||failure.causeName!=='AI_TypeValidationError')throw error;
    schemaRetryHint=`${failure.validationCode??'validation failure'} at ${failure.validationPath??'output'}`;
    return generateOnce(calendar);
   }
  };
  let result=await generate();
  const classified=generationSchema.parse(result.output);
  if(classified.intent==='planning'||classified.planning){
   // Read the existing planner snapshot only for planning. It includes recurrence identities;
   // coverageComplete applies to this civil day, never to the whole multi-day horizon.
   const horizon=resolvePlanningHorizon(classified.planning,previous);
   const horizonMemories=horizon?selectMemories((memories.data??[]) as Memory[],{status:'discovering',horizon,readiness:{},facts:{},assumptions:[]},new Date()):selectedMemories;
   const memoryPeriodChanged=JSON.stringify(horizonMemories)!==JSON.stringify(selectedMemories);
   selectedMemories=horizonMemories;
   const date=horizon?.startDate??getLocalDateInTimeZone(new Date(),context.timezone);
   const snapshot=await client.rpc('planner_schedule_context',{p_date:date});
   if(snapshot.error||!Array.isArray(snapshot.data?.events))return {body:{error:'unavailable'},status:503};
   // An empty snapshot adds no commitments to the already validated discovery
   // or prose draft. Avoid a second full generation inside the request deadline.
   if(snapshot.data.events.length||memoryPeriodChanged){
    const contextRange=horizon??{startDate:date,endDate:addLocalDays(date,13),timezone:context.timezone};
    result=await generate({contextRange,coverageDate:date,coverageComplete:snapshot.data.coverageComplete,events:planningCalendarContext(snapshot.data.events,contextRange)});
   }
  }
  if(signal.aborted)throw new Error('Cancelled');
  const generated=generationSchema.parse(result.output),recommendationAt=Date.now();
  if(generated.cancelPlanning&&(!previous||!session.data?.version||generated.intent!=='conversation'||generated.planning||generated.actions.length||generated.nextActionWindow||generated.followUp))throw new Error('Invalid draft cancellation');
  // The duration buttons confirm relative availability. Resolve their exact
  // conversational text after generation so latency does not consume a minute.
  const relativeMinutes=latest.trim().match(/^(?:I have (15|30|60) minutes free now\. What should I do next\?|我现在有 (15|30|60) 分钟空闲，请建议接下来做什么。)$/);
  if(generated.intent==='next_action'&&relativeMinutes){
   const minutes=Number(relativeMinutes[1]??relativeMinutes[2]);
   generated.nextActionWindow={start:new Date(recommendationAt).toISOString(),end:new Date(recommendationAt+minutes*60000).toISOString(),available:true};
  }
  const output=buildAssistantTurn(generated,context,previous,latest,input.locale);
  if(output.intent==='next_action'&&output.nextActionWindow){
   const start=Math.max(recommendationAt,Date.parse(output.nextActionWindow.start)),end=Date.parse(output.nextActionWindow.end);
   if(end<=start||end-start>86400000||start>Date.now()+30*86400000)return {body:{error:'invalid'},status:400};
   const facts=await nextActionFacts(client,userId,start,end);
   output.message=facts.selected?`${output.replyLocale==='zh'?'下一步':'Next'}: ${facts.selected.title}\n${facts.selected.estimate_minutes} ${output.replyLocale==='zh'?'分钟':'minutes'}`:output.replyLocale==='zh'?'这段时间没有合适的可执行任务。':'No actionable task fits this window.';
   if(facts.selected){
    const reason=output.replyLocale==='zh'
     ?facts.selected.source==='priority'?'这是你的今日重点，预计能在这段时间内完成。':facts.selected.source==='queue'?'这是行动队列中当前可做、且预计能在这段时间内完成的任务。':'这个任务当前可做，预计能在这段时间内完成。'
     :facts.selected.source==='priority'?'It is a daily priority and its estimate fits this window.':facts.selected.source==='queue'?'It is actionable in your queue and its estimate fits this window.':'It is actionable and its estimate fits this window.';
   output.message+=`\n${reason}`;
   }
   else output.ui.quickReplies=emptyTaskChoices[output.replyLocale];
   output.capture=buildCapturePreview({message:output.message,actions:[]},context);
  }
  const storedOutput={message:output.message,intent:output.intent,planning:output.planning,missing:output.missing,ui:output.ui,capture:output.capture,memoryUpdates:output.memoryUpdates,...(generated.cancelPlanning?{cancelPlanning:{sessionId:session.data.id,version:session.data.version}}:{})};
  if(!generated.cancelPlanning)emit?.(output.message);
  if(signal.aborted)throw new Error('Cancelled');
  const stored=await client.rpc('assistant_finish_turn',{p_id:input.requestId,p_fingerprint:fingerprint,p_output:storedOutput});
  if(stored.error||stored.data?.status!=='complete')return {body:{error:stored.data?.status==='conflict'?'conflict':'unavailable'},status:stored.data?.status==='conflict'?409:502};
  if(generated.cancelPlanning)emit?.(output.message);
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

