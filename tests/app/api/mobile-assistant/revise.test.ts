// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),external:vi.fn(),rpc:vi.fn(),single:vi.fn(),queryLog:[] as unknown[],log:vi.fn()}));
vi.mock('@/lib/auth/native-request',()=>({authenticateNativeRequest:mocks.auth}));
vi.mock('@/lib/google/planning',()=>({googleDayRange:mocks.external}));
vi.mock('@/lib/logger',()=>({log:{error:mocks.log}}));
import {POST} from '@/app/api/mobile/assistant/revise/route';

const sourceId='72800000-0000-0000-0000-000000000001',version='72800000-0000-0000-0000-000000000002',requestId='72800000-0000-0000-0000-000000000003',conversationId='72800000-0000-0000-0000-000000000004';
const revision={requestId,conversationId,proposalId:sourceId,expectedVersion:version,locale:'zh',changes:{title:'喝水'}};
const response={message:'请确认更新后的任务。',conversationId,intent:'capture',supersededCaptureProposalId:sourceId,proposal:{id:requestId}};
const request=(overrides:Record<string,unknown>={})=>new Request('https://backend.test/api/mobile/assistant/revise',{method:'POST',body:JSON.stringify({...revision,...overrides})});
beforeEach(()=>{
 vi.clearAllMocks();mocks.queryLog=[];
 const query={select:(...args:unknown[])=>{mocks.queryLog.push(['select',...args]);return query;},eq:(...args:unknown[])=>{mocks.queryLog.push(['eq',...args]);return query;},maybeSingle:mocks.single};
 mocks.auth.mockResolvedValue({userId:'owner',client:{from:(table:string)=>{mocks.queryLog.push(['from',table]);return query;},rpc:mocks.rpc}});
 mocks.single.mockResolvedValue({data:{body:{items:[{id:sourceId,kind:'task-create',changes:{title:'Drink water'}}]},state:'pending',version,proposal_type:'capture'},error:null});
 mocks.external.mockReset().mockResolvedValue([]);mocks.rpc.mockResolvedValue({data:{status:'complete',response},error:null});
});

it('revises one exact pending task without running a model or creating the task',async()=>{
 const result=await POST(request());expect(result.status).toBe(200);expect(await result.json()).toEqual(response);
 expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.rpc).toHaveBeenCalledWith('planner_ai_revise_capture',{p_request:revision});
 expect(mocks.external).not.toHaveBeenCalled();
 expect(mocks.queryLog).toEqual([['from','planner_ai_proposals'],['select','body,state,version,proposal_type'],['eq','user_id','owner'],['eq','id',sourceId]]);
});

const schedule={startDate:'2030-01-01',endDate:'2030-01-01',startTime:'21:00',endTime:'21:30',timezone:'America/Los_Angeles',durationSource:'default'};
it('checks the revised exact interval, retains omitted scheduling, and clears only an explicit null schedule',async()=>{
 mocks.single.mockResolvedValue({data:{body:{items:[{id:sourceId,kind:'task-create',changes:{title:'Task'},schedule}]},state:'pending',version,proposal_type:'capture'}});
 expect((await POST(request())).status).toBe(200);
 expect(mocks.external).toHaveBeenCalledExactlyOnceWith('owner','2030-01-01','2030-01-01','America/Los_Angeles');
 mocks.external.mockClear();
 expect((await POST(request({schedule:null}))).status).toBe(200);expect(mocks.external).not.toHaveBeenCalled();
 expect(mocks.rpc).toHaveBeenLastCalledWith('planner_ai_revise_capture',{p_request:{...revision,schedule:null}});
 const changed={...schedule,startTime:'22:00',endTime:'22:30',durationSource:'explicit'};
 mocks.external.mockResolvedValue([{id:'busy',title:'Private event',start_date:'2030-01-02',end_date:'2030-01-02',start_time:'06:15',end_time:'06:45',timezone:'UTC',is_recurring:false}]);
 mocks.rpc.mockClear();
 const conflict=await POST(request({schedule:changed}));expect(conflict.status).toBe(409);expect(await conflict.json()).toEqual({error:'conflict'});expect(mocks.rpc).not.toHaveBeenCalled();
});

