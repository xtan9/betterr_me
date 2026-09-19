import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({generate:vi.fn(),rpc:vi.fn(),from:vi.fn(),tasks:[] as unknown[],events:[] as unknown[]}));
vi.mock('ai',()=>({generateText:mocks.generate}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:mocks.rpc,from:mocks.from})}));
import {POST} from '@/app/api/mobile/next-action/route';
const task=(id:string,estimate:number,reasons:string[]=[])=>({id,title:id,version:'v',estimate_minutes:estimate,facts:{actionable:reasons.length===0,reasons,fitsGap:reasons.length===0},rules:{waiting:false}});
const request=(extra:Record<string,unknown>={})=>new Request('https://betterr.me/api/mobile/next-action',{method:'POST',headers:{Authorization:'Bearer native'},body:JSON.stringify({consent:true,available:true,locale:'en',start:'2030-01-01T10:00:00Z',end:'2030-01-01T11:20:00Z',context:'I have energy for focused work',...extra})});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('LLM_API_KEY','controlled');vi.stubEnv('LLM_MODEL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','public');vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-01T10:00:00Z'));
 mocks.tasks=[task('oversized',120,['gap-too-short']),task('waiting',20,['waiting']),task('priority',30),task('queue-first',10)];mocks.events=[];
 mocks.generate.mockResolvedValue({text:'The saved priority fits the confirmed interval.'});
 mocks.rpc.mockImplementation(async(name:string)=>({data:name==='check_ai_chat_rate_limit'?[{allowed:true,minute_remaining:5,day_remaining:50}]:name==='priority_snapshot'?{taskIds:['oversized','waiting','priority']}:name==='action_queue_snapshot'?{queue:['queue-first','priority'],tasks:mocks.tasks}:null,error:null}));
 mocks.from.mockImplementation((table:string)=>{const data=table==='profiles'?{timezone:'UTC'}:table==='calendar_events'?mocks.events:table==='tasks'?mocks.tasks.map(value=>({...value as object,due_date:null})):[];const q={select:()=>q,eq:()=>q,is:()=>q,order:()=>q,range:()=>q,single:async()=>({data,error:null}),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};return q;});
});
it('prefers saved actionable priorities and explains oversized and waiting skips without writes',async()=>{
 const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();expect(body.selected.id).toBe('priority');expect(body.skipped).toEqual(expect.arrayContaining([expect.objectContaining({id:'oversized',reasons:expect.arrayContaining(['gap-too-short'])}),expect.objectContaining({id:'waiting',reasons:expect.arrayContaining(['waiting'])})]));expect(mocks.rpc.mock.calls.every(([name])=>['check_ai_chat_rate_limit','action_queue_snapshot','priority_snapshot'].includes(name))).toBe(true);expect(mocks.generate.mock.calls[0][0]).not.toHaveProperty('tools');
});
it.each(['gpt-5.3-codex-spark','gpt-5.4-mini'])('ignores obsolete environment model %s and uses the supported gateway model',async(obsoleteModel)=>{
 vi.stubEnv('LLM_MODEL',obsoleteModel);
 expect((await POST(request())).status).toBe(200);
 expect(mocks.generate.mock.calls[0][0].model.modelId).toBe('gpt-5.5');
});
it('does not interpret unconfirmed empty calendar time as availability',async()=>{expect((await POST(request({available:false}))).status).toBe(400);expect(mocks.generate).not.toHaveBeenCalled();});

it('cuts the gap at an occupied commitment and never splits work to force a fit',async()=>{
 mocks.events=[{id:'fixed',title:'Care commitment',start_date:'2030-01-01',end_date:'2030-01-01',start_time:'10:20:00',end_time:'11:00:00',timezone:'UTC',is_recurring:false}];
 const response=await POST(request());expect(response.status).toBe(200);const body=await response.json();expect(body.selected.id).toBe('queue-first');expect(body.window.gapMinutes).toBe(20);expect(body.skipped.find((task:{id:string})=>task.id==='priority').reasons).toContain('gap-too-short');
});
it('recomputes after completion and released reservations, without reordering the saved queue',async()=>{
 mocks.events=[{id:'reservation',title:'Work',start_date:'2030-01-01',end_date:'2030-01-01',start_time:'09:00:00',end_time:'11:00:00',timezone:'UTC',is_recurring:false}];
 expect((await (await POST(request())).json()).selected).toBeNull();
 mocks.events=[];mocks.tasks=[task('priority',30,['completed']),task('queue-first',10)];
 const body=await (await POST(request({locale:'zh'}))).json();expect(body.selected.id).toBe('queue-first');expect(mocks.generate.mock.calls.at(-1)?.[0].system).toContain('Simplified Chinese');
});
it('rejects a suggestion when the task becomes completed during model generation',async()=>{
 mocks.generate.mockImplementationOnce(async()=>{mocks.tasks=[task('priority',30,['completed']),task('queue-first',10)];return {text:'Old suggestion'};});
 expect((await POST(request())).status).toBe(409);
});
it('keeps manual fallback honest on provider loss and does not send without AI consent',async()=>{
 expect((await POST(request({consent:false}))).status).toBe(400);expect(mocks.generate).not.toHaveBeenCalled();
 mocks.generate.mockRejectedValueOnce(new Error('private context'));const response=await POST(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain('private context');
});
