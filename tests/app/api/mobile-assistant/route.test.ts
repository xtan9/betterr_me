import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({createClient:vi.fn(),generate:vi.fn(),stream:vi.fn(),getUser:vi.fn(),rpc:vi.fn(),from:vi.fn(),nextAction:vi.fn(),logError:vi.fn()}));
vi.mock('@/lib/ai/next-action',()=>({nextActionFacts:mocks.nextAction}));
vi.mock('@/lib/logger',()=>({log:{error:mocks.logError}}));
vi.mock('ai',()=>({generateText:mocks.generate,streamText:mocks.stream,Output:{object:vi.fn(({schema})=>({schema}))}}));
vi.mock('@supabase/supabase-js',()=>({createClient:(...args:unknown[])=>{mocks.createClient(...args);return {auth:{getUser:mocks.getUser},rpc:mocks.rpc,from:mocks.from};}}));
import {POST} from '@/app/api/mobile/assistant/route';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assistantOutput,emptyTaskChoices} from '@/lib/ai/assistant-orchestrator';
const owner='61300000-0000-0000-0000-000000000001';
const request=(extra:Record<string,unknown>={},token='user-token')=>new Request('https://betterr.me/api/mobile/assistant',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:'61300000-0000-0000-0000-000000000002',consent:true,locale:'en',messages:[{role:'user',content:'Add buy milk'}],...extra})});
beforeEach(()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
 mocks.generate.mockReset();mocks.stream.mockReset();
 vi.clearAllMocks();vi.stubEnv('LLM_API_KEY','local-test-key');vi.stubEnv('LLM_MODEL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:55721');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','local-test-anon');
 mocks.getUser.mockResolvedValue({data:{user:{id:owner}},error:null});
 mocks.from.mockImplementation((table:string)=>{const payload=table==='profiles'?{timezone:'UTC'}:['tasks','projects','user_memories'].includes(table)?[]:null;const query={select:()=>query,eq:()=>query,or:()=>query,is:()=>query,not:()=>query,order:()=>query,limit:()=>query,single:async()=>({data:payload,error:null}),maybeSingle:async()=>({data:payload,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:payload,error:null}).then(resolve)};return query;});
 mocks.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{
  if(name==='check_ai_chat_rate_limit')return {data:[{allowed:true,minute_remaining:9,day_remaining:99}],error:null};
  if(name==='assistant_begin_turn')return {data:{status:'prepared',messages:args.p_messages},error:null};
  if(name==='planner_schedule_context')return {data:{coverageComplete:true,events:[{title:'School pickup',start_date:'2026-09-21',end_date:'2026-09-21',start_time:'15:00',end_time:'15:30',is_protected:true,is_recurring:false}]},error:null};
  const output=args.p_output as {capture:unknown;message:string;intent:string;ui:unknown;planning:null|{status:string;assumptions:string[]};missing:string[]};
  return {data:{status:'complete',response:{message:output.message,intent:output.intent,ui:output.ui,...(output.planning?{planning:{sessionId:'session',status:output.planning.status,missing:output.missing,assumptions:output.planning.assumptions}}:{}),conversationId:'61300000-0000-0000-0000-000000000002',proposal:{id:args.p_id,body:output.capture,version:'preview-version',state:'pending'}}},error:null};
 });
 mocks.generate.mockResolvedValue({output:{intent: "capture", planning:null, memoryUpdates:[], nextActionWindow:null, message:'Review this task.',actions:[{kind:'task-create',title:'Buy milk',estimateMinutes:null,dueDate:null,projectId:null,projectKey:null}]}});
});
afterEach(()=>vi.useRealTimers());

it('retains exact prior proposal details when the user revises a preview',async()=>{
 const original=mocks.from.getMockImplementation()!;
 const items=[{id:'a',kind:'task-create',changes:{title:'Tea',due_date:'2026-09-25',estimate_minutes:20}},{id:'b',kind:'task-create',changes:{title:'Books',due_date:null,estimate_minutes:10}}];
 const filters:unknown[][]=[];
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='assistant_turns')return original(table);
  let prior=false;
  const query={select:()=>query,eq:(...args:unknown[])=>{filters.push(args);if(args[0]==='conversation_id')prior=true;return query;},not:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:prior?{response:{intent:'capture',proposal:{body:{items}}}}:null,error:null})};return query;
 });
 const conversationId='61300000-0000-0000-0000-000000000005';
 expect((await POST(request({conversationId,messages:[{role:'user',content:'Change only Tea to Coffee; keep the other details.'}]}))).status).toBe(200);
 expect(mocks.generate.mock.calls[0][0].system).toContain(JSON.stringify(items));
 expect(filters).toContainEqual(['user_id',owner]);expect(filters).toContainEqual(['conversation_id',conversationId]);
});

