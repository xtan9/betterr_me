// @vitest-environment node
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),external:vi.fn(),rpc:vi.fn(),single:vi.fn(),eq:vi.fn(),log:vi.fn()}));
vi.mock('@/lib/auth/native-request',()=>({authenticateNativeRequest:mocks.auth}));
vi.mock('@/lib/google/planning',()=>({googleDayRange:mocks.external}));
vi.mock('@/lib/logger',()=>({log:{error:mocks.log}}));
import {POST} from '@/app/api/mobile/assistant/command/route';

const id='70000000-0000-0000-0000-000000000003';
const schedule={startDate:'2030-01-01',endDate:'2030-01-01',startTime:'21:00',endTime:'21:30',timezone:'America/Los_Angeles',durationSource:'default'};
const body={message:'Review task time',contextVersion:id,items:[{id,kind:'task-create',changes:{title:'Check doors',estimate_minutes:null,due_date:null},schedule}]};
const command={operation:'accept',operationId:id,proposalId:id,expectedVersion:id,supportsTimedTasks:true};
const request=(changes:Record<string,unknown>={})=>new Request('https://backend.test/api/mobile/assistant/command',{method:'POST',body:JSON.stringify({...command,...changes})});
beforeEach(()=>{
 vi.clearAllMocks();const query={select:()=>query,eq:mocks.eq,maybeSingle:mocks.single};mocks.eq.mockReturnValue(query);
 mocks.auth.mockResolvedValue({userId:'owner',client:{from:()=>query,rpc:mocks.rpc}});
 mocks.single.mockResolvedValue({data:{body,state:'pending',version:id,proposal_type:'capture'},error:null});
 mocks.external.mockReset().mockResolvedValue([]);mocks.rpc.mockResolvedValue({data:{status:'complete'},error:null});
});

it('blocks a Google event added after the task preview before applying any records',async()=>{
 mocks.external.mockResolvedValue([{id:'external',title:'Private external event',start_date:'2030-01-02',end_date:'2030-01-02',start_time:'05:15',end_time:'06:00',timezone:'UTC',is_recurring:false}]);
 const response=await POST(request());expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'conflict'});expect(mocks.rpc).not.toHaveBeenCalled();
 expect(mocks.eq).toHaveBeenCalledWith('user_id','owner');
});

it('rechecks an explicit timezone across a UTC date boundary',async()=>{
 const tokyo={...schedule,startTime:'00:15',endTime:'00:45',timezone:'Asia/Tokyo'};
 mocks.single.mockResolvedValue({data:{body:{...body,items:[{...body.items[0],schedule:tokyo}]},state:'pending',version:id,proposal_type:'capture'}});
 mocks.external.mockImplementation(async(_owner:string,startDate:string,endDate:string,timezone:string)=>timezone==='Asia/Tokyo'&&startDate==='2030-01-01'&&endDate==='2030-01-01'
  ?[{id:'external',title:'Private appointment',start_date:'2029-12-31',end_date:'2029-12-31',start_time:'15:10',end_time:'16:00',timezone:'UTC',is_recurring:false}]:[]);
 expect((await POST(request())).status).toBe(409);expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each(['accepted','rejected'])('replays an already %s command unchanged even when Google is unavailable',async(state)=>{
 mocks.single.mockResolvedValue({data:{body,state,version:'changed',proposal_type:'capture'},error:null});
 mocks.external.mockRejectedValue(new Error('Private credentials must not be read'));
 mocks.rpc.mockResolvedValue({data:{status:'already-applied',proposalId:id,results:[{itemId:id,recordId:id}]},error:null});
 const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toMatchObject({status:'already-applied'});
 expect(mocks.external).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledWith('planner_ai_proposal_command',{p_request:command});
});

it('fails closed when external occupancy is unavailable without leaking the underlying error',async()=>{
 mocks.external.mockRejectedValueOnce(new Error('Private appointment and credential details'));
 const response=await POST(request());expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'unavailable'});expect(mocks.rpc).not.toHaveBeenCalled();
 expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('Private');
});

it('applies the exact command after verifying the interval, and rejects without external reads',async()=>{
 const accepted=await POST(request());expect(accepted.status).toBe(200);expect(await accepted.json()).toEqual({status:'complete'});
 expect(mocks.rpc).toHaveBeenCalledWith('planner_ai_proposal_command',{p_request:command});
 mocks.external.mockClear();mocks.rpc.mockClear();
 expect((await POST(request({operation:'reject'}))).status).toBe(200);expect(mocks.external).not.toHaveBeenCalled();
 expect(mocks.rpc).toHaveBeenCalledWith('planner_ai_proposal_command',{p_request:{...command,operation:'reject'}});
});

