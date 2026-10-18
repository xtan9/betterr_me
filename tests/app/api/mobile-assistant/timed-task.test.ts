import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({generate:vi.fn(),stream:vi.fn(),rpc:vi.fn(),from:vi.fn(),auth:vi.fn(),googleEvents:vi.fn()}));
vi.mock('ai',()=>({generateText:mocks.generate,streamText:mocks.stream,Output:{object:({schema}: {schema:unknown})=>({schema})}}));
vi.mock('@/lib/auth/native-request',()=>({authenticateNativeRequest:mocks.auth}));
vi.mock('@/lib/google/assistant',async()=>({...await vi.importActual<typeof import('@/lib/google/assistant')>('@/lib/google/assistant'),googleAssistantStatus:async()=>({configured:false,connections:[]})}));
vi.mock('@/lib/google/planning',()=>({googleDayRange:mocks.googleEvents}));
import {POST} from '@/app/api/mobile/assistant/route';

const owner='61300000-0000-0000-0000-000000000001';
const requestId='61300000-0000-0000-0000-000000000002';
const revision='61300000-0000-0000-0000-000000000003';
let referenceAt='2026-10-18T19:00:00Z';
let events:Record<string,unknown>[]=[];
const request=(extra:Record<string,unknown>={})=>new Request('https://betterr.me/api/mobile/assistant',{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:JSON.stringify({requestId,consent:true,locale:'zh',supportsTimedTasks:true,deviceTimezone:'America/Los_Angeles',messages:[{role:'user',content:'今晚九点检查门窗'}],...extra})});
const action=(schedule:Record<string,unknown>={},estimateMinutes:number|null=null)=>({kind:'task-create',title:'检查门窗',estimateMinutes,dueDate:null,projectId:null,projectKey:null,schedule:{startDate:'2026-10-18',startTime:'21:00',timezone:null,endDate:null,endTime:null,durationMinutes:null,pastConfirmed:false,...schedule}});
const reply=(actions=[action()])=>({intent:'capture',replyLocale:'zh',message:'请确认今晚九点检查门窗。',planning:null,nextActionWindow:null,memoryUpdates:[],actions});
beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-18T19:00:00Z'));vi.clearAllMocks();
 referenceAt='2026-10-18T19:00:00Z';events=[];
 mocks.googleEvents.mockReset().mockResolvedValue([]);
 vi.stubEnv('LLM_API_KEY','local-test-key');
 mocks.auth.mockResolvedValue({userId:owner,client:{from:mocks.from,rpc:mocks.rpc}});
 mocks.from.mockImplementation((table:string)=>{
  const data=table==='profiles'?{timezone:'UTC'}:['tasks','projects','user_memories'].includes(table)?[]:null;
  const query={select:()=>query,eq:()=>query,or:()=>query,is:()=>query,not:()=>query,order:()=>query,limit:()=>query,single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};
  return query;
 });
 mocks.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{
  if(name==='check_ai_chat_rate_limit')return {data:[{allowed:true,minute_remaining:9,day_remaining:99}],error:null};
  if(name==='assistant_begin_turn')return {data:{status:'prepared',referenceAt,messages:args.p_messages},error:null};
  if(name==='planner_horizon_context'||name==='planner_schedule_context')return {data:{version:revision,coverageComplete:true,events,tasks:[]},error:null};
  const output=args.p_output as {message:string;intent:string;capture:unknown};
  return {data:{status:'complete',response:{message:output.message,intent:output.intent,conversationId:requestId,proposal:{id:requestId,version:revision,state:'pending',body:output.capture}}},error:null};
 });
 mocks.generate.mockResolvedValue({output:reply()});
});

it.each([
 [{durationMinutes:10},null,'21:10','explicit'],
 [{endTime:'21:15',durationMinutes:10},null,'21:15','explicit'],
 [{},45,'21:45','estimate'],
] as const)('uses the approved end/duration/estimate precedence: %j',async(schedule,estimate,endTime,durationSource)=>{
 mocks.generate.mockResolvedValue({output:reply([action(schedule,estimate)])});
 const result=await (await POST(request())).json();
 expect(result.proposal.body.items[0]).toMatchObject({changes:{estimate_minutes:estimate},schedule:{endTime,durationSource}});
});

it('keeps an explicit timezone and a reservation crossing midnight without changing the task date fields',async()=>{
 mocks.generate.mockResolvedValue({output:reply([action({startDate:'2026-10-19',startTime:'23:45',timezone:'Asia/Tokyo',durationMinutes:30})])});
 const response=await POST(request());expect(response.status).toBe(200);
 const item=(await response.json()).proposal.body.items[0];
 expect(item.schedule).toEqual({startDate:'2026-10-19',startTime:'23:45',endDate:'2026-10-20',endTime:'00:15',timezone:'Asia/Tokyo',durationSource:'explicit'});
 expect(item.changes).toEqual({title:'检查门窗',estimate_minutes:null,due_date:null});
});