it.each(Object.values(emptyTaskChoices).flat())('keeps the empty-queue choice $id in ordinary conversation: $value',async choice=>{
 const output={intent:'conversation',followUp:null,message:'Okay.',actions:[],planning:null,memoryUpdates:[],nextActionWindow:null};
 mocks.generate.mockResolvedValue({output});
 const body=await (await POST(request({messages:[{role:'user',content:choice.value}]}))).json();
 expect(body.ui.quickReplies).toEqual([]);expect(body.proposal.body.items).toEqual([]);expect(mocks.nextAction).not.toHaveBeenCalled();
 const schema=mocks.generate.mock.calls[0][0].output.schema;
 expect(schema.safeParse({...output,intent:'next_action'}).success).toBe(false);
 expect(schema.safeParse({...output,followUp:'review_today'}).success).toBe(false);
});

it.each([false,true])('cancels only the current versioned draft without emitting a new preview (stream=%s)',async stream=>{
 const original=mocks.from.getMockImplementation()!;
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='planning_sessions')return original(table);
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id:'draft-id',version:'draft-version',status:'drafted',readiness:{},facts:{},assumptions:[]},error:null})};return query;
 });
 const output={intent:'conversation',replyLocale:'zh',cancelPlanning:true,message:'好的，已取消这个草稿。',actions:[],planning:null,memoryUpdates:[],nextActionWindow:null};
 mocks.generate.mockResolvedValue({output});mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){yield output;})(),output:Promise.resolve(output)}));
 const req=request({messages:[{role:'user',content:'这个计划取消，不用再安排。'}]});if(stream)req.headers.set('Accept','application/x-ndjson');
 const response=await POST(req);expect(response.status).toBe(200);
 const body=stream?(await response.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1):await response.json();
 expect(body.message).toBe(output.message);expect(body.ui.quickReplies).toEqual([]);
 expect(mocks.rpc.mock.calls.find(([name])=>name==='assistant_finish_turn')?.[1].p_output).toMatchObject({cancelPlanning:{sessionId:'draft-id',version:'draft-version'},planning:null,capture:{items:[]}});
 expect(mocks.rpc.mock.calls.some(([name])=>name==='planner_schedule_context')).toBe(false);
});

it.each(['en','zh'])('offers two ordinary conversation exits when no task fits (%s)',async locale=>{
 mocks.generate.mockResolvedValue({output:{intent:'next_action',replyLocale:locale,message:'Choose.',actions:[],planning:null,memoryUpdates:[],nextActionWindow:{start:'2026-09-21T12:00:00Z',end:'2026-09-21T12:15:00Z',available:true}}});
 mocks.nextAction.mockResolvedValue({selected:null});
 const body=await (await POST(request({locale}))).json();
 expect(body.ui.quickReplies.map((choice:{label:string})=>choice.label)).toEqual(locale==='zh'?['给我一个小动作','先休息']:['Give me a small action','Rest for now']);
 expect(body.proposal.body.items).toEqual([]);
});

it.each(['applied','cancelled',null])('does not cancel a session that is %s',async status=>{
 const original=mocks.from.getMockImplementation()!;
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='planning_sessions')return original(table);
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:status?{id:'session',version:'v',status}:null,error:null})};return query;
 });
 mocks.generate.mockResolvedValue({output:{intent:'conversation',cancelPlanning:true,message:'Cancelled.',planning:null,actions:[],memoryUpdates:[],nextActionWindow:null}});
 expect((await POST(request())).status).toBe(502);
 expect(mocks.rpc.mock.calls.some(([name])=>name==='assistant_finish_turn')).toBe(false);
});

it('withholds cancellation acknowledgement when the atomic turn conflicts',async()=>{
 const originalFrom=mocks.from.getMockImplementation()!,originalRpc=mocks.rpc.getMockImplementation()!;
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='planning_sessions')return originalFrom(table);
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{id:'draft',version:'v',status:'drafted',facts:{},readiness:{},assumptions:[]},error:null})};return query;
 });
 mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='assistant_finish_turn'?Promise.resolve({data:{status:'conflict'},error:null}):originalRpc(name,args));
 const output={intent:'conversation',cancelPlanning:true,message:'Cancelled.',planning:null,actions:[],memoryUpdates:[],nextActionWindow:null};
 mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){yield {intent:'conversation',message:'Cancelled.'};yield output;})(),output:Promise.resolve(output)}));
 const input=request();input.headers.set('Accept','application/x-ndjson');
 const events=(await (await POST(input)).text()).trim().split('\n').map(line=>JSON.parse(line));
 expect(events.some(event=>event.type==='text')).toBe(false);
 expect(events.at(-1)).toMatchObject({type:'error',error:'conflict'});
});