it('revalidates the same explicit decision without generating a new preview',async()=>{
 const response=await POST(request({revalidate:true}));
 expect(response.status).toBe(200);expect(await response.json()).toEqual({status:'complete'});
 expect(mocks.rpc).toHaveBeenCalledWith('planner_ai_proposal_command',{p_request:{...command,revalidate:true}});
 expect(mocks.external).toHaveBeenCalledWith('owner','2030-01-01','2030-01-01','America/Los_Angeles');
});

it('requires a verified owner, correct pending version and timed-preview capability before external reads or writes',async()=>{
 mocks.auth.mockResolvedValueOnce(null);expect((await POST(request())).status).toBe(401);
 expect((await POST(request({expectedVersion:'70000000-0000-0000-0000-000000000004'}))).status).toBe(409);
 expect((await POST(request({supportsTimedTasks:undefined}))).status).toBe(400);
 expect(mocks.external).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});

it('rejects malformed commands and oversized bodies before database mutations',async()=>{
 expect((await POST(request({unexpected:'private'}))).status).toBe(400);
 expect((await POST(new Request('https://backend.test/api/mobile/assistant/command',{method:'POST',body:'{'}))).status).toBe(400);
 expect((await POST(new Request('https://backend.test/api/mobile/assistant/command',{method:'POST',body:' '.repeat(4097)}))).status).toBe(413);
 expect(mocks.rpc).not.toHaveBeenCalled();
});

it('fails closed for malformed persisted timing and database failures',async()=>{
 mocks.single.mockResolvedValueOnce({data:{body:{...body,items:[{...body.items[0],schedule:{...schedule,endTime:'21:00'}}]},state:'pending',version:id,proposal_type:'capture'}});
 expect((await POST(request())).status).toBe(503);expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValueOnce({data:null,error:{message:'Private database context'}});
 const response=await POST(request());expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'unavailable'});
 expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('Private');
});
it('requires training capability and accepts the exact date-only plan without consulting calendar availability',async()=>{
 const training={message:'Train legs today',items:[{id,kind:'training-create',changes:{title:'Leg day',date:'2030-01-01',timezone:'America/Los_Angeles',trainingTemplateId:null}}]};
 mocks.single.mockResolvedValue({data:{body:training,state:'pending',version:id,proposal_type:'capture'},error:null});
 expect((await POST(request())).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
 const result=await POST(request({supportsTrainingPlans:true}));expect(result.status).toBe(200);
 expect(mocks.external).not.toHaveBeenCalled();
 expect(mocks.rpc).toHaveBeenCalledWith('planner_ai_proposal_command',{p_request:{...command,supportsTrainingPlans:true}});
});
it('rechecks an explicit training interval and retains already-applied receipt replay during an outage',async()=>{
 const training={message:'Training',items:[{id,kind:'training-create',changes:{title:'Leg day',date:'2030-01-01',timezone:'America/Los_Angeles',trainingTemplateId:null,startTime:'21:00',endTime:'22:00',protected:true}}]};
 mocks.single.mockResolvedValue({data:{body:training,state:'pending',version:id,proposal_type:'capture'},error:null});
 mocks.external.mockResolvedValue([{id:'busy',title:'Private event',start_date:'2030-01-02',end_date:'2030-01-02',start_time:'05:30',end_time:'06:00',timezone:'UTC',is_recurring:false}]);
 expect((await POST(request({supportsTrainingPlans:true}))).status).toBe(409);expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.single.mockResolvedValue({data:{body:training,state:'accepted',version:id,proposal_type:'capture'},error:null});mocks.external.mockClear().mockRejectedValue(new Error('Unavailable'));
 mocks.rpc.mockResolvedValue({data:{status:'already-applied',results:[{itemId:id,kind:'training-create',recordId:id,seriesId:id}]},error:null});
 const replay=await POST(request({supportsTrainingPlans:true}));expect(replay.status).toBe(200);expect((await replay.json()).results[0]).toMatchObject({kind:'training-create',recordId:id});expect(mocks.external).not.toHaveBeenCalled();
});