it('anchors an interrupted generation to its original server instant after midnight',async()=>{
 vi.setSystemTime(new Date('2026-10-19T08:00:00Z'));
 const result=await (await POST(request())).json();
 expect(result.proposal.body.items[0].schedule.startDate).toBe('2026-10-18');
 expect(mocks.generate.mock.calls[0][0].system).toContain('Current instant: 2026-10-18T19:00:00.000Z; current local date: 2026-10-18');
});

it('uses the account timezone when the device timezone is unavailable, while rejecting an invalid supplied zone',async()=>{
 const result=await (await POST(request({deviceTimezone:undefined}))).json();
 expect(result.proposal.body.items[0].schedule.timezone).toBe('UTC');
 expect((await POST(request({deviceTimezone:'Invalid/Private'}))).status).toBe(400);
});

it('does not expose an unseen calendar mutation to a client without timed-task support',async()=>{
 const result=await (await POST(request({supportsTimedTasks:undefined,deviceTimezone:undefined}))).json();
 expect(result.intent).toBe('clarification');expect(result.proposal.body.items).toEqual([]);
 expect(result.message).toContain('更新应用');
});

it.each([
 [{startDate:'2026-10-18',startTime:'11:00'},'已经过去'],
 [{startDate:'2026-11-01',startTime:'01:30'},'出现两次'],
 [{startDate:'2027-03-14',startTime:'02:30'},'跳过'],
] as const)('asks about unsafe local time %j without leaving an untimed task proposal',async(schedule,message)=>{
 mocks.generate.mockResolvedValue({output:reply([action(schedule)])});
 const response=await POST(request());expect(response.status).toBe(200);
 const result=await response.json();expect(result.intent).toBe('clarification');expect(result.proposal.body.items).toEqual([]);expect(result.message).toContain(message);
});

it('requires an actual preceding confirmation exchange before honoring a model pastConfirmed flag',async()=>{
 mocks.generate.mockResolvedValue({output:reply([action({startTime:'11:00',pastConfirmed:true})])});
 const denied=await (await POST(request())).json();
 expect(denied.proposal.body.items).toEqual([]);
 const confirmed=await (await POST(request({messages:[{role:'user',content:'今天上午十一点检查门窗'},{role:'assistant',content:denied.message},{role:'user',content:'是，仍然安排在这个时间。'}]}))).json();
 expect(confirmed.proposal.body.items[0].schedule.startTime).toBe('11:00');
});

it('keeps a requested fixed start when a protected commitment conflicts and asks for a change',async()=>{
 events=[{id:'protected',title:'Existing private appointment',start_date:'2026-10-18',end_date:'2026-10-18',start_time:'21:15',end_time:'22:00',timezone:'America/Los_Angeles',is_recurring:false,is_protected:true}];
 const result=await (await POST(request())).json();
 expect(result.intent).toBe('clarification');expect(result.proposal.body.items).toEqual([]);expect(result.message).toContain('冲突');
 expect(result.message).not.toContain('Existing private appointment');
});

it('checks Google occupancy in an explicit timezone when its date differs from the device date',async()=>{
 mocks.generate.mockResolvedValue({output:reply([action({startDate:'2026-10-20',startTime:'00:15',timezone:'Asia/Tokyo'})])});
 // The occupied instant is October 19 in Los Angeles, outside an October 20 LA query.
 mocks.googleEvents.mockImplementation(async(_owner:string,startDate:string,endDate:string,timezone:string)=>timezone==='Asia/Tokyo'&&startDate==='2026-10-20'&&endDate==='2026-10-20'
  ?[{id:'google',title:'Private external commitment',start_date:'2026-10-19',end_date:'2026-10-19',start_time:'15:00',end_time:'16:00',timezone:'UTC',is_recurring:false}]:[]);
 const result=await (await POST(request())).json();
 expect(result.intent).toBe('clarification');expect(result.proposal.body.items).toEqual([]);expect(result.message).toContain('冲突');
});

it('asks to separate a recurring request rather than overlook a newly proposed recurring conflict',async()=>{
 mocks.generate.mockResolvedValue({output:{...reply(),actions:[action(),{kind:'routine-create',title:'Evening routine',date:'2026-10-18',startTime:'21:00',endTime:'22:00',timezone:'America/Los_Angeles',protected:true,frequency:'daily',daysOfWeek:[]}]}});
 const result=await (await POST(request())).json();
 expect(result.intent).toBe('clarification');expect(result.proposal.body.items).toEqual([]);expect(result.message).toContain('重复');
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});

it('previews tonight at nine as a linked time reservation and keeps the task estimate unknown',async()=>{
 const response=await POST(request());expect(response.status).toBe(200);
 const result=await response.json();
 expect(result.proposal.body).toMatchObject({contextVersion:revision,items:[{kind:'task-create',changes:{title:'检查门窗',estimate_minutes:null,due_date:null},schedule:{startDate:'2026-10-18',startTime:'21:00',endDate:'2026-10-18',endTime:'21:30',timezone:'America/Los_Angeles',durationSource:'default'}}]});
 expect(result.proposal.body.items[0].changes).not.toHaveProperty('planned_date');
 expect(mocks.generate.mock.calls[0][0].system).toContain('America/Los_Angeles');
 expect(mocks.rpc.mock.calls.some(([name])=>name==='task_capture_command'||name==='calendar_capture_command')).toBe(false);
});