it.each([false,true])('offers a day review as text choices after an acknowledged decision without starting a plan (stream=%s)',async stream=>{
 const history=[{role:'user',content:'虚构测试，不要保存记忆。今天不舒服。'},{role:'assistant',content:'先照顾好自己。'},{role:'user',content:'OK 我要去看 urgent care'}];
 const output={intent:'conversation',replyLocale:'zh',message:'好，先去看医生。需要我帮你看看今天哪些安排可以调整吗？',followUp:'review_today',actions:[],planning:null,memoryUpdates:[],nextActionWindow:null};
 mocks.generate.mockResolvedValue({output});mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){yield output;})(),output:Promise.resolve(output)}));
 const req=request({messages:history});if(stream)req.headers.set('Accept','application/x-ndjson');
 const response=await POST(req);const body=stream?(await response.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1):await response.json();
 expect(body.message).toBe(output.message);expect(body.intent).toBe('conversation');
 expect(body.ui.quickReplies).toEqual([{id:'review-today',label:'看看今天的安排',value:'请看看今天的安排，建议哪些可以调整；先给我建议，不要修改任务或日历。'},{id:'decline-review',label:'暂时不用',value:'暂时不用调整今天的安排。'}]);
 expect(body.planning).toBeUndefined();expect(body.proposal.body.items).toEqual([]);
 expect(mocks.rpc.mock.calls.some(([name])=>name==='planner_schedule_context')).toBe(false);
 expect(mocks.nextAction).not.toHaveBeenCalled();
});

it.each(['暂时不用调整今天的安排。','No need to adjust today’s schedule for now.'])('declining the review cannot reopen an offer or start planning: %s',async latest=>{
 const output={intent:'conversation',replyLocale:'zh',message:'好，需要时再叫我。',followUp:null,actions:[],planning:null,memoryUpdates:[],nextActionWindow:null};
 mocks.generate.mockResolvedValue({output});
 const body=await (await POST(request({messages:[{role:'assistant',content:'需要我帮你看看今天的安排吗？'},{role:'user',content:latest}]}))).json();
 expect(body.message).toBe('好，需要时再叫我。');expect(body.ui.quickReplies).toEqual([]);expect(body.planning).toBeUndefined();
 const schema=mocks.generate.mock.calls[0][0].output.schema;
 expect(schema.safeParse({...output,followUp:'review_today'}).success).toBe(false);
 expect(schema.safeParse({...output,intent:'planning'}).success).toBe(false);
});

it('localizes a decision offer using the reply language rather than the interface language',async()=>{
 mocks.generate.mockResolvedValue({output:{intent:'conversation',replyLocale:'en',message:'Take care. Would you like to review today’s schedule?',followUp:'review_today',actions:[],planning:null,memoryUpdates:[],nextActionWindow:null}});
 const body=await (await POST(request({locale:'zh',messages:[{role:'user',content:'OK, I am going to urgent care.'}]}))).json();
 expect(body.ui.quickReplies.map((choice:{label:string})=>choice.label)).toEqual(['Review today','Not now']);
 expect(body.planning).toBeUndefined();expect(body.proposal.body.items).toEqual([]);
});

it('review choice reads existing commitments and returns suggestions without authorizing mutations',async()=>{
 const output={intent:'planning',replyLocale:'zh',message:'看看今天的安排。',followUp:null,actions:[],memoryUpdates:[],nextActionWindow:null,planning:{horizon:{startDate:'2026-09-21',endDate:'2026-09-21',timezone:'UTC'},facts:[],questions:[],assumptions:[],draft:'保留接送，其他安排等你回来再决定。',skipDiscovery:true}};
 mocks.generate.mockResolvedValue({output});
 const body=await (await POST(request({messages:[{role:'user',content:'请看看今天的安排，建议哪些可以调整；先给我建议，不要修改任务或日历。'}]}))).json();
 expect(body.planning.status).toBe('drafted');expect(body.proposal.body.items).toEqual([]);expect(body.ui.quickReplies).toEqual([]);
 expect(mocks.rpc.mock.calls.map(([name])=>name)).toEqual(['check_ai_chat_rate_limit','assistant_begin_turn','planner_schedule_context','assistant_finish_turn']);
 const finalOptions=mocks.generate.mock.calls.at(-1)![0];expect(finalOptions.system).toContain('School pickup');
});

it('explicit preparation questions and ordinary legacy replies do not get a forced day-review offer',async()=>{
 mocks.generate.mockResolvedValue({output:{intent:'conversation',message:'Bring your ID and insurance card if you have one.',actions:[],planning:null,memoryUpdates:[],nextActionWindow:null}});
 const body=await (await POST(request({messages:[{role:'user',content:'What documents should I bring?'}]}))).json();
 expect(body.ui.quickReplies).toEqual([]);expect(body.planning).toBeUndefined();expect(body.proposal.body.items).toEqual([]);
});

it.each(['capture','planning','next_action'])('rejects an inconsistent day-review offer with %s intent',async intent=>{
 mocks.generate.mockResolvedValue({output:{intent,replyLocale:'en',message:'Review today?',followUp:'review_today',actions:[],planning:null,memoryUpdates:[],nextActionWindow:null}});
 expect((await POST(request())).status).toBe(502);
 expect(mocks.rpc.mock.calls.some(([name])=>name==='assistant_finish_turn')).toBe(false);
});

