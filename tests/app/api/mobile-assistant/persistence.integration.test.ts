// @vitest-environment node
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
  for(const table of ['tasks','calendar_events']){const rows=await client.from(table).select('id');expect(rows.error).toBeNull();expect(rows.data).toEqual([]);}
  for(const table of ['assistant_conversations','assistant_messages','user_memories','planning_sessions']){const rows=await otherClient.from(table).select('*');expect(rows.error).toBeNull();expect(rows.data).toEqual([]);}
  mocks.auth.mockResolvedValue({userId:other,client:otherClient});
  expect((await GET(new Request(`http://localhost/api/mobile/assistant/history?conversationId=${first.conversationId}`))).status).toBe(404);
 });
});
