import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({generate:vi.fn(),getUser:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock('ai',()=>({generateText:mocks.generate,Output:{object:vi.fn()}}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:mocks.getUser},rpc:mocks.rpc,from:mocks.from})}));
import {POST} from '@/app/api/mobile/assistant/route';
const owner='61300000-0000-0000-0000-000000000001';
const request=(extra:Record<string,unknown>={},token='user-token')=>new Request('https://betterr.me/api/mobile/assistant',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:'61300000-0000-0000-0000-000000000002',consent:true,locale:'en',messages:[{role:'user',content:'Add buy milk'}],...extra})});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('LLM_API_KEY','local-test-key');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:55721');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','local-test-anon');
 mocks.getUser.mockResolvedValue({data:{user:{id:owner}},error:null});
 mocks.from.mockImplementation((table:string)=>{const payload=table==='profiles'?{timezone:'UTC'}:table==='planner_ai_proposals'?null:[];const query={select:()=>query,eq:()=>query,is:()=>query,order:()=>query,limit:()=>query,single:async()=>({data:payload,error:null}),maybeSingle:async()=>({data:payload,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:payload,error:null}).then(resolve)};return query;});
 mocks.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>name==='check_ai_chat_rate_limit'?{data:[{allowed:true,minute_remaining:9,day_remaining:99}],error:null}:{data:{status:'complete',proposal:{id:args.p_id,body:args.p_body,version:'preview-version',state:'pending'}},error:null});
 mocks.generate.mockResolvedValue({output:{message:'Review this task.',actions:[{kind:'task-create',title:'Buy milk',estimateMinutes:null,dueDate:null,projectId:null,projectKey:null}]}});
});
describe('native assistant authenticated proposal route',()=>{
 it('returns an exact preview without applying plan mutations',async()=>{
  const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();
  expect(body.proposal.body.items[0]).toMatchObject({kind:'task-create',changes:{title:'Buy milk'}});
  expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['check_ai_chat_rate_limit','planner_ai_store_proposal']);
  expect(mocks.generate.mock.calls[0][0]).not.toHaveProperty('tools');
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
  expect(mocks.rpc.mock.calls.filter(call=>call[0]==='planner_ai_store_proposal')).toHaveLength(0);
 });
 it('rejects malformed or unsupported model changes',async()=>{
  mocks.generate.mockResolvedValue({output:{message:'Done',actions:[{kind:'execute-sql',sql:'delete from tasks'}]}});
  expect((await POST(request())).status).toBe(502);
  expect(mocks.rpc.mock.calls.filter(call=>call[0]==='planner_ai_store_proposal')).toHaveLength(0);
 });
});

