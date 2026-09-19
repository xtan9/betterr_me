import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({createClient:vi.fn(),generate:vi.fn(),getUser:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock('ai',()=>({generateText:mocks.generate,Output:{object:vi.fn()}}));
vi.mock('@supabase/supabase-js',()=>({createClient:(...args:unknown[])=>{mocks.createClient(...args);return {auth:{getUser:mocks.getUser},rpc:mocks.rpc,from:mocks.from};}}));
import {POST} from '@/app/api/mobile/assistant/route';
const owner='61300000-0000-0000-0000-000000000001';
const request=(extra:Record<string,unknown>={},token='user-token')=>new Request('https://betterr.me/api/mobile/assistant',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:'61300000-0000-0000-0000-000000000002',consent:true,locale:'en',messages:[{role:'user',content:'Add buy milk'}],...extra})});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('LLM_API_KEY','local-test-key');vi.stubEnv('LLM_MODEL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:55721');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','local-test-anon');
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
  expect(mocks.rpc.mock.calls.filter(call=>call[0]==='planner_ai_store_proposal')).toHaveLength(0);
 });
 it('rejects malformed or unsupported model changes',async()=>{
  mocks.generate.mockResolvedValue({output:{message:'Done',actions:[{kind:'execute-sql',sql:'delete from tasks'}]}});
  expect((await POST(request())).status).toBe(502);
  expect(mocks.rpc.mock.calls.filter(call=>call[0]==='planner_ai_store_proposal')).toHaveLength(0);
 });
});



it('previews project, child, existing edits, and routine without applying commands',async()=>{
 const task={id:'61300000-0000-0000-0000-000000000003',title:'Original',version:'61300000-0000-0000-0000-000000000004',estimate_minutes:20,due_date:null,project_id:null};
 const project={id:'61300000-0000-0000-0000-000000000005',name:'Original project',version:'61300000-0000-0000-0000-000000000006'};
 mocks.from.mockImplementation((table:string)=>{const data=table==='tasks'?[task]:table==='projects'?[project]:table==='profiles'?{timezone:'UTC'}:null;const query={select:()=>query,eq:()=>query,is:()=>query,order:()=>query,limit:()=>query,single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return query;});
 mocks.generate.mockResolvedValue({output:{message:'Review all changes',actions:[
  {kind:'project-create',key:'house',name:'Household'},
  {kind:'task-create',title:'Buy tea',estimateMinutes:15,dueDate:null,projectId:null,projectKey:'house'},
  {kind:'task-edit',targetId:task.id,changes:{title:'Updated'}},
  {kind:'project-edit',targetId:project.id,name:'Updated project'},
  {kind:'routine-create',title:'Morning walk',date:'2030-01-01',startTime:'08:00',endTime:'08:30',timezone:'UTC',protected:false,frequency:'weekly',daysOfWeek:[1,2,3,4,5]},
 ]}});
 const response=await POST(request());expect(response.status).toBe(200);const {items}= (await response.json()).proposal.body;
 expect(items[1].projectItemId).toBe(items[0].id);expect(items[2]).toMatchObject({targetId:task.id,expectedVersion:task.version,before:task,changes:{title:'Updated'}});expect(items[3]).toMatchObject({expectedVersion:project.version,before:project});expect(items[4].changes.rule).toEqual({frequency:'weekly',interval:1,days_of_week:[1,2,3,4,5]});
 expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['check_ai_chat_rate_limit','planner_ai_store_proposal']);
});
it('returns a clarification with no material changes and rejects invalid civil dates',async()=>{
 mocks.generate.mockResolvedValueOnce({output:{message:'任务完成了，还是只结束本次工作？',actions:[]}});
 const response=await POST(request({locale:'zh'}));expect((await response.json()).proposal.body.items).toEqual([]);
 expect(mocks.generate.mock.calls[0][0].system).toContain('Simplified Chinese');expect(mocks.generate.mock.calls[0][0].system).toContain('current local date:');
 mocks.generate.mockResolvedValueOnce({output:{message:'Bad date',actions:[{kind:'task-create',title:'Tea',estimateMinutes:null,dueDate:'2027-02-31',projectId:null,projectKey:null}]}});
 expect((await POST(request())).status).toBe(502);expect(mocks.rpc.mock.calls.filter(call=>call[0]==='planner_ai_store_proposal')).toHaveLength(1);
});