it.each([false,true])('continues saved advice in the explicitly requested language after an English quick suggestion (stream=%s)',async stream=>{
 const history=[{role:'user',content:'请用中文回答：我今天很累，帮我选一个小步骤。'},{role:'assistant',content:'先打开手头那件事，看一眼就可以停。'},{role:'user',content:'What should I do next?'}];
 const originalRpc=mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='assistant_begin_turn'?Promise.resolve({data:{status:'prepared',messages:history},error:null}):originalRpc(name,args));
 const originalFrom=mocks.from.getMockImplementation()!;
 const ownership:unknown[][]=[];
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='assistant_turns')return originalFrom(table);
  let prior=false;
  const query={select:()=>query,eq:(...args:unknown[])=>{if(args[0]==='conversation_id')prior=true;ownership.push(args);return query;},not:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:prior?{response:{intent:'conversation'}}:null,error:null})};
  return query;
 });
 const output={intent:'conversation',replyLocale:'zh',message:'只写下一句下一步要做什么，然后停下来休息。',actions:[],planning:null,memoryUpdates:[],nextActionWindow:null};
 mocks.generate.mockResolvedValue({output});mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){yield output;})(),output:Promise.resolve(output)}));
 const conversationId='61300000-0000-0000-0000-000000000005';
 const req=request({conversationId,messages:[{role:'user',content:'What should I do next?'}]});if(stream)req.headers.set('Accept','application/x-ndjson');
 const response=await POST(req);const body=stream?(await response.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1):await response.json();
 expect(body.message).toBe(output.message);expect(body.intent).toBe('conversation');expect(body.ui.quickReplies).toEqual([]);expect(body.proposal.body.items).toEqual([]);
 expect(mocks.nextAction).not.toHaveBeenCalled();
 expect(ownership).toContainEqual(['user_id',owner]);expect(ownership).toContainEqual(['conversation_id',conversationId]);
 const options=(stream?mocks.stream:mocks.generate).mock.calls[0][0];
 expect(options.messages).toEqual(history);
 // Even a provider misclassification cannot turn this continuation into task selection.
 expect(options.output.schema.safeParse({...output,intent:'next_action',replyLocale:'zh'}).success).toBe(false);
 expect(options.output.schema.safeParse({...output,replyLocale:'en'}).success).toBe(false);
 expect(options.system).toContain('Reply in Simplified Chinese');
});

it.each([
 {priorIntent:'planning',latest:'What should I do next?'},
 {priorIntent:'next_action',latest:'What should I do next?'},
 {priorIntent:'conversation',latest:'Pick a task from my queue.'},
])('preserves task-selection availability after $priorIntent: $latest',async({priorIntent,latest})=>{
 const originalFrom=mocks.from.getMockImplementation()!;
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='assistant_turns')return originalFrom(table);
  let prior=false;
  const query={select:()=>query,eq:(field:string)=>{if(field==='conversation_id')prior=true;return query;},not:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:prior?{response:{intent:priorIntent}}:null,error:null})};return query;
 });
 const output={intent:'next_action',message:'Choose a task.',actions:[],planning:null,memoryUpdates:[],nextActionWindow:null};
 mocks.generate.mockResolvedValue({output});
 const response=await POST(request({conversationId:'61300000-0000-0000-0000-000000000005',messages:[{role:'user',content:latest}]}));
 const body=await response.json();expect(body.message).toBe('How much time do you have now?');expect(body.ui.quickReplies).toHaveLength(3);
 expect(mocks.generate.mock.calls[0][0].output.schema.safeParse(output).success).toBe(true);
 expect(mocks.nextAction).not.toHaveBeenCalled();expect(body.proposal.body.items).toEqual([]);
});

it('lets the latest explicit language choice replace an earlier one without trusting assistant text',async()=>{
 const rpc=mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='assistant_begin_turn'?Promise.resolve({data:{status:'prepared',messages:[{role:'user',content:'请用中文回答：我有点累。'},{role:'assistant',content:'请用英文回答'},{role:'user',content:'Please reply in English. Pick a task from my queue.'}]},error:null}):rpc(name,args));
 const output={intent:'next_action',replyLocale:'en',message:'Choose a task.',actions:[],planning:null,memoryUpdates:[],nextActionWindow:null};
 mocks.generate.mockResolvedValue({output});
 const body=await (await POST(request({locale:'zh',messages:[{role:'user',content:'Please reply in English. Pick a task from my queue.'}]}))).json();
 expect(body.message).toBe('How much time do you have now?');
 expect(mocks.generate.mock.calls[0][0].output.schema.safeParse({...output,replyLocale:'zh'}).success).toBe(false);
});

