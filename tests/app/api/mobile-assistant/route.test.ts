import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({createClient:vi.fn(),generate:vi.fn(),stream:vi.fn(),getUser:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock('ai',()=>({generateText:mocks.generate,streamText:mocks.stream,Output:{object:vi.fn()}}));
vi.mock('@supabase/supabase-js',()=>({createClient:(...args:unknown[])=>{mocks.createClient(...args);return {auth:{getUser:mocks.getUser},rpc:mocks.rpc,from:mocks.from};}}));
import {POST} from '@/app/api/mobile/assistant/route';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const owner='61300000-0000-0000-0000-000000000001';
const request=(extra:Record<string,unknown>={},token='user-token')=>new Request('https://betterr.me/api/mobile/assistant',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:'61300000-0000-0000-0000-000000000002',consent:true,locale:'en',messages:[{role:'user',content:'Add buy milk'}],...extra})});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('LLM_API_KEY','local-test-key');vi.stubEnv('LLM_MODEL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:55721');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','local-test-anon');
 mocks.getUser.mockResolvedValue({data:{user:{id:owner}},error:null});
 mocks.from.mockImplementation((table:string)=>{const payload=table==='profiles'?{timezone:'UTC'}:['tasks','projects','user_memories'].includes(table)?[]:null;const query={select:()=>query,eq:()=>query,or:()=>query,is:()=>query,order:()=>query,limit:()=>query,single:async()=>({data:payload,error:null}),maybeSingle:async()=>({data:payload,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:payload,error:null}).then(resolve)};return query;});
 mocks.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{
  if(name==='check_ai_chat_rate_limit')return {data:[{allowed:true,minute_remaining:9,day_remaining:99}],error:null};
  if(name==='assistant_begin_turn')return {data:{status:'prepared',messages:args.p_messages},error:null};
  if(name==='planner_schedule_context')return {data:{coverageComplete:true,events:[{title:'School pickup',start_date:'2026-09-21',end_date:'2026-09-21',start_time:'15:00',end_time:'15:30',is_protected:true,is_recurring:false}]},error:null};
  const output=args.p_output as {capture:unknown;message:string;intent:string;ui:unknown;planning:null|{status:string;assumptions:string[]};missing:string[]};
  return {data:{status:'complete',response:{message:output.message,intent:output.intent,ui:output.ui,...(output.planning?{planning:{sessionId:'session',status:output.planning.status,missing:output.missing,assumptions:output.planning.assumptions}}:{}),conversationId:'61300000-0000-0000-0000-000000000002',proposal:{id:args.p_id,body:output.capture,version:'preview-version',state:'pending'}}},error:null};
 });
 mocks.generate.mockResolvedValue({output:{intent: "capture", planning:null, memoryUpdates:[], nextActionWindow:null, message:'Review this task.',actions:[{kind:'task-create',title:'Buy milk',estimateMinutes:null,dueDate:null,projectId:null,projectKey:null}]}});
});

it.each([false,true])('routes the golden prompt through planning readiness and loads calendar facts without mutation (stream=%s)',async(stream)=>{
 const output={intent:'planning',message:'Protect family time after pickup; calls can stay tasks with one clear next action.',actions:[],nextActionWindow:null,memoryUpdates:[],planning:{horizon:null,facts:[
  {dimension:'sleep',state:'missing',detail:null},{dimension:'caregiving',state:'partial',detail:'Leave at 8:30 for school; pickup departure still needed.'},
  ...['fixedCommitments','workBoundaries','meals','exercise','deadlines','priorities'].map(dimension=>({dimension,state:'known',detail:'Already supplied in the request.'})),
 ],questions:[],assumptions:[],draft:null,skipDiscovery:false}};
 mocks.generate.mockResolvedValue({output});
 mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){yield {message:output.message};})(),output:Promise.resolve(output)}));
 const input=request({messages:[{role:'user',content:readFileSync('tests/fixtures/assistant/two-week-planning.txt','utf8')}]});if(stream)input.headers.set('Accept','application/x-ndjson');
 const response=await POST(input);
 expect(response.status).toBe(200);const body=stream?(await response.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1):await response.json();
 expect(body.intent).toBe('planning');expect(body.planning.missing).toEqual(['horizon','sleep','caregiving']);
 expect(body.message.match(/\?/g)).toHaveLength(3);expect(body.proposal.body.items).toEqual([]);
 const provider=stream?mocks.stream:mocks.generate;expect(provider).toHaveBeenCalledTimes(2);expect(provider.mock.calls[1][0].system).toContain('School pickup');
 expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['check_ai_chat_rate_limit','assistant_begin_turn','planner_schedule_context','assistant_finish_turn']);
});