it('replays completed revision identity without depending on external availability',async()=>{
 mocks.single.mockResolvedValue({data:{state:'rejected',version:'new-version',proposal_type:'capture'},error:null});
 mocks.external.mockRejectedValue(new Error('Must not run on replay'));
 const result=await POST(request({schedule}));expect(result.status).toBe(200);expect(await result.json()).toEqual(response);
 expect(mocks.external).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledWith('planner_ai_revise_capture',{p_request:{...revision,schedule}});
});

it.each([['past-time',409],['conflict',409],['not-found',409],['invalid',400],['unexpected',503]] as const)('returns definitive %s without hiding it as an uncertain outcome',async(status,code)=>{
 mocks.rpc.mockResolvedValue({data:{status},error:null});
 const result=await POST(request());expect(result.status).toBe(code);expect(await result.json()).toEqual({error:status==='not-found'?'conflict':status==='unexpected'?'unavailable':status});
});

it('rejects unauthenticated, malformed, oversized and unsupported edits before mutations',async()=>{
 mocks.auth.mockResolvedValueOnce(null);expect((await POST(request())).status).toBe(401);
 for(const extra of [{unexpected:true},{requestId:sourceId},{changes:{title:'Task',projectId:sourceId}},{changes:{title:'Task',due_date:'2030-02-31'}},{schedule:{...schedule,endTime:'21:00'}}])expect((await POST(request(extra))).status).toBe(400);
 expect((await POST(new Request('https://backend.test/api/mobile/assistant/revise',{method:'POST',body:' '.repeat(8193)}))).status).toBe(413);
 mocks.single.mockResolvedValueOnce({data:{body:{items:[{kind:'task-edit'}]},state:'pending',version,proposal_type:'capture'}});
 expect((await POST(request())).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
});

it('keeps read, calendar and database failures uncertain without disclosing private details',async()=>{
 mocks.single.mockResolvedValueOnce({data:null,error:{message:'Private contents'}});
 expect((await POST(request())).status).toBe(503);expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.external.mockRejectedValueOnce(new Error('Private contents'));
 const unavailable=await POST(request({schedule}));expect(unavailable.status).toBe(503);expect(await unavailable.json()).toEqual({error:'unavailable'});expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValueOnce({data:null,error:{message:'Private contents'}});
 expect((await POST(request())).status).toBe(503);expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('Private contents');
});
it('revises a date-only training plan through its exact durable proposal without inventing task fields',async()=>{
 const changes={title:'练腿',date:'2030-01-02',timezone:'America/Los_Angeles',trainingTemplateId:null};
 mocks.single.mockResolvedValue({data:{body:{items:[{id:sourceId,kind:'training-create',changes}]},state:'pending',version,proposal_type:'capture'},error:null});
 expect((await POST(request({changes}))).status).toBe(400);
 const result=await POST(request({supportsTrainingPlans:true,changes}));expect(result.status).toBe(200);expect(await result.json()).toEqual(response);
 expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('planner_ai_revise_capture',{p_request:{...revision,supportsTrainingPlans:true,changes}});
 expect(mocks.external).not.toHaveBeenCalled();
});
it('retains omitted training times and removes a reservation only when both times are explicitly cleared',async()=>{
 const changes={title:'Leg day',date:'2030-01-02',timezone:'America/Los_Angeles',trainingTemplateId:null};
 mocks.single.mockResolvedValue({data:{body:{items:[{kind:'training-create',changes:{...changes,startTime:'21:00',endTime:'22:00',protected:true}}]},state:'pending',version,proposal_type:'capture'},error:null});
 expect((await POST(request({supportsTrainingPlans:true,changes}))).status).toBe(200);
 expect(mocks.external).toHaveBeenCalledExactlyOnceWith('owner','2030-01-02','2030-01-02','America/Los_Angeles');mocks.external.mockClear();
 expect((await POST(request({supportsTrainingPlans:true,changes:{...changes,startTime:null,endTime:null}}))).status).toBe(200);expect(mocks.external).not.toHaveBeenCalled();
 expect((await POST(request({supportsTrainingPlans:true,changes:{...changes,startTime:null}}))).status).toBe(400);
 expect((await POST(request({supportsTrainingPlans:true,changes:{...changes,startTime:'21:00',endTime:'21:00'}}))).status).toBe(400);
});
