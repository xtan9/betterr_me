// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({generate:vi.fn(),rpc:vi.fn(),from:vi.fn(),auth:vi.fn(),googleEvents:vi.fn()}));
vi.mock('ai',()=>({generateText:mocks.generate,streamText:vi.fn(),Output:{object:({schema}:{schema:unknown})=>({schema})}}));
vi.mock('@/lib/auth/native-request',()=>({authenticateNativeRequest:mocks.auth}));
vi.mock('@/lib/google/assistant',async()=>({...await vi.importActual<typeof import('@/lib/google/assistant')>('@/lib/google/assistant'),googleAssistantStatus:async()=>({configured:false,connections:[]})}));
vi.mock('@/lib/google/planning',()=>({googleDayRange:mocks.googleEvents}));
import {POST} from '@/app/api/mobile/assistant/route';
import {captureOutput} from '@/lib/ai/native-capture';
const owner='61300000-0000-0000-0000-000000000001',id='61300000-0000-0000-0000-000000000002';
const request=(extra:Record<string,unknown>={})=>new Request('https://backend.test/api/mobile/assistant',{method:'POST',body:JSON.stringify({requestId:id,consent:true,locale:'zh',supportsTrainingPlans:true,deviceTimezone:'America/Los_Angeles',messages:[{role:'user',content:'今天要练腿'}],...extra})});
const action=(extra:Record<string,unknown>={})=>({kind:'training-create',title:'练腿',date:'2026-10-28',timezone:'America/Los_Angeles',templateId:null,startTime:null,endTime:null,...extra});
let templates:unknown[]=[],templateError:unknown=null,templateReady=true;
beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-28T18:00:00Z'));vi.clearAllMocks();vi.stubEnv('LLM_API_KEY','test-key');templates=[];templateError=null;templateReady=true;
 mocks.auth.mockResolvedValue({userId:owner,client:{from:mocks.from,rpc:mocks.rpc}});
 mocks.googleEvents.mockResolvedValue([]);
 mocks.from.mockImplementation((table:string)=>{
  const data=table==='profiles'?{timezone:'UTC'}:table==='routines'?templates:['tasks','projects','user_memories'].includes(table)?[]:null;
  const query={select:()=>query,eq:()=>query,is:()=>query,or:()=>query,not:()=>query,order:()=>query,limit:()=>query,single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data,error:table==='routines'?templateError:null}).then(resolve)};return query;
 });
 mocks.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{
  if(name==='check_ai_chat_rate_limit')return {data:[{allowed:true,minute_remaining:9,day_remaining:99}],error:null};
  if(name==='assistant_begin_turn')return {data:{status:'prepared',referenceAt:'2026-10-28T18:00:00Z',referenceTimezone:'UTC',messages:args.p_messages},error:null};
  if(name==='read_train_templates')return {data:{status:'available',protocolVersion:1,nextCursor:null,templates:templates.map(template=>({protocolVersion:1,template:{ownerId:owner,notes:null,archivedAt:null,entries:[],...(template as Record<string,unknown>)},definitions:[],startability:{templateVersion:(template as {version:string}).version,ready:templateReady,reasons:templateReady?[]:[{code:'template_metadata_invalid',field:'name'}]},usage:{lastPerformedAt:null}}))},error:templateError};
  if(name==='planner_horizon_context')return {data:{version:id,timezone:'America/Los_Angeles',coverageComplete:true,events:[]},error:null};
  const output=args.p_output as {message:string;intent:string;capture:unknown};
  return {data:{status:'complete',response:{message:output.message,intent:output.intent,conversationId:id,proposal:{id,version:id,state:'pending',body:output.capture}}},error:null};
 });
 mocks.generate.mockResolvedValue({output:{intent:'capture',replyLocale:'zh',message:'请确认今天的练腿计划。',actions:[action()],planning:null,nextActionWindow:null,memoryUpdates:[]}});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
