// @vitest-environment node
// Opt-in synthetic evaluation of the production prompt/schema/validator. No DB writes.
import {generateText,Output} from 'ai';
import {describe,it,expect} from 'vitest';
import {horizonPlanningInstructions,horizonGenerationOutput,flattenHorizonOutput,buildHorizonPreview} from '@/lib/ai/horizon-planning';
import {llmProvider,structuredOutputProviderOptions} from '@/lib/ai/provider';
import {DEFAULT_MODEL_ID} from '@/lib/ai/models';
import {safeAiFailure} from '@/lib/ai/safe-failure';
import {goldenContext,goldenInput} from '../../fixtures/assistant/phase-b-golden';
import {assistantInstructions,assistantOutput,buildAssistantTurn,selectMemories,type Memory} from '@/lib/ai/assistant-orchestrator';

function requireCredentials(){
 if(!process.env.LLM_API_KEY||/redacted|sensitive/i.test(process.env.LLM_API_KEY))throw new Error('Usable AI credentials are required for this opt-in evaluation');
}

describe.skipIf(process.env.PHASE_B_LIVE!=='1')('live Phase B planning quality',()=>{
 it('represents explicitly unnecessary travel as null without creating travel reservations',async()=>{
  requireCredentials();const context={timezone:'America/Los_Angeles',tasks:[],projects:[]};
  const prompt='For Sep21–Oct4 2026 in America/Los_Angeles, draft exactly two App focus blocks at home: Sep21 and Sep28 11:00–11:30. No travel is needed. All other dates have no new reservations. Leave unknown routines flexible. Plan now, preview only; no new tasks or memories.';
  let output;
  try{output=(await generateText({model:llmProvider(DEFAULT_MODEL_ID),output:Output.object({schema:assistantOutput}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:6144,abortSignal:AbortSignal.timeout(55000),system:`${assistantInstructions}\nOwner context:${JSON.stringify({capture:context,planning:null,memories:[]})}`,messages:[{role:'user',content:prompt}]})).output;}
  catch(error){throw new Error(`Synthetic no-travel evaluation failed: ${JSON.stringify(safeAiFailure(error))}; output withheld`);}
  const turn=buildAssistantTurn(output,context,null,prompt,'en');
  expect(turn.planning?.status).toBe('drafted');expect(turn.planning?.travelMinutes).toBeNull();expect(turn.capture.items).toEqual([]);
 },60000);
 it('produces a coherent golden two-week preview with family boundaries, open space and actionable admin tasks',async()=>{
  requireCredentials();
  let output;
  try{output=(await generateText({model:llmProvider(DEFAULT_MODEL_ID),output:Output.object({schema:horizonGenerationOutput(goldenInput.horizon)}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:16000,abortSignal:AbortSignal.timeout(285000),system:horizonPlanningInstructions(goldenInput,goldenContext,{tasks:[],events:[],priorities:[]}),messages:[{role:'user',content:JSON.stringify(goldenInput)}]})).output;}
  catch(error){throw new Error(`Synthetic model evaluation failed: ${JSON.stringify(safeAiFailure(error))}; output withheld`);}
  const plan=buildHorizonPreview(flattenHorizonOutput(output,goldenInput.horizon),goldenInput,goldenContext);
  expect(plan.questions).toEqual([]);expect(plan.events.length).toBeGreaterThan(14);
  const events=plan.events.map(event=>event.changes);
  const gym=events.filter(event=>/gym/i.test(String(event.title)));
  expect(gym.filter(event=>!/(travel|drive|commute)/i.test(String(event.title)))).toHaveLength(12);
  for(const event of events){
   const title=String(event.title),start=String(event.start_time),end=String(event.end_time);
   const day=new Date(`${event.start_date}T12:00:00Z`).getUTCDay();
   if(/gym/i.test(String(event.title)))expect(day).not.toBe(0);
   if(/gym/i.test(title)&&!/(travel|drive|commute)/i.test(title))expect(event).toMatchObject({start_time:day>=5?'06:30':'09:00',end_time:day>=5?'07:15':'09:45'});
   if(!/sleep/i.test(title)){
    expect(event.end_date).toBe(event.start_date);expect(start>='06:00'&&end<='22:00').toBe(true);
    const overlaps=(from:string,to:string)=>start<to&&end>from;
    if(!/meal|eat|breakfast|lunch|snack|walk/i.test(title))for(const [from,to] of [['10:00','10:30'],['13:30','14:00'],['15:30','16:00']])expect(overlaps(from,to)).toBe(false);
    if(!/dog|walk/i.test(title))expect(overlaps('06:00','06:15')).toBe(false);
    if(day>=1&&day<=4&&!/school|drop.?off|pick.?up|travel|drive|commute/i.test(title))for(const [from,to] of [['08:30','08:45'],['14:45','15:15']])expect(overlaps(from,to)).toBe(false);
   }
   if(/(?:app|youtube|focus|video)/i.test(String(event.title))){expect(day).toBeGreaterThan(0);expect(day).toBeLessThan(5);expect(String(event.end_time)<='14:45').toBe(true);}
   expect(String(event.title)).not.toMatch(/call|pediatrician|PCP|Matrix|dentist|therapist|psychiatrist|cleaning/i);
  }
  expect(plan.capture.items.some(item=>/call|pediatrician|PCP|Matrix/i.test(String(item.changes.title)))).toBe(true);
  expect(plan.capture.items.every(item=>item.kind==='task-create'||item.kind==='task-edit')).toBe(true);
  expect(plan.message).toMatch(/first|next|start/i);
  const first=events.find(event=>event.start_date==='2026-09-21'&&event.start_time==='10:30');
  expect(first).toMatchObject({end_time:'13:30'});expect(String(first?.title)).toMatch(/video|youtube/i);
  const outdoor=events.filter(event=>/overseed/i.test(String(event.title)));expect(outdoor).toHaveLength(1);expect(outdoor[0]).toMatchObject({start_date:'2026-09-22',start_time:'10:30',end_time:'12:30'});
  const duration=(event:typeof events[number])=>{const minutes=(value:unknown)=>{const [h,m]=String(value).split(':').map(Number);return h*60+m;};return minutes(event.end_time)-minutes(event.start_time);};
  const app=events.filter(event=>/\bapp\b/i.test(String(event.title))).reduce((sum,event)=>sum+duration(event),0);
  const youtube=events.filter(event=>/youtube|video/i.test(String(event.title))&&event!==first).reduce((sum,event)=>sum+duration(event),0);
  expect(app).toBeGreaterThan(0);expect(youtube).toBeGreaterThan(0);expect(Math.abs(app-youtube)/Math.max(app,youtube)).toBeLessThanOrEqual(0.35);
  for(let offset=0;offset<14;offset++){
   const date=new Date(Date.UTC(2026,8,21+offset)).toISOString().slice(0,10);
   // Measure the confirmed 06:00–22:00 waking window, even if sleep is
   // omitted from the calendar. Include blocks carried over from another day.
   const civil=(day:unknown,time:unknown)=>{const [h,m]=String(time).split(':').map(Number);return Date.parse(`${day}T00:00:00Z`)+(h*60+m)*60000;};
   const minutes=events.reduce((sum,event)=>sum+Math.max(0,Math.min(civil(event.end_date,event.end_time),civil(date,'22:00'))-Math.max(civil(event.start_date,event.start_time),civil(date,'06:00')))/60000,0);
   expect(minutes).toBeLessThanOrEqual(14*60);
  }
 },300000);
 it('keeps unknown exact times flexible and surfaces assumptions instead of inventing reservations',async()=>{
  requireCredentials();const input={...goldenInput,commitments:'Exact sleep, pickup, gym and work times are unknown.',needs:'Calls stay tasks. Family after pickup. Weekends family first.',goals:'Skip further discovery; provide a provisional draft with assumptions. Do not invent fixed times.',travelMinutes:null};
  let output;
  try{output=(await generateText({model:llmProvider(DEFAULT_MODEL_ID),output:Output.object({schema:horizonGenerationOutput(goldenInput.horizon)}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:4096,abortSignal:AbortSignal.timeout(55000),system:horizonPlanningInstructions(input,goldenContext,{tasks:[],events:[]}),messages:[{role:'user',content:JSON.stringify(input)}]})).output;}
  catch(error){throw new Error(`Synthetic evaluation failed: ${JSON.stringify(safeAiFailure(error))}; output withheld`);}
  const result=buildHorizonPreview(flattenHorizonOutput(output,input.horizon),input,goldenContext);expect(result.events).toEqual([]);expect(result.questions.length).toBeLessThanOrEqual(3);expect(result.assumptions.length).toBeGreaterThan(0);expect(result.message).toMatch(/draft|flexible|unknown|confirm/i);
 },60000);
 it('reuses confirmed durable preferences and the current temporary gym correction in a new conversation',async()=>{
  requireCredentials();const now=new Date('2026-09-21T12:00:00Z');
  const memory=(key:string,content:string):Memory=>({id:key==='gym'?'61500000-0000-0000-0000-000000000001':'61500000-0000-0000-0000-000000000002',key,content,kind:'preference',confidence:1,temporality:'durable',updated_at:now.toISOString(),effective_until:null});
  const memories=selectMemories([memory('gym','Gym Monday–Saturday'),memory('family','After pickup is family time. Long unordered lists increase procrastination; give one clear next action.'),{...memory('gym','For the next month, gym only four days a week.'),id:'61500000-0000-0000-0000-000000000003',temporality:'temporary',effective_until:'2026-10-21T12:00:00Z'},{...memory('vacation','Vacation for two weeks.'),temporality:'temporary',effective_until:'2026-09-20T00:00:00Z'}],null,now);
  const context={timezone:'America/Los_Angeles',tasks:[],projects:[]};let output;
  try{output=(await generateText({model:llmProvider(DEFAULT_MODEL_ID),output:Output.object({schema:assistantOutput}),providerOptions:structuredOutputProviderOptions,maxOutputTokens:6144,abortSignal:AbortSignal.timeout(55000),system:`${assistantInstructions}\nCurrent instant:${now.toISOString()}. Owner context:${JSON.stringify({capture:context,planning:null,memories})}`,messages:[{role:'user',content:'Help me plan next week. Keep using my current preferences.'}]})).output;}
  catch(error){throw new Error(`Synthetic evaluation failed: ${JSON.stringify(safeAiFailure(error))}; output withheld`);}
  const turn=buildAssistantTurn(output,context,null,'Help me plan next week.','en');
  expect(turn.intent).toBe('planning');expect(JSON.stringify(turn.planning?.facts)).toMatch(/four|4/i);expect(JSON.stringify(turn.planning?.facts)).toMatch(/family/i);
  expect(turn.message).not.toMatch(/how (?:many|often).*gym|still.*vacation|on vacation/i);expect(turn.capture.items).toEqual([]);
 },60000);
});