it.each([
 'Please reply in Chinese, don\'t reply in English.',
 '不要用英文回答，请说中文。',
 '不要用中文回答，请说英语。',
 'Translate the phrase "reply in English" into Chinese.',
 'Translate "A sentence. Reply in English." into Chinese.',
])('does not hard-lock language from negated or quoted wording: %s',async content=>{
 const rpc=mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='assistant_begin_turn'?Promise.resolve({data:{status:'prepared',messages:[{role:'user',content:'请用中文回答：我有点累。'},{role:'assistant',content:'先休息。'},{role:'user',content}]},error:null}):rpc(name,args));
 const output={intent:'conversation',replyLocale:'zh',message:'好的。',actions:[],planning:null,memoryUpdates:[],nextActionWindow:null};
 mocks.generate.mockResolvedValue({output});
 expect((await POST(request({messages:[{role:'user',content}]}))).status).toBe(200);
 const schema=mocks.generate.mock.calls[0][0].output.schema;
 expect(schema.safeParse({...output,replyLocale:'zh'}).success).toBe(true);
 expect(schema.safeParse({...output,replyLocale:'en'}).success).toBe(true);
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
 expect(body.message.match(/\?/g)).toHaveLength(1);expect(body.proposal.body.items).toEqual([]);
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
 it('never streams internal language even when it crosses provider chunks',async()=>{
  const output={intent:'conversation',planning:null,memoryUpdates:[],nextActionWindow:null,message:'This endpoint is unsupported.',actions:[]};
  mocks.stream.mockReturnValue({partialOutputStream:(async function*(){yield {intent:'conversation',message:'This endp'};yield output;})(),output:Promise.resolve(output)});
  const body=await (await POST(streamedRequest())).text();
  expect(body).not.toContain('This endp');expect(body).not.toContain('endpoint');expect(body).toContain('"type":"error"');
  expect(mocks.rpc.mock.calls.some(call=>call[0]==='assistant_finish_turn')).toBe(false);
 });
 it('does not stream a premature schedule before planning readiness is validated',async()=>{
  const output={intent:'planning',planning:{horizon:null,facts:[],questions:[],assumptions:[],draft:'Premature final schedule',skipDiscovery:false},memoryUpdates:[],nextActionWindow:null,message:'Keep time flexible.',actions:[]};
  mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){yield {intent:'planning',message:'Premature final schedule.'};yield output;})(),output:Promise.resolve(output)}));
  const body=await (await POST(streamedRequest())).text();expect(body).not.toContain('Premature final schedule');expect(body).toContain('Which dates');
 });
 it('streams only public message text before generation completes, then sends the durable proposal',async()=>{
  let release!:()=>void;
  const waiting=new Promise<void>(resolve=>{release=resolve;});
  const output={intent:'conversation',planning:null,memoryUpdates:[],nextActionWindow:null,message:'Hello.\n\nSecond paragraph.',actions:[]};
  mocks.stream.mockReturnValue({partialOutputStream:(async function*(){yield {intent:'conversation',message:'Hello.',actions:[{kind:'unvalidated'}]};await waiting;yield output;})(),output:Promise.resolve(output)});
  const response=await POST(streamedRequest());
  expect(response.headers.get('content-type')).toContain('application/x-ndjson');
  const reader=response.body!.getReader(),decoder=new TextDecoder();
  const first=decoder.decode((await reader.read()).value);
  expect(JSON.parse(first)).toEqual({type:'text',text:'Hello.'});
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
   return {partialOutputStream:(async function*(){yield {intent:'conversation',message:'Partial.'};await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));})(),output:Promise.resolve({message:'Partial.',actions:[]})};
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

it.each([false,true])('keeps private provider/database details out of responses and logs (stream=%s)',async(stream)=>{
 const secret='PRIVATE: family medical appointment and memory';
 const failure=Object.assign(new Error(secret),{responseBody:JSON.stringify({error:{message:secret,type:secret,code:secret,param:secret}})});
 mocks.generate.mockRejectedValue(failure);
 mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){throw failure;})(),output:Promise.resolve(null)}));
 const req=request();if(stream)req.headers.set('Accept','application/x-ndjson');
 const response=await POST(req);expect(await response.text()).not.toContain(secret);
 expect(mocks.logError).toHaveBeenCalled();expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(secret);
});

it.each([false,true])('uses the requested reply language for generated advice and server duration choices (stream=%s)',async stream=>{
 for(const intent of ['conversation','next_action']){
  const output={intent,replyLocale:'zh',message:'先休息一下，今天只选一件必要的小事。',planning:null,actions:[],memoryUpdates:[],nextActionWindow:null};
  mocks.generate.mockResolvedValue({output});
  mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){yield output;})(),output:Promise.resolve(output)}));
  const req=request({locale:'en',messages:[{role:'user',content:intent==='conversation'?'请用中文回答：我今天很累，帮我选一个小步骤。':'请用中文回答：从任务队列选一件接下来做。'}]});
  if(stream)req.headers.set('Accept','application/x-ndjson');
  const response=await POST(req);
  expect(response.status).toBe(200);
  const body=stream?(await response.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1):await response.json();
  expect(body.message).toBe(intent==='conversation'?output.message:'现在能腾出多久？');
  expect(body.ui.quickReplies).toEqual(intent==='conversation'?[]:expect.arrayContaining([expect.objectContaining({label:'15 分钟'})]));
  expect(body.planning).toBeUndefined();expect(body.proposal.body.items).toEqual([]);
 }
 expect(mocks.nextAction).not.toHaveBeenCalled();
});

