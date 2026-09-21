import {datedOutput} from '../../../fixtures/assistant/dated-output';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn(),from:vi.fn(),generate:vi.fn(),logError:vi.fn()}));
vi.mock('@/lib/logger',()=>({log:{error:m.logError}}));
vi.mock('ai',()=>({generateText:m.generate,Output:{object:vi.fn()}}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:m.getUser},rpc:m.rpc,from:m.from})}));
import {POST} from '@/app/api/mobile/planning/route';
import {planningOutput} from '@/lib/ai/guided-planning';
const owner='61500000-0000-0000-0000-000000000001',eventId='61500000-0000-0000-0000-000000000003';
const context={version:owner,timezone:'UTC',tasks:[],events:[] as Record<string,unknown>[],priorities:{version:null,taskIds:[]}};
const output=()=>({message:'Review rest',questions:[],assumptions:[],capture:{message:'',actions:[]},events:[{kind:'event-create',targetId:null,title:'Rest',startTime:'12:00',endTime:'12:30',taskId:null,taskItemIndex:null,protected:true,category:'rest'}],priorityTaskIds:null});
const request=(extra={})=>new Request('https://betterr.me/api/mobile/planning',{method:'POST',headers:{Authorization:'Bearer user-token'},body:JSON.stringify({requestId:'61500000-0000-0000-0000-000000000002',consent:true,locale:'en',date:'2030-01-01',timezone:'UTC',commitments:'',needs:'Rest 12 to 12:30',goals:'Tired day',travelMinutes:null,...extra})});
beforeEach(()=>{vi.clearAllMocks();context.events=[];vi.stubEnv('LLM_API_KEY','test');vi.stubEnv('LLM_MODEL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:55721');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','test-anon');m.getUser.mockResolvedValue({data:{user:{id:owner}},error:null});m.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null})};return q;});m.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>({error:null,data:name==='planner_schedule_context'?context:name==='check_ai_chat_rate_limit'?[{allowed:true,minute_remaining:9,day_remaining:99}]:{status:'complete',proposal:{body:args.p_body}}}));m.generate.mockResolvedValue({output:output()});});
it('stores exact preview and free time without accepting changes',async()=>{const response=await POST(request());expect(response.status).toBe(200);const body=(await response.json()).proposal.body;expect(body.events[0].changes).toMatchObject({title:'Rest',start_time:'12:00',is_protected:true});expect(body.freeTime).toHaveLength(2);expect(m.rpc.mock.calls.map(call=>call[0])).toEqual(['check_ai_chat_rate_limit','planner_schedule_context','planner_schedule_store_proposal']);expect(m.generate.mock.calls[0][0]).not.toHaveProperty('tools');expect(m.generate.mock.calls[0][0].providerOptions).toEqual({openai:{strictJsonSchema:false}});});
it.each(['12:00:00','2030-01-01T12:00:00Z'])('regenerates invalid time format %s without normalizing invalid output into acceptance',async(startTime)=>{
 const invalid=output();invalid.events[0].startTime=startTime;const parsed=planningOutput.safeParse(invalid);expect(parsed.success).toBe(false);
 const failure={name:'AI_NoObjectGeneratedError',cause:{name:'AI_TypeValidationError',cause:parsed.error}};
 m.generate.mockRejectedValueOnce(failure).mockResolvedValue({output:output()});
 const response=await POST(request());expect(response.status).toBe(200);
 expect((await response.json()).proposal.body.events[0].changes.start_time).toBe('12:00');
 expect(m.generate).toHaveBeenCalledTimes(2);expect(m.generate.mock.calls[1][0].system).toContain('HH:MM');
 expect(m.rpc.mock.calls.filter(call=>call[0]==='planner_schedule_store_proposal')).toHaveLength(1);
});
it('exhausts one schema retry without storing a proposal or echoing invalid private output',async()=>{
 const failure={name:'AI_NoObjectGeneratedError',text:'PRIVATE invalid model output',cause:{name:'AI_TypeValidationError',cause:{issues:[{code:'invalid_string',path:['events',0,'startTime'],message:'PRIVATE invalid model output'}]}}};
 m.generate.mockRejectedValue(failure);const response=await POST(request());expect(response.status).toBe(502);expect(await response.text()).not.toContain('PRIVATE');
 expect(m.generate).toHaveBeenCalledTimes(2);expect(m.generate.mock.calls[1][0].system).not.toContain('PRIVATE');expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);
});
it.each(['gpt-5.3-codex-spark','gpt-5.4-mini'])('ignores obsolete environment model %s and uses the supported gateway model',async(obsoleteModel)=>{vi.stubEnv('LLM_MODEL',obsoleteModel);expect((await POST(request())).status).toBe(200);expect(m.generate.mock.calls[0][0].model.modelId).toBe('gpt-5.5');});
it('requires consent and authenticated user',async()=>{expect((await POST(request({consent:false}))).status).toBe(400);m.getUser.mockResolvedValue({data:{user:null},error:{}});expect((await POST(request())).status).toBe(401);expect(m.generate).not.toHaveBeenCalled();});
it('reports missing recurrence coverage without calling the provider or changing records',async()=>{m.rpc.mockImplementation(async(name:string)=>({error:null,data:name==='check_ai_chat_rate_limit'?[{allowed:true,minute_remaining:9,day_remaining:99}]:{...context,coverageComplete:false}}));const response=await POST(request());expect(response.status).toBe(422);expect(await response.json()).toEqual({error:'coverage'});expect(m.generate).not.toHaveBeenCalled();expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);});
it('asks for unknown travel instead of inventing a duration',async()=>{const result=output();result.events[0].category='travel';m.generate.mockResolvedValue({output:result});const response=await POST(request());const body=(await response.json()).proposal.body;expect(body.questions).toHaveLength(1);expect(body.events).toEqual([]);});
it('preserves protected commitments and refuses overlapping additions',async()=>{context.events=[{id:eventId,title:'Care',version:owner,start_date:'2030-01-01',end_date:'2030-01-01',start_time:'12:15',end_time:'12:45',timezone:'UTC',app_owned:true,is_protected:true,is_recurring:false}];expect((await POST(request())).status).toBe(502);expect(m.generate).toHaveBeenCalledTimes(1);expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);});
it('does not save on provider failure or stale context',async()=>{m.generate.mockRejectedValueOnce(new Error('private text'));const response=await POST(request());expect(response.status).toBe(502);expect(await response.text()).not.toContain('private');m.rpc.mockImplementation(async(name:string)=>({data:name==='check_ai_chat_rate_limit'?[{allowed:true,minute_remaining:9,day_remaining:99}]:name==='planner_schedule_context'?context:{status:'conflict'},error:null}));expect((await POST(request())).status).toBe(409);});
it('rejects malformed non-strict provider output without storing a proposal',async()=>{m.generate.mockResolvedValue({output:{...output(),events:undefined}});expect((await POST(request())).status).toBe(502);expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);});
it('expands existing daily recurrence and rejects a conflicting weekend block',async()=>{context.events=[{id:eventId,title:'Daily care',start_date:'2029-12-01',end_date:'2029-12-01',start_time:'12:00',end_time:'12:30',timezone:'UTC',is_recurring:true,recurrence_rule:{frequency:'daily',interval:1},end_type:'never'}];expect((await POST(request({date:'2030-01-05'}))).status).toBe(502);expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);});
it('keeps Tuesday free when a new weekly routine only occurs on Monday',async()=>{m.generate.mockResolvedValue({output:{...output(),events:[],capture:{message:'Mondays only',actions:[{kind:'routine-create',title:'Weekly care',date:'2030-01-01',startTime:'08:00',endTime:'08:30',timezone:'UTC',protected:true,frequency:'weekly',daysOfWeek:[1]}]}}});const response=await POST(request());expect(response.status).toBe(200);const body=(await response.json()).proposal.body;expect(body.capture.items[0].changes.rule).toMatchObject({frequency:'weekly',days_of_week:[1]});expect(body.freeTime).toEqual([{start:'2030-01-01T00:00:00.000Z',end:'2030-01-02T00:00:00.000Z'}]);});
it('previews a tired-day move with exact original version and unchanged protected sleep',async()=>{context.events=[{id:eventId,title:'Deep work',version:owner,start_date:'2030-01-01',end_date:'2030-01-01',start_time:'15:00',end_time:'16:00',timezone:'UTC',app_owned:true,is_protected:false,is_recurring:false},{id:'61500000-0000-0000-0000-000000000004',title:'Sleep',start_date:'2030-01-01',end_date:'2030-01-01',start_time:'00:00',end_time:'08:00',timezone:'UTC',app_owned:true,is_protected:true,is_recurring:false}];const result=output();Object.assign(result.events[0],{kind:'event-edit',targetId:eventId,title:'Deep work',startTime:'16:00',endTime:'17:00',protected:false,category:'work'});m.generate.mockResolvedValue({output:result});const response=await POST(request());expect(response.status).toBe(200);const body=(await response.json()).proposal.body;expect(body.events).toHaveLength(1);expect(body.events[0]).toMatchObject({targetId:eventId,expectedVersion:owner,before:{start_time:'15:00'},changes:{start_time:'16:00'}});expect(body.freeTime[0].start).toBe('2030-01-01T08:00:00.000Z');});

