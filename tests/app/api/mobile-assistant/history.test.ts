import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/auth/native-request',()=>({authenticateNativeRequest:mocks.auth}));
import {GET} from '@/app/api/mobile/assistant/history/route';
const owner='61400000-0000-0000-0000-000000000001',conversation='61400000-0000-0000-0000-000000000010';
let rows:Record<string,unknown>,filters:Record<string,unknown[][]>,accepted:unknown[];
let queries:{table:string;calls:unknown[][]}[],failedRead:'accepted'|'workflow'|undefined;
beforeEach(()=>{
 accepted=[];queries=[];failedRead=undefined;
 vi.clearAllMocks();filters={};rows={assistant_conversations:{id:conversation},assistant_messages:Array.from({length:41},(_,i)=>({role:i%2?'user':'assistant',content:`Message ${100-i}`,sequence:100-i})),assistant_turns:{id:'turn',response:{ui:{quickReplies:[]}}},planner_ai_proposals:{id:'turn',state:'accepted'}};
 mocks.auth.mockResolvedValue({userId:owner,client:{from:mocks.from}});
 mocks.from.mockImplementation((table:string)=>{
  filters[table]??=[];
  let workflow=false;const calls:unknown[][]=[];queries.push({table,calls});
  const record=(method:string,args:unknown[])=>{calls.push([method,...args]);return query;};
  const query={select:(...args:unknown[])=>record('select',args),eq:(...args:unknown[])=>{filters[table].push(args);return record('eq',args);},in:(...args:unknown[])=>{filters[table].push(args);if(args[0]==='response->>intent')workflow=true;return record('in',args);},or:(...args:unknown[])=>{workflow=true;return record('or',args);},lt:(...args:unknown[])=>{filters[table].push(args);return record('lt',args);},not:(...args:unknown[])=>record('not',args),order:(...args:unknown[])=>record('order',args),limit:(...args:unknown[])=>record('limit',args),maybeSingle:async()=>({data:workflow?rows.workflow:rows[table],error:workflow&&failedRead==='workflow'?new Error('unavailable'):null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:table==='planner_ai_proposals'?accepted:rows[table],error:table==='planner_ai_proposals'&&failedRead==='accepted'?new Error('unavailable'):null}).then(resolve)};return query;
 });
});
it.each(['capture','planning','clarification'])('returns owner-scoped receipts and restores a %s workflow',async(intent)=>{
 rows.assistant_messages=[{role:'assistant',content:'Preview, not saved.',sequence:2,request_id:'capture'},{role:'user',content:'Create task',sequence:1,request_id:'user-only'}];
 accepted=[{id:'capture',state:'accepted',body:{items:[{id:'item',kind:'task-create',changes:{title:'Walk dog'}}]},outcome:{status:'complete',proposalId:'capture',results:[{itemId:'item',kind:'task-create',recordId:'saved-task-id'}]}}];
 rows.workflow={response:{intent,...(intent==='clarification'?{planning:{sessionId:'later-plan'}}:{})}};
 const response=await GET(new Request(`https://betterr.me/api/mobile/assistant/history?conversationId=${conversation}`));
 expect(response.status).toBe(200);const body=await response.json();
 expect(body.acceptedProposals).toEqual(accepted);expect(body.activeWorkflow).toBe(intent==='capture'?'capture':'planning');
 expect(filters.planner_ai_proposals).toContainEqual(['state','accepted']);
 expect(filters.planner_ai_proposals).toContainEqual(['id',['capture']]);
 expect(filters.planner_ai_proposals).toContainEqual(['user_id',owner]);
 expect(filters.assistant_turns).toContainEqual(['conversation_id',conversation]);
 expect(queries.find(query=>query.table==='planner_ai_proposals')?.calls).toEqual([
  ['select','id,user_id,version,state,body,expires_at,outcome'],['eq','user_id',owner],['eq','state','accepted'],['in','id',['capture']],
 ]);
 expect(queries.find(query=>query.table==='assistant_turns')?.calls).toEqual([
  ['select','response'],['eq','user_id',owner],['eq','conversation_id',conversation],['or','response->>intent.in.(capture,planning),response->planning->>sessionId.not.is.null'],['order','created_at',{ascending:false}],['limit',1],
 ]);
});
it.each(['accepted','workflow'] as const)('fails closed when the %s state read fails',async(read)=>{
 failedRead=read;rows.assistant_messages=[{role:'assistant',content:'Preview',request_id:'capture',sequence:1}];
 const response=await GET(new Request(`https://betterr.me/api/mobile/assistant/history?conversationId=${conversation}`));
 expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'unavailable'});
});
it('paginates owner history and restores current proposal state',async()=>{
 const response=await GET(new Request(`https://betterr.me/api/mobile/assistant/history?conversationId=${conversation}&before=101`));
 expect(response.status).toBe(200);const body=await response.json();
 expect(body.messages).toHaveLength(40);expect(body.messages[0].content).toBe('Message 61');expect(body.before).toBe(61);expect(body.proposal.state).toBe('accepted');
 for(const table of Object.keys(filters))expect(filters[table]).toContainEqual(['user_id',owner]);
 expect(filters.assistant_messages).toContainEqual(['conversation_id',conversation]);expect(filters.assistant_messages).toContainEqual(['sequence',101]);
 expect(response.headers.get('Cache-Control')).toBe('no-store');
 expect(body.planningSessionId).toBeNull();
});
it('does not read history without a verified native identity or visible conversation',async()=>{
 mocks.auth.mockResolvedValueOnce(null);expect((await GET(new Request('https://betterr.me/api/mobile/assistant/history'))).status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();
 rows.assistant_conversations=null;
 expect((await GET(new Request(`https://betterr.me/api/mobile/assistant/history?conversationId=${conversation}`))).status).toBe(404);expect(filters.assistant_messages).toBeUndefined();
});
it('restores the last real capture preview after ordinary clarification',async()=>{
 const original=mocks.from.getMockImplementation()!;
 mocks.from.mockImplementation((table:string)=>{
  if(table!=='assistant_turns')return original(table);
  let capture=false;
  const query={select:()=>query,eq:(field:string)=>{if(field==='response->>intent')capture=true;return query;},in:()=>query,or:()=>query,not:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:capture?{id:'capture-turn'}:{id:'ordinary-turn',response:{intent:'conversation',ui:{quickReplies:[]}}},error:null})};return query;
 });
 rows.planner_ai_proposals={id:'capture-turn',state:'pending'};
 const body=await (await GET(new Request(`https://betterr.me/api/mobile/assistant/history?conversationId=${conversation}`))).json();
 expect(body.proposal).toEqual(rows.planner_ai_proposals);
 expect(filters.planner_ai_proposals).toContainEqual(['id','capture-turn']);
});
it.each(['drafted','applied','cancelled'])('restores current owner-private %s session state instead of the immutable pre-accept handle',async(status)=>{
 rows.assistant_turns={id:'turn',response:{planning:{sessionId:'session',version:'before-accept',status:'drafted'},ui:{quickReplies:[]}}};
 rows.planning_sessions={id:'session',version:'after-undo',status,start_date:'2030-01-01',end_date:'2030-01-14',timezone:'UTC',readiness:{sleep:'missing',horizon:'known'},assumptions:['Sleep remains flexible']};
 const response=await GET(new Request(`https://betterr.me/api/mobile/assistant/history?conversationId=${conversation}`));expect(response.status).toBe(200);const body=await response.json();
 if(status==='drafted')expect(body.planning).toMatchObject({version:'after-undo',missing:['sleep'],horizon:{startDate:'2030-01-01',endDate:'2030-01-14'}});else expect(body.planning).toBeUndefined();
 expect(body.cancelledPlanningSessionId).toBe(status==='cancelled'?'session':undefined);
 expect(body.planningSessionId).toBe('session');
 expect(filters.planning_sessions).toContainEqual(['user_id',owner]);expect(filters.planning_sessions).toContainEqual(['conversation_id',conversation]);
});
it('restores training cards only for clients that can review their action and occurrence receipt',async()=>{
 const training={id:'training',state:'accepted',body:{items:[{id:'item',kind:'training-create',changes:{title:'Leg day',date:'2030-01-01',timezone:'UTC',trainingTemplateId:null}}]},outcome:{status:'complete',results:[{itemId:'item',kind:'training-create',recordId:'occurrence-id',seriesId:'series-id'}]}};
 rows.planner_ai_proposals=training;accepted=[training];rows.assistant_messages=[{role:'assistant',content:'Training plan saved.',sequence:1,request_id:'training'}];
 const legacy=await (await GET(new Request(`https://backend.test/api/mobile/assistant/history?conversationId=${conversation}`))).json();
 expect(legacy.messages[0].content).toBe('Training plan saved.');expect(legacy.proposal).toBeNull();expect(legacy.acceptedProposals).toEqual([]);
 const current=await GET(new Request(`https://backend.test/api/mobile/assistant/history?conversationId=${conversation}&supportsTrainingPlans=true`));expect(current.status).toBe(200);
 const body=await current.json();expect(body.proposal).toEqual(training);expect(body.acceptedProposals).toEqual([training]);
});