it('uses the requested reply language for a confirmed queue recommendation despite the interface language',async()=>{
 const window={start:'2026-09-21T12:00:00Z',end:'2026-09-21T12:15:00Z',available:true};
 mocks.generate.mockResolvedValue({output:{intent:'next_action',replyLocale:'en',message:'One small task.',planning:null,actions:[],memoryUpdates:[],nextActionWindow:window}});
 mocks.nextAction.mockResolvedValue({selected:{title:'Buy tea',estimate_minutes:10,source:'queue'}});
 const body=await (await POST(request({locale:'zh',messages:[{role:'user',content:'Please reply in English. I have 15 minutes free now; choose a task from my queue.'}]}))).json();
 expect(body.message).toBe('Next: Buy tea\n10 minutes\nIt is actionable in your queue and its estimate fits this window.');
 expect(body.proposal.body.items).toEqual([]);
});

it('uses the existing next-action engine only after an explicit availability window',async()=>{
 const window={start:new Date(Date.now()+60000).toISOString(),end:new Date(Date.now()+1800000).toISOString(),available:true};
 const output={intent:'next_action',message:'Let us choose one action.',planning:null,actions:[],memoryUpdates:[],nextActionWindow:null};
 mocks.generate.mockResolvedValue({output});
 expect((await POST(request({messages:[{role:'user',content:'What should I do next?'}]}))).status).toBe(200);expect(mocks.nextAction).not.toHaveBeenCalled();
 mocks.generate.mockResolvedValue({output:{...output,nextActionWindow:window}});mocks.nextAction.mockResolvedValue({selected:{title:'Call Matrix',estimate_minutes:10}});
 const body=await (await POST(request({messages:[{role:'user',content:`I am free from ${window.start} to ${window.end}. What next?`}]}))).json();
 expect(body.message).toContain('Call Matrix');expect(body.proposal.body.items).toEqual([]);expect(mocks.nextAction).toHaveBeenCalledTimes(1);
});

it.each(['I have 15 minutes free now. What should I do next?','我现在有 15 分钟空闲，请建议接下来做什么。'])('preserves the selected duration despite generation latency: %s',async content=>{
 mocks.generate.mockImplementation(async()=>{
  vi.setSystemTime(new Date('2026-09-21T12:00:20Z'));
  return {output:{intent:'next_action',message:'One step.',planning:null,actions:[],memoryUpdates:[],nextActionWindow:{start:'2026-09-21T12:00:00Z',end:'2026-09-21T12:15:00Z',available:true}}};
 });
 mocks.nextAction.mockImplementation(async(_client,_owner,start,end)=>({selected:end-start>=15*60000?{title:'Fifteen-minute task',estimate_minutes:15,source:'priority'}:null}));
 const body=await (await POST(request({messages:[{role:'user',content}]}))).json();
 expect(body.message).toContain('Fifteen-minute task');expect(body.message).toContain('daily priority');
 expect(mocks.nextAction.mock.calls[0].slice(2)).toEqual([Date.parse('2026-09-21T12:00:20Z'),Date.parse('2026-09-21T12:15:20Z')]);
 expect(body.ui.quickReplies).toEqual([]);expect(body.proposal.body.items).toEqual([]);
});

