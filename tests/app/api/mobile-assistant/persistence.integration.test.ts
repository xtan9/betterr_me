// @vitest-environment node
import {datedOutput} from '../../../fixtures/assistant/dated-output';
// Opt-in: a disposable PostgREST database, migrated and seeded as documented in the verification report.
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SignJWT} from 'jose';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {beforeAll,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),generate:vi.fn()}));
vi.mock('@/lib/auth/native-request',()=>({authenticateNativeRequest:mocks.auth}));
vi.mock('ai',()=>({generateText:mocks.generate,streamText:vi.fn(),Output:{object:vi.fn()}}));
import {POST} from '@/app/api/mobile/assistant/route';
import {GET} from '@/app/api/mobile/assistant/history/route';
import {POST as plan} from '@/app/api/mobile/planning/route';
const owner='61600000-0000-0000-0000-000000000001',other='61600000-0000-0000-0000-000000000002';
const root=process.env.ASSISTANT_TEST_REST_URL;
describe.skipIf(!root)('Phase A route + real PostgreSQL persistence (provider and token verifier stubbed)',()=>{
 let client:SupabaseClient,otherClient:SupabaseClient;
 beforeAll(async()=>{
  if(root!=='http://127.0.0.1:55443')throw new Error('Disposable test target required');
  async function userClient(id:string){
   const token=await new SignJWT({role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setSubject(id).setExpirationTime('1h').sign(new TextEncoder().encode('phase-a-disposable-verification-only-secret'));
   return createClient(root!,'disposable-only',{global:{headers:{Authorization:`Bearer ${token}`},fetch:(url,options)=>fetch(String(url).replace('/rest/v1',''),options)},auth:{persistSession:false,autoRefreshToken:false}});
  }
  client=await userClient(owner);otherClient=await userClient(other);
  vi.stubEnv('LLM_API_KEY','disposable-model-stub');
  mocks.auth.mockResolvedValue({userId:owner,client});
 });
 it('persists discovery, skipped draft, memories, temporary correction, history and owner isolation across new conversations',async()=>{
  const context={intent:'planning',message:'Protect family time after pickup. Calls stay tasks; choose one clear next action.',actions:[],nextActionWindow:null,memoryUpdates:[
   {operation:'upsert',kind:'routine',key:'gym',content:'Gym Monday–Saturday; it is important.',confidence:1,temporality:'durable'},
   {operation:'upsert',kind:'preference',key:'family',content:'After pickup is family time.',confidence:1,temporality:'durable'},
   {operation:'upsert',kind:'preference',key:'decision-friction',content:'Long unordered lists increase procrastination; offer one clear next action.',confidence:1,temporality:'durable'},
  ],planning:{horizon:null,facts:[{dimension:'sleep',state:'missing',detail:null},{dimension:'caregiving',state:'partial',detail:'Monday–Thursday school pickup departure is unknown.'},...['fixedCommitments','workBoundaries','meals','exercise','deadlines','priorities'].map(dimension=>({dimension,state:'known',detail:'Supplied in the golden request.'}))],questions:[],assumptions:[],draft:null,skipDiscovery:false}};
  mocks.generate.mockResolvedValue({output:context});
  async function send(content:string,conversationId?:string){
   const response=await POST(new Request('http://localhost/api/mobile/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),conversationId,consent:true,locale:'en',messages:[{role:'user',content}]})}));
   expect(response.status).toBe(200);return response.json();
  }
  const first=await send(readFileSync('tests/fixtures/assistant/two-week-planning.txt','utf8'));
  expect(first.planning.missing).toEqual(['horizon','sleep','caregiving']);expect(first.message.match(/\?/g)).toHaveLength(3);expect(first.proposal.body.items).toEqual([]);
  const durable=await client.from('user_memories').select('*').eq('key','gym').eq('status','active').eq('temporality','durable').single();expect(durable.error).toBeNull();
  mocks.generate.mockResolvedValue({output:{...context,memoryUpdates:[],planning:{...context.planning,facts:[]}}});
  const skipped=await send('Skip. Plan now.',first.conversationId);expect(skipped.planning.status).toBe('drafted');expect(skipped.planning.assumptions.length).toBeGreaterThan(0);
  const later=await send('Help me plan next week.');
  const supplied=mocks.generate.mock.calls.at(-1)![0].system;
  for(const memory of context.memoryUpdates)expect(supplied).toContain(memory.content);
  expect(later.conversationId).not.toBe(first.conversationId);
  mocks.generate.mockResolvedValue({output:{...context,intent:'conversation',planning:null,memoryUpdates:[{operation:'supersede',memoryId:durable.data.id,replacement:{kind:'routine',key:'gym',content:'Gym four days a week for the next month.',confidence:1,temporality:'temporary',validFor:{amount:1,unit:'months'}}}]}});
  await send('For the next month I only want to go to the gym four days a week.',later.conversationId);
  mocks.generate.mockResolvedValue({output:{...context,memoryUpdates:[]}});
  await send('Help me plan next week.');
  const corrected=mocks.generate.mock.calls.at(-1)![0].system;
  expect(corrected).toContain('Gym four days a week');expect(corrected).not.toContain('Gym Monday–Saturday');
  const baseline=await client.from('user_memories').select('status,content').eq('id',durable.data.id).single();expect(baseline.data).toMatchObject({status:'active',content:'Gym Monday–Saturday; it is important.'});
  const history=await GET(new Request(`http://localhost/api/mobile/assistant/history?conversationId=${first.conversationId}`));expect(history.status).toBe(200);expect((await history.json()).messages).toHaveLength(4);
  // Separate committed transactions make this a real stale-memory race across conversations,
  // independent of the existing same-conversation version check.
  const staleId=randomUUID(),newerId=randomUUID();
  expect((await client.rpc('assistant_begin_turn',{p_id:staleId,p_conversation_id:first.conversationId,p_new:false,p_fingerprint:'a'.repeat(64),p_messages:[{role:'user',content:'Earlier durable change'}]})).data.status).toBe('prepared');
  expect((await client.rpc('assistant_begin_turn',{p_id:newerId,p_conversation_id:newerId,p_new:true,p_fingerprint:'b'.repeat(64),p_messages:[{role:'user',content:'Newer temporary correction'}]})).data.status).toBe('prepared');
  const stored={message:'Remembered privately.',intent:'conversation',planning:null,missing:[],ui:{quickReplies:[]},capture:{message:'Remembered privately.',items:[]},memoryUpdates:[{operation:'upsert',kind:'routine',key:'gym',content:'Newer temporary preference',confidence:1,temporality:'temporary'}]};
  expect((await client.rpc('assistant_finish_turn',{p_id:newerId,p_fingerprint:'b'.repeat(64),p_output:stored})).data.status).toBe('complete');
  const stale={...stored,memoryUpdates:[{...stored.memoryUpdates[0],content:'Obsolete baseline',temporality:'durable'}]};
  expect((await client.rpc('assistant_finish_turn',{p_id:staleId,p_fingerprint:'a'.repeat(64),p_output:stale})).data.status).toBe('conflict');
  expect((await client.from('user_memories').select('status').eq('id',durable.data.id).single()).data?.status).toBe('active');
  for(const table of ['tasks','calendar_events']){const rows=await client.from(table).select('id');expect(rows.error).toBeNull();expect(rows.data).toEqual([]);}
  for(const table of ['assistant_conversations','assistant_messages','user_memories','planning_sessions']){const rows=await otherClient.from(table).select('*');expect(rows.error).toBeNull();expect(rows.data).toEqual([]);}
  mocks.auth.mockResolvedValue({userId:other,client:otherClient});
  expect((await GET(new Request(`http://localhost/api/mobile/assistant/history?conversationId=${first.conversationId}`))).status).toBe(404);
 });
 it('runs a two-week session through exact preview, atomic accept, retry, Undo and owner isolation',async()=>{
  mocks.auth.mockResolvedValue({userId:owner,client});
  const horizon={startDate:'2030-01-07',endDate:'2030-01-20',timezone:'UTC'};
  const reply={intent:'planning',message:'Keep family time protected.',actions:[],nextActionWindow:null,memoryUpdates:[],planning:{horizon,facts:[{dimension:'horizon',state:'known',detail:null},{dimension:'workBoundaries',state:'known',detail:'Focused work only Monday–Thursday before pickup at15:00. Weekends family first.'}],questions:[],assumptions:['Unspecified meal and cooking times stay flexible.'],draft:'Gym Monday–Saturday, Sunday rest. Video first, then outdoor work. Calls remain tasks.',skipDiscovery:true,travelMinutes:15}};
  mocks.generate.mockResolvedValue({output:reply});
  const response=await POST(new Request('http://localhost/api/mobile/assistant',{method:'POST',body:JSON.stringify({requestId:randomUUID(),consent:true,locale:'en',messages:[{role:'user',content:'Plan January7–20,2030. Sleep22–06; pickup15:00 Mon–Thu; gymMon–Sat09–10; Sundayrest. Video3hours first, outdoor2hours once; calls stay tasks. Plan now.'}]})}));
  expect(response.status).toBe(200);const conversation=await response.json();expect(conversation.planning.horizon).toEqual(horizon);
  const events=Array.from({length:14},(_,offset)=>{const date=new Date(Date.UTC(2030,0,7+offset)).toISOString().slice(0,10);return {date,kind:'event-create',targetId:null,title:'Gym',startTime:'09:00',endTime:'10:00',taskId:null,taskItemIndex:null,protected:false,category:'other'};}).filter(event=>new Date(event.date).getUTCDay()!==0);
  mocks.generate.mockResolvedValue({output:datedOutput({message:'Start with the pediatrician call. Gym on Mon–Sat; Sunday family rest.',questions:[],assumptions:['Cleaning remains flexible.'],capture:{message:'Calls stay actionable',actions:[{kind:'task-create',title:'Call pediatrician',estimateMinutes:10,dueDate:null,projectId:null,projectKey:null}]},events,priorityTaskIds:null},horizon)});
  const requestId=randomUUID(),request={requestId,consent:true,locale:'en',sessionId:conversation.planning.sessionId,sessionVersion:conversation.planning.version};
  const preview=await plan(new Request('http://localhost/api/mobile/planning',{method:'POST',body:JSON.stringify(request)}));expect(preview.status).toBe(200);
  const proposal=(await preview.json()).proposal;expect(proposal.body.events).toHaveLength(12);
  for(const table of ['tasks','calendar_events'])expect((await client.from(table).select('id')).data).toEqual([]);
  expect((await otherClient.from('planner_ai_proposals').select('id').eq('id',proposal.id)).data).toEqual([]);
  const command={operation:'accept',operationId:randomUUID(),proposalId:proposal.id,expectedVersion:proposal.version};
  expect((await otherClient.rpc('planner_schedule_command',{p_request:command})).data.status).toBe('not-found');
  const accepted=await client.rpc('planner_schedule_command',{p_request:command});expect(accepted.error).toBeNull();expect(accepted.data.status).toBe('complete');
  expect((await client.rpc('planner_schedule_command',{p_request:command})).data).toEqual({...accepted.data,status:'already-applied'});
  const persisted=(await client.from('calendar_events').select('title,start_date,start_time,end_time,is_recurring')).data!;
  expect(persisted).toHaveLength(12);expect(persisted.every(event=>!event.is_recurring)).toBe(true);
  for(const event of proposal.body.events)expect(persisted).toContainEqual({title:event.changes.title,start_date:event.changes.start_date,start_time:event.changes.start_time+':00',end_time:event.changes.end_time+':00',is_recurring:false});
  const undo={operation:'undo',operationId:randomUUID(),changeId:accepted.data.changeId,expectedVersion:accepted.data.changeVersion};
  const restored=(await client.rpc('planner_schedule_command',{p_request:undo})).data;expect(restored.status).toBe('complete');expect(restored.planning.version).not.toBe(request.sessionVersion);
  expect((await client.rpc('planner_schedule_command',{p_request:undo})).data.status).toBe('already-applied');
  for(const table of ['tasks','calendar_events'])expect((await client.from(table).select('id')).data).toEqual([]);
  expect((await otherClient.from('planning_sessions').select('id')).data).toEqual([]);
  const generated=mocks.generate.getMockImplementation()!;
  const raceStatuses:string[]=[];
  mocks.generate.mockImplementationOnce(async()=>{
   const turnId=randomUUID();
   raceStatuses.push((await client.rpc('assistant_begin_turn',{p_id:turnId,p_conversation_id:conversation.conversationId,p_new:false,p_fingerprint:'e'.repeat(64),p_messages:[{role:'user',content:'Change my work boundary while the preview is generating.'}]})).data?.status??'begin-error');
   const changed=await client.rpc('assistant_finish_turn',{p_id:turnId,p_fingerprint:'e'.repeat(64),p_output:{message:'Revised draft.',intent:'planning',planning:{status:'drafted',horizon,readiness:{horizon:'known'},facts:{workBoundaries:'No focused work after14:00'},assumptions:[],travelMinutes:15},missing:[],ui:{quickReplies:[]},capture:{message:'Revised draft.',items:[]},memoryUpdates:[]}});
   raceStatuses.push(changed.data?.status??'finish-error');return generated();
  });
  const raced=await plan(new Request('http://localhost/api/mobile/planning',{method:'POST',body:JSON.stringify({...request,requestId:randomUUID(),sessionVersion:restored.planning.version})}));
  expect(raceStatuses).toEqual(['prepared','complete']);expect(raced.status).toBe(409);expect(await raced.json()).toEqual({error:'conflict'});
  expect((await client.from('calendar_events').select('id')).data).toEqual([]);
 });
});
