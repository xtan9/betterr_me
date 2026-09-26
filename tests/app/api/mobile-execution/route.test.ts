import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),rate:vi.fn(),window:vi.fn(),recommend:vi.fn(),rpc:vi.fn(),from:vi.fn(),eq:vi.fn(),previous:null as unknown}));
vi.mock('@/lib/auth/native-request',()=>({authenticateNativeRequest:mocks.auth}));
vi.mock('@/lib/ai/rate-limit',()=>({checkChatRateLimit:mocks.rate}));
vi.mock('@/lib/ai/assistant-execution',()=>({currentExecutionWindow:mocks.window,executionRecommendation:mocks.recommend}));
import {POST} from '@/app/api/mobile/execution/route';
const taskId='11111111-1111-4111-8111-111111111111',version='22222222-2222-4222-8222-222222222222';
const request=(input:object)=>new Request('https://example.test/api/mobile/execution',{method:'POST',body:JSON.stringify(input)});
const body={operation:'start',consent:true,available:true,operationId:'33333333-3333-4333-8333-333333333333',taskId,expectedVersion:version,until:'2030-01-01T10:10:00Z',end:'2030-01-01T10:30:00Z',excluded:[]};
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-01T10:00:00Z'));mocks.previous=null;
 mocks.auth.mockResolvedValue({userId:'owner',client:{rpc:mocks.rpc,from:mocks.from}});mocks.rate.mockResolvedValue({allowed:true});
 mocks.window.mockResolvedValue({end:'2030-01-01T10:30:00Z',requiresConfirmation:true});
 mocks.recommend.mockResolvedValue({selected:{id:taskId,version,estimate_minutes:10},window:{end:body.end},generatedAt:'2030-01-01T10:00:00Z'});
 mocks.rpc.mockResolvedValue({data:{status:'complete'},error:null});
 mocks.from.mockImplementation(()=>{const q={select:()=>q,eq:(...args:unknown[])=>{mocks.eq(...args);return q;},maybeSingle:async()=>({data:mocks.previous,error:null})};return q;});
});
it('offers a read-only window without requiring manual times or applying anything',async()=>{
 expect((await POST(request({operation:'window',consent:true}))).status).toBe(200);expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.recommend).not.toHaveBeenCalled();
});
it('requires explicit availability and authenticated identity',async()=>{
 expect((await POST(request({...body,available:false}))).status).toBe(400);
 mocks.auth.mockResolvedValue(null);expect((await POST(request(body))).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(['owner-a','owner-b'])('records only a fresh selected owner task for %s',async userId=>{
 mocks.auth.mockResolvedValue({userId,client:{rpc:mocks.rpc,from:mocks.from}});
 expect((await POST(request(body))).status).toBe(200);expect(mocks.eq).toHaveBeenCalledWith('user_id',userId);
 expect(mocks.recommend).toHaveBeenCalledWith(expect.anything(),userId,Date.parse(body.end),[],Date.now());
 expect(mocks.rpc).toHaveBeenCalledWith('assistant_execution_command',{p_request:{operation:'start',operationId:body.operationId,taskId,expectedVersion:version,until:body.until}});
});
it('rejects changed selection and expired windows without writing',async()=>{
 mocks.recommend.mockResolvedValue({selected:null});expect((await POST(request(body))).status).toBe(409);
 expect((await POST(request({...body,end:'2030-01-01T09:59:00Z'}))).status).toBe(409);expect(mocks.rpc).not.toHaveBeenCalled();
});
it('replays a completed command after its window expired, before reselecting',async()=>{
 mocks.previous={request:{}};mocks.rpc.mockResolvedValue({data:{status:'already-applied'}});vi.setSystemTime(new Date('2030-01-02T10:00:00Z'));
 expect((await POST(request(body))).status).toBe(200);expect(mocks.recommend).not.toHaveBeenCalled();expect(mocks.rate).not.toHaveBeenCalled();
});
it('fails safely without exposing private database failures',async()=>{
 mocks.recommend.mockRejectedValue(new Error('private task title'));const response=await POST(request(body));expect(response.status).toBe(503);expect(await response.text()).not.toContain('private task');expect(mocks.rpc).not.toHaveBeenCalled();
});