it.each([false,true])('retries an oversized planning draft once without publishing or persisting it (stream=%s)',async(stream)=>{
 mocks.generate.mockReset();mocks.stream.mockReset();
 const output={intent:'planning',message:'A flexible draft.',actions:[],memoryUpdates:[],nextActionWindow:null,planning:{horizon:null,facts:[],questions:[],assumptions:[],draft:'Start with one useful task. Keep family time protected.',skipDiscovery:true}};
 const invalid=assistantOutput.safeParse({...output,planning:{...output.planning,draft:'PRIVATE oversized draft '.repeat(200)}});
 expect(invalid.success).toBe(false);
 const failure=Object.assign(new Error('Private provider text'),{name:'AI_NoObjectGeneratedError',cause:{name:'AI_TypeValidationError',cause:invalid.error}});
 mocks.generate.mockRejectedValueOnce(failure).mockResolvedValue({output});
 mocks.stream.mockImplementationOnce(()=>({partialOutputStream:(async function*(){yield {intent:'planning',planning:{draft:'PRIVATE oversized draft'}};throw failure;})()})).mockImplementation(()=>({partialOutputStream:(async function*(){yield output;})(),output:Promise.resolve(output)}));
 const req=request({messages:[{role:'user',content:'Skip. Plan now.'}]});if(stream)req.headers.set('Accept','application/x-ndjson');
 const response=await POST(req),body=await response.text();
 expect(response.status).toBe(200);expect(body).toContain('Start with one useful task');expect(body).not.toContain('PRIVATE');
 const provider=stream?mocks.stream:mocks.generate;
 expect(provider).toHaveBeenCalledTimes(3);expect(provider.mock.calls[1][0].system).toContain('under 2400 characters');
 expect(mocks.rpc.mock.calls.filter(call=>call[0]==='assistant_finish_turn')).toHaveLength(1);
});
it('reselects memory against newly discovered future dates even when the calendar is empty',async()=>{
 const now=Date.now(),iso=(days:number)=>new Date(now+days*86400000).toISOString(),horizon={startDate:iso(14).slice(0,10),endDate:iso(27).slice(0,10),timezone:'UTC'};
 const baseline={id:owner,key:'gym',kind:'routine',content:'Durable six-day gym baseline',confidence:1,temporality:'durable',updated_at:iso(-2),effective_until:null};
 const from=mocks.from.getMockImplementation()!;
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='user_memories')return from(table);
  const query={select:()=>query,eq:()=>query,or:()=>query,order:()=>query,limit:async()=>({error:null,data:[baseline,{...baseline,id:'61500000-0000-0000-0000-000000000003',content:'Temporary four-day gym exception',temporality:'temporary',effective_until:iso(7)}]})};return query;
 });
 const rpc=mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='planner_schedule_context'?Promise.resolve({data:{coverageComplete:true,events:[]},error:null}):rpc(name,args));
 mocks.generate.mockResolvedValue({output:{intent:'planning',message:'Draft.',actions:[],memoryUpdates:[],nextActionWindow:null,planning:{horizon,facts:[],questions:[],assumptions:[],draft:'Use the preferences effective during these dates.',skipDiscovery:true}}});
 expect((await POST(request())).status).toBe(200);expect(mocks.generate).toHaveBeenCalledTimes(2);
 expect(mocks.generate.mock.calls[0][0].system).toContain('Temporary four-day gym exception');expect(mocks.generate.mock.calls[0][0].system).not.toContain('Durable six-day gym baseline');
 expect(mocks.generate.mock.calls[1][0].system).toContain('Durable six-day gym baseline');expect(mocks.generate.mock.calls[1][0].system).not.toContain('Temporary four-day gym exception');
});

it.each([false,true])('does not regenerate planning when the checked calendar has no events (stream=%s)',async(stream)=>{
 const original=mocks.rpc.getMockImplementation()!;
 mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>name==='planner_schedule_context'?Promise.resolve({data:{coverageComplete:true,events:[]},error:null}):original(name,args));
 const output={intent:'planning',message:'We will protect family time.',actions:[],memoryUpdates:[],nextActionWindow:null,planning:{horizon:null,facts:[],questions:[],assumptions:[],draft:null,skipDiscovery:false}};
 mocks.generate.mockResolvedValue({output});mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){yield output;})(),output:Promise.resolve(output)}));
 const req=request({messages:[{role:'user',content:'Help me plan next week.'}]});if(stream)req.headers.set('Accept','application/x-ndjson');
 const response=await POST(req);const body=await response.text();expect(response.status).toBe(200);expect(body).toContain('discovering');
 expect(stream?mocks.stream:mocks.generate).toHaveBeenCalledTimes(1);
 expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['check_ai_chat_rate_limit','assistant_begin_turn','planner_schedule_context','assistant_finish_turn']);
});

it.each([false,true])('stops after one oversized-draft retry and saves nothing (stream=%s)',async(stream)=>{
 mocks.generate.mockReset();mocks.stream.mockReset();
 const failure={name:'AI_NoObjectGeneratedError',cause:{name:'AI_TypeValidationError',cause:{issues:[{code:'too_big',path:['planning','draft']}]}}};
 mocks.generate.mockRejectedValue(failure);mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){throw failure;})()}));
 const req=request();if(stream)req.headers.set('Accept','application/x-ndjson');
 const response=await POST(req);expect(await response.text()).toContain('unavailable');
 expect(stream?mocks.stream:mocks.generate).toHaveBeenCalledTimes(2);
 expect(mocks.rpc.mock.calls.filter(call=>call[0]==='assistant_finish_turn')).toHaveLength(0);
});

it.each([false,true])('regenerates excessive memory updates within the existing ten-update limit (stream=%s)',async(stream)=>{
 mocks.generate.mockReset();mocks.stream.mockReset();
 const output={intent:'conversation',message:'I will remember your preferences.',actions:[],memoryUpdates:[],nextActionWindow:null,planning:null};
 const memory={operation:'upsert',kind:'preference',key:'family',content:'Family after pickup',confidence:1,temporality:'durable',validFor:null};
 const invalid=assistantOutput.safeParse({...output,memoryUpdates:Array.from({length:11},()=>memory)});
 expect(invalid.success).toBe(false);
 const failure={name:'AI_NoObjectGeneratedError',cause:{name:'AI_TypeValidationError',cause:invalid.error}};
 mocks.generate.mockRejectedValueOnce(failure).mockResolvedValue({output});
 mocks.stream.mockImplementationOnce(()=>({partialOutputStream:(async function*(){throw failure;})()})).mockImplementation(()=>({partialOutputStream:(async function*(){yield output;})(),output:Promise.resolve(output)}));
 const req=request();if(stream)req.headers.set('Accept','application/x-ndjson');
 const response=await POST(req);expect(await response.text()).toContain('I will remember');expect(response.status).toBe(200);
 expect(stream?mocks.stream:mocks.generate).toHaveBeenCalledTimes(2);
 expect(mocks.rpc.mock.calls.filter(call=>call[0]==='assistant_finish_turn')).toHaveLength(1);
});