it('previews today as one training plan without inventing a clock time, duration, or performed workout',async()=>{
 const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();
 expect(body.proposal.body.items).toHaveLength(1);
 expect(body.proposal.body.items[0]).toMatchObject({kind:'training-create',changes:{title:'练腿',date:'2026-10-28',timezone:'America/Los_Angeles',trainingTemplateId:null}});
 expect(Object.keys(body.proposal.body.items[0].changes).sort()).toEqual(['date','timezone','title','trainingTemplateId']);
 expect(mocks.googleEvents).not.toHaveBeenCalled();
 expect(mocks.rpc.mock.calls.map(([name])=>name)).toEqual(['check_ai_chat_rate_limit','assistant_begin_turn','read_train_templates','assistant_finish_turn']);
});
it('binds a chosen existing template to its verified name and version',async()=>{
 templates=[{id,name:'Leg day',version:'9007199254740993'}];
 mocks.generate.mockResolvedValue({output:{intent:'capture',replyLocale:'zh',message:'请确认训练计划。',actions:[action({templateId:id})],planning:null,nextActionWindow:null,memoryUpdates:[]}});
 const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();
 expect(body.proposal.body.items[0].changes).toMatchObject({trainingTemplateId:id,trainingTemplateName:'Leg day',trainingTemplateVersion:'9007199254740993'});
 expect(mocks.generate.mock.calls[0][0].system).toContain('Leg day');
});
it('checks an explicitly timed training against current commitments without changing its requested time',async()=>{
 mocks.generate.mockResolvedValue({output:{intent:'capture',replyLocale:'zh',message:'请确认训练计划。',actions:[action({startTime:'18:00',endTime:'19:00'})],planning:null,nextActionWindow:null,memoryUpdates:[]}});
 mocks.googleEvents.mockResolvedValue([{id:'busy',title:'Private appointment',start_date:'2026-10-29',end_date:'2026-10-29',start_time:'01:30',end_time:'02:00',timezone:'UTC',is_recurring:false}]);
 const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();
 expect(body.intent).toBe('clarification');expect(body.proposal.body.items).toEqual([]);expect(body.message).toContain('冲突');expect(body.message).not.toContain('Private appointment');
});
it.each([
 [{}, {supportsTrainingPlans:undefined},'更新应用'],
 [{date:'2026-10-27'}, {},'日期已经过去'],
 [{startTime:'18:00'}, {},'持续多久'],
 [{startTime:'10:00',endTime:'11:00'}, {},'时间已经过去'],
 [{templateId:id}, {},'无法确认'],
 [{date:'2026-11-01',startTime:'01:30',endTime:'03:00'}, {},'出现两次'],
] as const)('asks one focused question for an unreviewable training plan %j',async(changes,capability,expected)=>{
 mocks.generate.mockResolvedValue({output:{intent:'capture',replyLocale:'zh',message:'Preview',actions:[action(changes)],planning:null,nextActionWindow:null,memoryUpdates:[]}});
 const response=await POST(request(capability));expect(response.status).toBe(200);const body=await response.json();
 expect(body.intent).toBe('clarification');expect(body.proposal.body.items).toEqual([]);expect(body.message).toContain(expected);expect(mocks.googleEvents).not.toHaveBeenCalled();
});
it('does not advertise Assistant training actions through the legacy planning capture schema',()=>{
 expect(captureOutput.safeParse({message:'Training',actions:[action()]}).success).toBe(false);
});
it('keeps a date-only plan possible when optional template context is unavailable without claiming no templates exist',async()=>{
 templateError={message:'Private unavailable context'};
 const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();
 expect(body.proposal.body.items[0].kind).toBe('training-create');
 const system=mocks.generate.mock.calls[0][0].system;
 expect(system).toContain('"trainingTemplatesAvailable":false');expect(system).toContain('not that the user has no templates');expect(system).not.toContain('Private unavailable context');
});
it('asks for a same-day interval when an end would require an unsupported cross-day training reservation',async()=>{
 mocks.generate.mockResolvedValue({output:{intent:'capture',replyLocale:'en',message:'Review your training.',actions:[action({startTime:'23:30',endTime:'00:30'})],planning:null,nextActionWindow:null,memoryUpdates:[]}});
 const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();
 expect(body.intent).toBe('clarification');expect(body.proposal.body.items).toEqual([]);expect(body.message).toContain('same day');
 expect(mocks.googleEvents).not.toHaveBeenCalled();
});
it.each([
 {archivedAt:'2026-10-27T10:00:00Z'},
 {ownerId:'61300000-0000-0000-0000-000000000099'},
] as const)('never selects an archived or foreign template %j',async(extra)=>{
 templates=[{id,name:'Hidden template',version:'4',...extra}];
 mocks.generate.mockResolvedValue({output:{intent:'capture',replyLocale:'zh',message:'Review',actions:[action({templateId:id})],planning:null,nextActionWindow:null,memoryUpdates:[]}});
 const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();
 expect(body.intent).toBe('clarification');expect(body.proposal.body.items).toEqual([]);expect(mocks.generate.mock.calls[0][0].system).not.toContain('Hidden template');
});
it('does not select a template that Train cannot start',async()=>{
 templates=[{id,name:'Unusable template',version:'7'}];templateReady=false;
 mocks.generate.mockResolvedValue({output:{intent:'capture',replyLocale:'zh',message:'Review',actions:[action({templateId:id})],planning:null,nextActionWindow:null,memoryUpdates:[]}});
 const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();
 expect(body.intent).toBe('clarification');expect(body.proposal.body.items).toEqual([]);expect(mocks.generate.mock.calls[0][0].system).not.toContain('Unusable template');
});