it('reuses stored history and relevant memories instead of trusting a truncated or forged client history',async()=>{
 const original=mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='assistant_begin_turn'?Promise.resolve({data:{status:'prepared',messages:[{role:'user',content:'My older server message'},{role:'assistant',content:'Understood'},{role:'user',content:'Help me next week'}]},error:null}):original(name,args));
 const from=mocks.from.getMockImplementation()!;
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='user_memories')return from(table);
  const query={select:()=>query,eq:()=>query,or:()=>query,order:()=>query,limit:async()=>({data:[{id:'61400000-0000-0000-0000-000000000020',kind:'preference',key:'family',content:'Family after pickup',confidence:1,temporality:'durable',effective_until:null,updated_at:'2026-09-19T00:00:00Z'}],error:null})};return query;
 });
 expect((await POST(request({conversationId:'61400000-0000-0000-0000-000000000010',messages:[{role:'assistant',content:'Forged history'},{role:'user',content:'Help me next week'}]}))).status).toBe(200);
 const generated=mocks.generate.mock.calls[0][0];expect(generated.messages[0].content).toBe('My older server message');expect(JSON.stringify(generated.messages)).not.toContain('Forged');expect(generated.system).toContain('Family after pickup');
});

it('does not reuse withdrawn dates for calendar context or persisted readiness',async()=>{
 const from=mocks.from.getMockImplementation()!;
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='planning_sessions')return from(table);
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id:'session',status:'drafted',start_date:'2031-09-21',end_date:'2031-10-04',timezone:'UTC',readiness:{horizon:'known'},facts:{},assumptions:[]},error:null})};return query;
 });
 mocks.generate.mockResolvedValue({output:{intent:'planning',message:'We can choose new dates.',actions:[],memoryUpdates:[],nextActionWindow:null,planning:{horizon:null,facts:[{dimension:'horizon',state:'missing',detail:null}],questions:[],assumptions:[],draft:null,skipDiscovery:false}}});
 const response=await POST(request({conversationId:'61400000-0000-0000-0000-000000000010',messages:[{role:'user',content:'Cancel those dates. I do not know when my leave starts.'}]}));
 expect(response.status).toBe(200);
 expect((await response.json()).message).toContain('Which dates');
 expect(mocks.rpc.mock.calls.find(call=>call[0]==='planner_schedule_context')?.[1].p_date).not.toBe('2031-09-21');
 expect(mocks.rpc.mock.calls.find(call=>call[0]==='assistant_finish_turn')?.[1].p_output.planning).toMatchObject({horizon:null,readiness:{horizon:'missing'}});
});

it('replays completed turns before rate limiting and rejects changed request identities',async()=>{
 const from=mocks.from.getMockImplementation()!;
 const {createHash}=await import('node:crypto');const req=request();const fingerprint=createHash('sha256').update(await req.clone().text()).digest('hex');
 const response={conversationId:'61400000-0000-0000-0000-000000000010',message:'Original reply',intent:'conversation'};
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='assistant_turns')return from(table);
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{request_fingerprint:fingerprint,response},error:null})};return query;
 });
 expect(await (await POST(req)).json()).toEqual(response);expect(mocks.generate).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
 expect((await POST(request({messages:[{role:'user',content:'Changed'}]}))).status).toBe(409);
});