it.each([false,true])('repairs invalid structured planning flags without weakening the schema (stream=%s)',async(stream)=>{
 mocks.generate.mockReset();mocks.stream.mockReset();
 const output={intent:'planning',message:'A provisional plan.',actions:[],memoryUpdates:[],nextActionWindow:null,planning:{horizon:null,facts:[],questions:[],assumptions:[],draft:'Start with one task; keep unknown times flexible.',skipDiscovery:true}};
 const invalid=assistantOutput.safeParse({...output,planning:{...output.planning,skipDiscovery:null}});expect(invalid.success).toBe(false);
 const failure={name:'AI_NoObjectGeneratedError',cause:{name:'AI_TypeValidationError',cause:invalid.error}};
 mocks.generate.mockRejectedValueOnce(failure).mockResolvedValue({output});mocks.stream.mockImplementationOnce(()=>({partialOutputStream:(async function*(){throw failure;})()})).mockImplementation(()=>({partialOutputStream:(async function*(){yield output;})(),output:Promise.resolve(output)}));
 const req=request({messages:[{role:'user',content:'Skip. Plan now.'}]});if(stream)req.headers.set('Accept','application/x-ndjson');
 const response=await POST(req);expect(await response.text()).toContain('Start with one task');expect(response.status).toBe(200);
 const provider=stream?mocks.stream:mocks.generate;expect(provider).toHaveBeenCalledTimes(3);expect(provider.mock.calls[1][0].system).toContain('planning.skipDiscovery');
});

it.each([false,true])('honors Skip. Plan now. with missing readiness and no model draft (stream=%s)',async(stream)=>{
 const output={intent:'planning',message:'Which dates?',actions:[],memoryUpdates:[],nextActionWindow:null,planning:{horizon:null,facts:[],questions:[],assumptions:[],draft:null,skipDiscovery:false}};
 mocks.generate.mockResolvedValue({output});mocks.stream.mockImplementation(()=>({partialOutputStream:(async function*(){yield output;})(),output:Promise.resolve(output)}));
 const req=request({messages:[{role:'user',content:'Skip. Plan now.'}]});if(stream)req.headers.set('Accept','application/x-ndjson');
 const response=await POST(req);const body=stream?(await response.text()).trim().split('\n').map(line=>JSON.parse(line)).at(-1):await response.json();
 expect(body.planning.status).toBe('drafted');expect(body.message).not.toContain('?');expect(body.message).not.toMatch(/Assumption:|not confirmed/);expect(body.message.length).toBeLessThan(250);expect(body.planning.assumptions).toHaveLength(9);expect(body.proposal.body.items).toEqual([]);
});

it('does not regenerate after publishing any streamed text',async()=>{
 const failure={name:'AI_NoObjectGeneratedError',cause:{name:'AI_TypeValidationError',cause:{issues:[{code:'too_big',path:['planning','draft']}]}}};
 mocks.stream.mockReset().mockImplementation(()=>({partialOutputStream:(async function*(){yield {intent:'conversation',message:'A published sentence.'};throw failure;})()}));
 const req=request();req.headers.set('Accept','application/x-ndjson');
 const body=await (await POST(req)).text();expect(body).toContain('A published sentence.');expect(body).toContain('unavailable');
 expect(mocks.stream).toHaveBeenCalledTimes(1);expect(mocks.rpc.mock.calls.filter(call=>call[0]==='assistant_finish_turn')).toHaveLength(0);
});

it('shares the single retry budget across initial and calendar-aware generations',async()=>{
 const failure={name:'AI_NoObjectGeneratedError',cause:{name:'AI_TypeValidationError',cause:{issues:[{code:'too_big',path:['planning','draft']}]}}};
 const output={intent:'planning',message:'A draft.',actions:[],memoryUpdates:[],nextActionWindow:null,planning:{horizon:null,facts:[],questions:[],assumptions:[],draft:'A concise draft.',skipDiscovery:true}};
 mocks.generate.mockReset().mockRejectedValueOnce(failure).mockResolvedValueOnce({output}).mockRejectedValue(failure);
 expect((await POST(request())).status).toBe(502);expect(mocks.generate).toHaveBeenCalledTimes(3);
 expect(mocks.rpc.mock.calls.filter(call=>call[0]==='assistant_finish_turn')).toHaveLength(0);
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
 mocks.from.mockImplementation((table:string)=>{const data=table==='tasks'?[task]:table==='projects'?[project]:table==='profiles'?{timezone:'UTC'}:null;const query={select:()=>query,eq:()=>query,or:()=>query,is:()=>query,not:()=>query,order:()=>query,limit:()=>query,single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return query;});
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
