import {beforeEach,describe,expect,it,vi} from 'vitest';
import {POST as command} from '@/app/api/mobile/train/history/commands/route';
import {POST as list} from '@/app/api/mobile/train/history/route';
import {POST as progress} from '@/app/api/mobile/train/history/progress/route';
import {GET as detail} from '@/app/api/mobile/train/history/[id]/route';
import {authenticateNativeRequest} from '@/lib/auth/native-request';
import {log} from '@/lib/logger';
import contract from '@/tests/fixtures/train-history-contract.json';
vi.mock('@/lib/auth/native-request',()=>({authenticateNativeRequest:vi.fn()}));
vi.mock('@/lib/logger',()=>({log:{error:vi.fn()}}));
const owner=contract.completion.ownerId;
const rpc=vi.fn();
const req=(body:unknown)=>new Request('https://example.test/api/mobile/train/history',{method:'POST',body:JSON.stringify(body),headers:{Authorization:'Bearer controlled-boundary','Content-Type':'application/json'}});
const record=contract.record;
describe('current history HTTP boundary',()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.mocked(authenticateNativeRequest).mockResolvedValue({userId:owner,client:{rpc}} as never);});
 it('returns date-only current authority and exact cursors without inventing time',async()=>{
  const page={protocolVersion:1,ownerId:owner,records:[record],nextCursor:null};rpc.mockResolvedValue({data:page,error:null});
  const response=await list(req({protocolVersion:1,ownerId:owner,before:null}));expect(response.status).toBe(200);expect(await response.json()).toEqual(page);
  expect(rpc).toHaveBeenCalledExactlyOnceWith('list_train_history',{p_before:null});
  rpc.mockResolvedValue({data:{protocolVersion:1,record:{...record,state:'deleted',current:null}},error:null});
  expect((await (await detail(new Request('https://example.test'),{params:Promise.resolve({id:record.id})})).json()).record.state).toBe('deleted');
 });
 it('keeps accepted and rejected first outcomes distinct; never acknowledges a transient error',async()=>{
  const request=contract.correction;
  const current={...record,revision:'2'};
  const receipt={operation:request.command.kind,operationId:request.operationId,ownerId:owner,workoutId:record.id,revision:'2',acceptedAt:'2026-10-26T10:00:00.123456Z',current};
  rpc.mockResolvedValueOnce({data:{protocolVersion:1,receipt},error:null});
  expect(await(await command(req(request))).json()).toEqual({protocolVersion:1,receipt});
  const rejection={operation:request.command.kind,operationId:request.operationId,ownerId:owner,workoutId:record.id,code:'version_conflict',rejectedAt:'2026-10-26T10:00:00Z',current};
  rpc.mockResolvedValueOnce({data:{protocolVersion:1,error:{code:'version_conflict'},rejection},error:null});
  const conflict=await command(req(request));expect(conflict.status).toBe(409);expect((await conflict.json()).rejection).toEqual(rejection);
  rpc.mockResolvedValueOnce({data:{status:'not_ready'},error:null});expect((await command(req(request))).status).toBe(503);
  rpc.mockResolvedValueOnce({data:null,error:{message:'private workout and token'}});expect((await command(req(request))).status).toBe(503);
  expect(log.error).toHaveBeenLastCalledWith('[train] History request unavailable',undefined,{classification:'rpc_error'});
 });
 it('rejects foreign principals, malformed patches and untrusted mismatched receipts',async()=>{
  expect((await command(req({...contract.correction,ownerId:'64250000-0000-4000-8000-000000000099'}))).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
  expect((await command(req({...contract.correction,command:{...contract.correction.command,patch:{sets:[{entryId:'invalid'}]}}}))).status).toBe(400);
  rpc.mockResolvedValue({data:{protocolVersion:1,record:{...record,ownerId:'64250000-0000-4000-8000-000000000099'}},error:null});
  expect((await detail(new Request('https://example.test'),{params:Promise.resolve({id:record.id})})).status).toBe(503);
  vi.mocked(authenticateNativeRequest).mockResolvedValue(null);expect((await command(req(contract.correction))).status).toBe(401);
 });
 it('requires complete owned progress and exact resolution of retained identities',async()=>{
  const body={protocolVersion:1,ownerId:owner,scope:{from:null,through:null},retainedIds:[record.id]};
  const response={...body,records:[record],resolved:[{id:record.id,record}],coverage:{complete:true,workoutCount:1,knownDurationCount:0,unknownDurationCount:1,knownDurationSeconds:'0',undatedWorkoutCount:0}};
  const {retainedIds:_,...data}=response;
  rpc.mockResolvedValueOnce({data,error:null});expect((await progress(req(body))).status).toBe(200);
  rpc.mockResolvedValueOnce({data:{...data,resolved:[]},error:null});expect((await progress(req(body))).status).toBe(503);
 });
 it('does not reflect outer failures or private RPC values',async()=>{
  vi.mocked(authenticateNativeRequest).mockRejectedValue(new Error('secret credential'));
  const response=await command(req(contract.correction));expect(response.status).toBe(503);expect(await response.json()).toEqual({protocolVersion:1,error:{code:'unavailable'}});
  expect(log.error).toHaveBeenCalledExactlyOnceWith('[train] History request unavailable',undefined,{classification:'unexpected_exception'});
 });
});