const horizon={startDate:'2030-01-01',endDate:'2030-01-14',timezone:'UTC'};
const horizonRequest=()=>request({date:undefined,timezone:undefined,horizon});
afterEach(()=>vi.useRealTimers());
it('completes a multi-day preview beyond two minutes without accepting it',async()=>{
 vi.useFakeTimers();let signal!:AbortSignal;
 const rpc=m.rpc.getMockImplementation()!;
 m.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='planner_horizon_context'?Promise.resolve({data:context,error:null}):rpc(name,args));
 m.generate.mockImplementation(async(options:{abortSignal:AbortSignal})=>{signal=options.abortSignal;await new Promise(resolve=>setTimeout(resolve,150000));return {output:datedOutput({...output(),events:[]},horizon)};});
 const response=POST(horizonRequest());await vi.advanceTimersByTimeAsync(150000);
 expect((await response).status).toBe(200);expect(signal.aborted).toBe(false);
 expect(m.rpc.mock.calls.filter(call=>call[0]==='planner_schedule_store_proposal')).toHaveLength(1);
 expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_command')).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it.each(['deadline','disconnect'])('never retries or stores a preview after generation %s',async(reason)=>{
 vi.useFakeTimers();const parent=new AbortController();let signal!:AbortSignal;
 const rpc=m.rpc.getMockImplementation()!;
 m.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='planner_horizon_context'?Promise.resolve({data:context,error:null}):rpc(name,args));
 m.generate.mockImplementation((options:{abortSignal:AbortSignal})=>{signal=options.abortSignal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject({name:'AI_NoObjectGeneratedError',cause:{name:'AI_TypeValidationError'}}),{once:true}));});
 const response=POST(new Request(horizonRequest(),{signal:parent.signal}));await vi.advanceTimersByTimeAsync(0);
 if(reason==='deadline'){await vi.advanceTimersByTimeAsync(284000);expect(signal.aborted).toBe(false);await vi.advanceTimersByTimeAsync(1000);}else parent.abort();
 expect((await response).status).toBe(reason==='disconnect'?499:502);
 expect(signal.aborted).toBe(true);expect(m.generate).toHaveBeenCalledTimes(1);
 expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it('loads coverage for the entire horizon and stores one exact multi-day envelope',async()=>{
 m.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>({error:null,data:name==='planner_horizon_context'?{...context,coverageComplete:true}:name==='check_ai_chat_rate_limit'?[{allowed:true,minute_remaining:9,day_remaining:99}]:{status:'complete',proposal:{body:args.p_body}}}));
 m.generate.mockResolvedValue({output:datedOutput({...output(),events:[{...output().events[0],date:'2030-01-01'},{...output().events[0],date:'2030-01-14'}]},horizon)});
 const response=await POST(horizonRequest());expect(response.status).toBe(200);const body=(await response.json()).proposal.body;
 expect(body.horizon).toEqual(horizon);expect(body.events.map((e:{changes:{start_date:string}})=>e.changes.start_date)).toEqual(['2030-01-01','2030-01-14']);
 expect(m.rpc).toHaveBeenCalledWith('planner_horizon_context',{p_start:'2030-01-01',p_end:'2030-01-14'});
 expect(m.generate).toHaveBeenCalledTimes(1);expect(m.generate.mock.calls[0][0].system).toContain('weekday/weekend');
 expect(m.rpc.mock.calls.filter(call=>call[0]==='planner_schedule_store_proposal')).toHaveLength(1);
});
it('refuses generation when even a later civil day has incomplete recurrence coverage',async()=>{
 m.rpc.mockImplementation(async(name:string)=>({error:null,data:name==='check_ai_chat_rate_limit'?[{allowed:true,minute_remaining:9,day_remaining:99}]:{...context,coverageComplete:false}}));
 expect((await POST(horizonRequest())).status).toBe(422);expect(m.generate).not.toHaveBeenCalled();
});
it('never stores a partial model calendar labelled as a complete fortnight',async()=>{
 const rpc=m.rpc.getMockImplementation()!;m.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='planner_horizon_context'?Promise.resolve({data:context,error:null}):rpc(name,args));
 const generated=datedOutput({...output(),events:[{...output().events[0],date:'2030-01-01'}]},horizon);
 delete generated.days['2030-01-14'];m.generate.mockResolvedValue({output:generated});
 expect((await POST(horizonRequest())).status).toBe(502);
 expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);
});
it('does not store the earlier days if a later event conflicts',async()=>{
 context.events=[{id:eventId,title:'Family',start_date:'2030-01-14',end_date:'2030-01-14',start_time:'12:00',end_time:'13:00',is_recurring:false,is_protected:true,timezone:'UTC'}];
 m.rpc.mockImplementation(async(name:string)=>({error:null,data:name==='check_ai_chat_rate_limit'?[{allowed:true,minute_remaining:9,day_remaining:99}]:{...context,coverageComplete:true}}));
 m.generate.mockResolvedValue({output:datedOutput({...output(),events:[{...output().events[0],date:'2030-01-01'},{...output().events[0],date:'2030-01-14'}]},horizon)});
 expect((await POST(horizonRequest())).status).toBe(502);expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);
 expect(m.logError).toHaveBeenCalledWith('[mobile-planning] Request failed',undefined,expect.objectContaining({stage:'validation',reason:'overlap',failure:{name:'Error'}}));
 expect(JSON.stringify(m.logError.mock.calls)).not.toContain('Family');
 expect(m.generate).toHaveBeenCalledTimes(2);
});
it('regenerates an overlapping horizon once and stores only the fully revalidated replacement',async()=>{
 context.events=[{id:eventId,title:'PRIVATE family',start_date:'2030-01-14',end_date:'2030-01-14',start_time:'12:00',end_time:'13:00',is_recurring:false,is_protected:true,timezone:'UTC'}];
 const rpc=m.rpc.getMockImplementation()!;
 m.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='planner_horizon_context'?Promise.resolve({data:context,error:null}):rpc(name,args));
 const invalid={...output(),events:[{...output().events[0],date:'2030-01-14'}]};
 const valid={...output(),events:[{...output().events[0],date:'2030-01-14',startTime:'14:00',endTime:'14:30'}]};
 m.generate.mockResolvedValueOnce({output:datedOutput(invalid,horizon)}).mockResolvedValueOnce({output:datedOutput(valid,horizon)});
 const response=await POST(horizonRequest());expect(response.status).toBe(200);
 expect((await response.json()).proposal.body.events[0].changes.start_time).toBe('14:00');
 expect(m.generate).toHaveBeenCalledTimes(2);expect(m.generate.mock.calls[1][0].messages[1].content).toBe(JSON.stringify(datedOutput(invalid,horizon)));
 expect(m.rpc.mock.calls.filter(call=>call[0]==='planner_schedule_store_proposal')).toHaveLength(1);
 expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_command')).toBe(false);expect(m.logError).not.toHaveBeenCalled();
});
it('shares one retry across schema failure and overlap rejection',async()=>{
 const rpc=m.rpc.getMockImplementation()!;m.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='planner_horizon_context'?Promise.resolve({data:context,error:null}):rpc(name,args));
 const event={...output().events[0],date:'2030-01-01'};
 m.generate.mockRejectedValueOnce({name:'AI_NoObjectGeneratedError',cause:{name:'AI_TypeValidationError'}}).mockResolvedValue({output:datedOutput({...output(),events:[event,event]},horizon)});
 expect((await POST(horizonRequest())).status).toBe(502);expect(m.generate).toHaveBeenCalledTimes(2);
 expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);
});
it.each(['deadline','disconnect'])('cancels overlap regeneration on %s without storing either draft',async(reason)=>{
 vi.useFakeTimers();const parent=new AbortController();let signal!:AbortSignal;
 const rpc=m.rpc.getMockImplementation()!;m.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='planner_horizon_context'?Promise.resolve({data:context,error:null}):rpc(name,args));
 const event={...output().events[0],date:'2030-01-01'};
 m.generate.mockResolvedValueOnce({output:datedOutput({...output(),events:[event,event]},horizon)}).mockImplementationOnce((options:{abortSignal:AbortSignal})=>{signal=options.abortSignal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));});
 const response=POST(new Request(horizonRequest(),{signal:parent.signal}));await vi.advanceTimersByTimeAsync(0);
 if(reason==='deadline')await vi.advanceTimersByTimeAsync(285000);else parent.abort();
 expect((await response).status).toBe(reason==='deadline'?502:499);expect(signal.aborted).toBe(true);
 if(reason==='deadline')expect(m.logError).toHaveBeenCalledWith('[mobile-planning] Request failed',undefined,expect.objectContaining({attempt:2,previousFailure:{name:'Error',reason:'overlap'}}));
 expect(m.generate).toHaveBeenCalledTimes(2);expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);expect(vi.getTimerCount()).toBe(0);
});
it('distinguishes provider failure without logging private error messages',async()=>{
 m.generate.mockRejectedValueOnce(new Error('PRIVATE prompt and output'));
 const response=await POST(request());expect(response.status).toBe(502);
 expect(m.logError).toHaveBeenCalledWith('[mobile-planning] Request failed',undefined,expect.objectContaining({stage:'generation',reason:'unknown',attempt:1,failure:{name:'Error'}}));
 expect(m.logError.mock.calls[0][2]).not.toHaveProperty('previousFailure');
 expect(JSON.stringify(m.logError.mock.calls)).not.toContain('PRIVATE');expect(await response.json()).toEqual({error:'unavailable'});
});
it.each([null,{version:eventId,status:'drafted'}])('refuses a foreign or stale saved planning session',async(session)=>{
 m.from.mockImplementation((table:string)=>{const q={select:()=>q,eq:vi.fn(()=>q),maybeSingle:async()=>({error:null,data:table==='planning_sessions'?session:null})};return q;});
 const req=request({date:undefined,timezone:undefined,commitments:undefined,needs:undefined,goals:undefined,travelMinutes:undefined,sessionId:owner,sessionVersion:owner});
 expect((await POST(req)).status).toBe(409);expect(m.generate).not.toHaveBeenCalled();
});
it.each([15,null])('uses saved session facts and confirmed travel %s without inventing a duration',async(travelMinutes)=>{
 const session={version:owner,status:'drafted',start_date:horizon.startDate,end_date:horizon.endDate,timezone:'UTC',facts:{workBoundaries:'Family after 15:00'},readiness:{workBoundaries:'known'},assumptions:['Calls remain tasks'],travel_minutes:travelMinutes};
 const filters:unknown[][]=[];
 m.from.mockImplementation((table:string)=>{const q={select:()=>q,eq:(...args:unknown[])=>{if(table==='planning_sessions')filters.push(args);return q;},maybeSingle:async()=>({error:null,data:table==='planning_sessions'?session:null})};return q;});
 m.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>({error:null,data:name==='planner_horizon_context'?{...context,coverageComplete:true}:name==='check_ai_chat_rate_limit'?[{allowed:true,minute_remaining:9,day_remaining:99}]:{status:'complete',proposal:{body:args.p_body}}}));
 m.generate.mockResolvedValue({output:datedOutput({...output(),events:[{...output().events[0],date:'2030-01-01',endTime:'12:15',category:'travel'}]},horizon)});
 const response=await POST(request({date:undefined,timezone:undefined,commitments:undefined,needs:undefined,goals:undefined,travelMinutes:undefined,sessionId:eventId,sessionVersion:owner}));
 expect(response.status).toBe(200);const body=(await response.json()).proposal.body;expect(body.planningSession).toEqual({id:eventId,version:owner});expect(filters).toContainEqual(['user_id',owner]);
 expect(body.events).toHaveLength(travelMinutes===null?0:1);expect(body.questions).toHaveLength(travelMinutes===null?1:0);
 expect(m.generate.mock.calls[0][0].messages[0].content).toContain('Family after 15:00');
});

