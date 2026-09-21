// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
import {MockLanguageModelV3} from 'ai/test';
import {datedOutput} from '../../../fixtures/assistant/dated-output';
const m=vi.hoisted(()=>({provider:vi.fn(),rpc:vi.fn(),from:vi.fn(),error:vi.fn()}));
vi.mock('@/lib/ai/provider',()=>({llmProvider:m.provider,structuredOutputProviderOptions:{openai:{strictJsonSchema:false}}}));
vi.mock('@/lib/auth/native-request',()=>({authenticateNativeRequest:async()=>({userId:'61500000-0000-0000-0000-000000000001',client:{rpc:m.rpc,from:m.from}})}));
vi.mock('@/lib/ai/rate-limit',()=>({checkChatRateLimit:async()=>({allowed:true})}));
vi.mock('@/lib/logger',()=>({log:{error:m.error}}));
import {POST} from '@/app/api/mobile/planning/route';
const id='61500000-0000-0000-0000-000000000001';
const horizon={startDate:'2030-01-01',endDate:'2030-01-14',timezone:'UTC'};
const request=()=>new Request('https://example.test/api/mobile/planning',{method:'POST',body:JSON.stringify({requestId:id,consent:true,locale:'en',horizon,commitments:'',needs:'',goals:'',travelMinutes:null})});
function draft(count:number){
 const events=Array.from({length:count},(_,index)=>({date:new Date(Date.UTC(2030,0,1+Math.floor(index/20))).toISOString().slice(0,10),kind:'event-create',targetId:null,title:'PRIVATE reservation',startTime:`${String(index%20).padStart(2,'0')}:00`,endTime:`${String(index%20).padStart(2,'0')}:15`,taskId:null,taskItemIndex:null,protected:false,category:'other'}));
 return datedOutput({message:'Review the plan',questions:[],assumptions:[],capture:{message:'',actions:[]},events,priorityTaskIds:null},horizon);
}
const generated=(output:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(output)}],finishReason:{unified:'stop' as const,raw:'stop'},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}},warnings:[]});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('LLM_API_KEY','test-only');
 m.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null})};return q;});
 m.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>({error:null,data:name==='planner_horizon_context'?{version:id,timezone:'UTC',tasks:[],events:[],priorities:{version:null,taskIds:[]}}:{status:'complete',proposal:{body:args.p_body}}}));
});
it('uses real SDK schema validation to retry an over-budget draft before exact preview storage',async()=>{
 let calls=0;const model=new MockLanguageModelV3({doGenerate:async()=>generated(draft(++calls===1?201:200))});m.provider.mockReturnValue(model);
 const response=await POST(request());expect(response.status).toBe(200);
 expect((await response.json()).proposal.body.events).toHaveLength(200);expect(calls).toBe(2);
 expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toContain('too_big at days');
 expect(m.rpc.mock.calls.filter(call=>call[0]==='planner_schedule_store_proposal')).toHaveLength(1);
 expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_command')).toBe(false);expect(m.error).not.toHaveBeenCalled();
});
it('exhausts the shared retry without truncation, storage or private error content',async()=>{
 const model=new MockLanguageModelV3({doGenerate:async()=>generated(draft(201))});m.provider.mockReturnValue(model);
 const response=await POST(request());expect(response.status).toBe(502);expect(await response.json()).toEqual({error:'unavailable'});
 expect(model.doGenerateCalls).toHaveLength(2);expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);
 expect(m.error).toHaveBeenCalledWith('[mobile-planning] Request failed',undefined,expect.objectContaining({stage:'generation',failure:expect.objectContaining({validationCode:'too_big',validationPath:'days'})}));
 expect(JSON.stringify(m.error.mock.calls)).not.toContain('PRIVATE');
});
it('retains the safe first validation failure when regeneration aborts',async()=>{
 let calls=0;const model=new MockLanguageModelV3({doGenerate:async()=>{
  if(++calls===1)return generated(draft(201));
  throw new DOMException('PRIVATE provider response','AbortError');
 }});m.provider.mockReturnValue(model);
 const response=await POST(request());expect(response.status).toBe(502);expect(await response.json()).toEqual({error:'unavailable'});
 expect(calls).toBe(2);expect(m.rpc.mock.calls.some(call=>call[0]==='planner_schedule_store_proposal')).toBe(false);
 expect(m.error).toHaveBeenCalledWith('[mobile-planning] Request failed',undefined,expect.objectContaining({attempt:2,previousFailure:expect.objectContaining({validationCode:'too_big',validationPath:'days'}),failure:{name:'AbortError'}}));
 expect(JSON.stringify(m.error.mock.calls)).not.toContain('PRIVATE');
});