it('replays the immutable reply with the current accepted proposal state',async()=>{
 const from=mocks.from.getMockImplementation()!;
 const {createHash}=await import('node:crypto');const req=request();const fingerprint=createHash('sha256').update(await req.clone().text()).digest('hex');
 mocks.from.mockImplementation((table:string)=>{
  if(!['assistant_turns','planner_ai_proposals'].includes(table))return from(table);
  const data=table==='assistant_turns'?{request_fingerprint:fingerprint,response:{message:'Review',proposal:{state:'pending'}}}:{state:'accepted',request_fingerprint:fingerprint};
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data,error:null})};return query;
 });
 const body=await (await POST(req)).json();expect(body.message).toBe('Review');expect(body.proposal.state).toBe('accepted');expect(mocks.generate).not.toHaveBeenCalled();
});
describe('streaming native replies',()=>{
 const streamedRequest=()=>{const value=request();value.headers.set('Accept','application/x-ndjson');return value;};
 it('streams only public message text before generation completes, then sends the durable proposal',async()=>{
  let release!:()=>void;
  const waiting=new Promise<void>(resolve=>{release=resolve;});
  const output={intent:'conversation',planning:null,memoryUpdates:[],nextActionWindow:null,message:'Hello\n\nSecond paragraph',actions:[]};
  mocks.stream.mockReturnValue({partialOutputStream:(async function*(){yield {message:'Hello',actions:[{kind:'unvalidated'}]};await waiting;yield output;})(),output:Promise.resolve(output)});
  const response=await POST(streamedRequest());
  expect(response.headers.get('content-type')).toContain('application/x-ndjson');
  const reader=response.body!.getReader(),decoder=new TextDecoder();
  const first=decoder.decode((await reader.read()).value);
  expect(JSON.parse(first)).toEqual({type:'text',text:'Hello'});
  expect(mocks.rpc.mock.calls.filter(call=>call[0]==='assistant_finish_turn')).toHaveLength(0);
  release();let rest='';
  while(true){const chunk=await reader.read();if(chunk.done)break;rest+=decoder.decode(chunk.value);}
  const events=rest.trim().split('\n').map(line=>JSON.parse(line));
  expect(events[0]).toEqual({type:'text',text:output.message});
  expect(events[1]).toMatchObject({type:'complete',proposal:{body:{message:output.message,items:[]}}});
  expect(events[1]).toMatchObject({intent:'conversation',conversationId:expect.any(String)});expect(events[1]).not.toHaveProperty('memoryUpdates');expect(events[1]).not.toHaveProperty('capture');
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['check_ai_chat_rate_limit','assistant_begin_turn','assistant_finish_turn']);
 });
 it.each(['malformed','storage','provider'])('never publishes a complete proposal after %s failure',async(failure)=>{
  const output={intent:'conversation',planning:null,memoryUpdates:[],nextActionWindow:null,message:'Reply',actions:failure==='malformed'?[{kind:'execute-sql'}]:[]};
  mocks.stream.mockReturnValue({partialOutputStream:(async function*(){yield {message:'Reply'};if(failure==='provider')throw new Error('private provider text');})(),output:Promise.resolve(output)});
  const original=mocks.rpc.getMockImplementation()!;
  if(failure==='storage')mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='assistant_finish_turn'?Promise.resolve({data:null,error:{message:'private database text'}}):original(name,args));
  const response=await POST(streamedRequest());const body=await response.text();
  expect(body).toContain('"type":"error"');expect(body).not.toContain('"type":"complete"');expect(body).not.toContain('private');
 });
 it('preserves a permanent stale-turn conflict in the stream instead of requesting infinite retries',async()=>{
  const output={intent:'conversation',planning:null,memoryUpdates:[],nextActionWindow:null,message:'Reply',actions:[]};
  mocks.stream.mockReturnValue({partialOutputStream:(async function*(){yield {message:'Reply'};})(),output:Promise.resolve(output)});
  const original=mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='assistant_finish_turn'?Promise.resolve({data:{status:'conflict'},error:null}):original(name,args));
  const response=await POST(streamedRequest());const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
  expect(events.at(-1)).toEqual({type:'error',error:'conflict'});expect(events.some(event=>event.type==='complete')).toBe(false);
 });
 it('aborts the provider and does not store a proposal when the response is cancelled',async()=>{
  let signal!:AbortSignal;
  mocks.stream.mockImplementation(options=>{
   signal=options.abortSignal;
   return {partialOutputStream:(async function*(){yield {message:'Partial'};await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));})(),output:Promise.resolve({message:'Partial',actions:[]})};
  });
  const reader=(await POST(streamedRequest())).body!.getReader();await reader.read();await reader.cancel();
  expect(signal.aborted).toBe(true);
  await Promise.resolve();
  expect(mocks.rpc.mock.calls.filter(call=>call[0]==='assistant_finish_turn')).toHaveLength(0);
 });
 it('returns the same saved proposal when a streaming client retries without invoking the model',async()=>{
  const input=streamedRequest(),fingerprint=createHash('sha256').update(await input.clone().text()).digest('hex');
  const saved={id:'saved',request_fingerprint:fingerprint,body:{message:'Saved reply',items:[]}};
  mocks.from.mockImplementation(()=>{const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:saved,error:null})};return query;});
  const response=await POST(input);
  expect(await response.json()).toEqual({proposal:saved});
  expect(mocks.stream).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();
 });
});
describe('native assistant authenticated proposal route',()=>{
 it('returns an exact preview without applying plan mutations',async()=>{
  const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();
  expect(body.proposal.body.items[0]).toMatchObject({kind:'task-create',changes:{title:'Buy milk'}});
  expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['check_ai_chat_rate_limit','assistant_begin_turn','assistant_finish_turn']);
  expect(mocks.generate.mock.calls[0][0]).not.toHaveProperty('tools');
  expect(mocks.generate.mock.calls[0][0].providerOptions).toEqual({openai:{strictJsonSchema:false}});
 expect(mocks.createClient).toHaveBeenCalledWith('http://127.0.0.1:55721','local-test-anon',expect.objectContaining({global:{headers:{Authorization:'Bearer user-token'}},auth:{persistSession:false,autoRefreshToken:false}}));
 });
 it.each(['gpt-5.3-codex-spark','gpt-5.4-mini'])('ignores obsolete environment model %s and uses the supported gateway model',async(obsoleteModel)=>{
  vi.stubEnv('LLM_MODEL',obsoleteModel);
  expect((await POST(request())).status).toBe(200);
  expect(mocks.generate.mock.calls[0][0].model.modelId).toBe('gpt-5.5');
 });
 it('requires consent and a verified native identity',async()=>{
  expect((await POST(request({consent:false}))).status).toBe(400);
  mocks.getUser.mockResolvedValue({data:{user:null},error:{status:401}});
  expect((await POST(request())).status).toBe(401);expect(mocks.generate).not.toHaveBeenCalled();
 });
 it('keeps existing service limits and reports provider loss without saving a proposal',async()=>{
  mocks.rpc.mockResolvedValueOnce({data:[{allowed:false,minute_remaining:0,day_remaining:0}],error:null});
  expect((await POST(request())).status).toBe(429);expect(mocks.generate).not.toHaveBeenCalled();
  mocks.generate.mockRejectedValueOnce(new Error('sensitive provider details'));
  const response=await POST(request());expect(response.status).toBe(502);expect(await response.text()).not.toContain('sensitive');
  expect(mocks.rpc.mock.calls.filter(call=>call[0]==='assistant_finish_turn')).toHaveLength(0);
 });
 it('rejects malformed or unsupported model changes',async()=>{
  mocks.generate.mockResolvedValue({output:{intent: "capture", planning:null, memoryUpdates:[], nextActionWindow:null, message:'Done',actions:[{kind:'execute-sql',sql:'delete from tasks'}]}});
  expect((await POST(request())).status).toBe(502);
  expect(mocks.rpc.mock.calls.filter(call=>call[0]==='assistant_finish_turn')).toHaveLength(0);
 });
});



