import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/auth/native-request',()=>({authenticateNativeRequest:mocks.auth}));
import {GET} from '@/app/api/mobile/assistant/history/route';
const owner='61400000-0000-0000-0000-000000000001',conversation='61400000-0000-0000-0000-000000000010';
let rows:Record<string,unknown>,filters:Record<string,unknown[][]>;
beforeEach(()=>{
 vi.clearAllMocks();filters={};rows={assistant_conversations:{id:conversation},assistant_messages:Array.from({length:41},(_,i)=>({role:i%2?'user':'assistant',content:`Message ${100-i}`,sequence:100-i})),assistant_turns:{id:'turn',response:{ui:{quickReplies:[]}}},planner_ai_proposals:{id:'turn',state:'accepted'}};
 mocks.auth.mockResolvedValue({userId:owner,client:{from:mocks.from}});
 mocks.from.mockImplementation((table:string)=>{
  filters[table]=[];
  const query={select:()=>query,eq:(...args:unknown[])=>{filters[table].push(args);return query;},lt:(...args:unknown[])=>{filters[table].push(args);return query;},not:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>({data:rows[table],error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:rows[table],error:null}).then(resolve)};return query;
 });
});
it('paginates owner history and restores current proposal state',async()=>{
 const response=await GET(new Request(`https://betterr.me/api/mobile/assistant/history?conversationId=${conversation}&before=101`));
 expect(response.status).toBe(200);const body=await response.json();
 expect(body.messages).toHaveLength(40);expect(body.messages[0].content).toBe('Message 61');expect(body.before).toBe(61);expect(body.proposal.state).toBe('accepted');
 for(const table of Object.keys(filters))expect(filters[table]).toContainEqual(['user_id',owner]);
 expect(filters.assistant_messages).toContainEqual(['conversation_id',conversation]);expect(filters.assistant_messages).toContainEqual(['sequence',101]);
 expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('does not read history without a verified native identity or visible conversation',async()=>{
 mocks.auth.mockResolvedValueOnce(null);expect((await GET(new Request('https://betterr.me/api/mobile/assistant/history'))).status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();
 rows.assistant_conversations=null;
 expect((await GET(new Request(`https://betterr.me/api/mobile/assistant/history?conversationId=${conversation}`))).status).toBe(404);expect(filters.assistant_messages).toBeUndefined();
});
it.each(['drafted','applied','cancelled'])('restores current owner-private %s session state instead of the immutable pre-accept handle',async(status)=>{
 rows.assistant_turns={id:'turn',response:{planning:{sessionId:'session',version:'before-accept',status:'drafted'},ui:{quickReplies:[]}}};
 rows.planning_sessions={id:'session',version:'after-undo',status,start_date:'2030-01-01',end_date:'2030-01-14',timezone:'UTC',readiness:{sleep:'missing',horizon:'known'},assumptions:['Sleep remains flexible']};
 const response=await GET(new Request(`https://betterr.me/api/mobile/assistant/history?conversationId=${conversation}`));expect(response.status).toBe(200);const body=await response.json();
 if(status==='drafted')expect(body.planning).toMatchObject({version:'after-undo',missing:['sleep'],horizon:{startDate:'2030-01-01',endDate:'2030-01-14'}});else expect(body.planning).toBeUndefined();
 expect(filters.planning_sessions).toContainEqual(['user_id',owner]);expect(filters.planning_sessions).toContainEqual(['conversation_id',conversation]);
});