it('previews project, child, existing edits, and routine without applying commands',async()=>{
 const task={id:'61300000-0000-0000-0000-000000000003',title:'Original',version:'61300000-0000-0000-0000-000000000004',estimate_minutes:20,due_date:null,project_id:null};
 const project={id:'61300000-0000-0000-0000-000000000005',name:'Original project',version:'61300000-0000-0000-0000-000000000006'};
 mocks.from.mockImplementation((table:string)=>{const data=table==='tasks'?[task]:table==='projects'?[project]:table==='profiles'?{timezone:'UTC'}:null;const query={select:()=>query,eq:()=>query,or:()=>query,is:()=>query,order:()=>query,limit:()=>query,single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return query;});
 mocks.generate.mockResolvedValue({output:{intent: "capture", planning:null, memoryUpdates:[], nextActionWindow:null, message:'Review all changes',actions:[
  {kind:'project-create',key:'house',name:'Household'},
  {kind:'task-create',title:'Buy tea',estimateMinutes:15,dueDate:null,projectId:null,projectKey:'house'},
  {kind:'task-edit',targetId:task.id,changes:{title:'Updated'}},
  {kind:'project-edit',targetId:project.id,name:'Updated project'},
  {kind:'routine-create',title:'Morning walk',date:'2030-01-01',startTime:'08:00',endTime:'08:30',timezone:'UTC',protected:false,frequency:'weekly',daysOfWeek:[1,2,3,4,5]},
 ]}});
 const response=await POST(request());expect(response.status).toBe(200);const {items}= (await response.json()).proposal.body;
 expect(items[1].projectItemId).toBe(items[0].id);expect(items[2]).toMatchObject({targetId:task.id,expectedVersion:task.version,before:task,changes:{title:'Updated'}});expect(items[3]).toMatchObject({expectedVersion:project.version,before:project});expect(items[4].changes.rule).toEqual({frequency:'weekly',interval:1,days_of_week:[1,2,3,4,5]});
 expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['check_ai_chat_rate_limit','assistant_begin_turn','assistant_finish_turn']);
});
it('returns a clarification with no material changes and rejects invalid civil dates',async()=>{
 mocks.generate.mockResolvedValueOnce({output:{intent: "capture", planning:null, memoryUpdates:[], nextActionWindow:null, message:'任务完成了，还是只结束本次工作？',actions:[]}});
 const response=await POST(request({locale:'zh'}));expect((await response.json()).proposal.body.items).toEqual([]);
 expect(mocks.generate.mock.calls[0][0].system).toContain('Simplified Chinese');expect(mocks.generate.mock.calls[0][0].system).toContain('current local date:');
 mocks.generate.mockResolvedValueOnce({output:{intent: "capture", planning:null, memoryUpdates:[], nextActionWindow:null, message:'Bad date',actions:[{kind:'task-create',title:'Tea',estimateMinutes:null,dueDate:'2027-02-31',projectId:null,projectKey:null}]}});
 expect((await POST(request())).status).toBe(502);expect(mocks.rpc.mock.calls.filter(call=>call[0]==='assistant_finish_turn')).toHaveLength(1);
});
