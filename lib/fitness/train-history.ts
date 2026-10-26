import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { log } from '@/lib/logger';
import { historyId, historyRequestSchema, historyAcceptedSchema, historyRejectedSchema, historyRejectionStatus, historyListRequest, historyPageSchema, historyDetailSchema, historyProgressRequest, historyProgressSchema, type HistoryCursor, type HistoryScope } from '@/lib/validations/train-history';
export type { HistoryRecord,HistoryRequest,HistoryReceipt,HistoryRejection,HistoryPage,HistoryProgress } from '@/lib/validations/train-history';
export const historyHeaders = { 'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS' };
export function historyFailure(code:string,status:number){return Response.json({protocolVersion:1,error:{code}},{status,headers:historyHeaders});}
export function historyUnavailable(classification:'rpc_error'|'invalid_rpc_response'|'unexpected_exception'){
  log.error('[train] History request unavailable',undefined,{classification});return historyFailure('unavailable',503);
}
function owned(records:Array<{ownerId:string}>,owner:string){return records.every(record=>record.ownerId===owner);}
export class HistoryReadError extends Error { constructor(readonly code:string){super(code);} }
async function rpc(client:SupabaseClient,name:string,args:Record<string,unknown>={}){
  const {data,error}=await client.rpc(name,args);if(error)throw new HistoryReadError('rpc_error');return data;
}
export async function readCurrentHistory(client:SupabaseClient,owner:string,before:HistoryCursor|null=null){
  const data=await rpc(client,'list_train_history',{p_before:before});if(data?.status==='not_ready')return null;
  const value=historyPageSchema.safeParse(data);
  if(!value.success||value.data.ownerId!==owner||!owned(value.data.records,owner)||value.data.records.some(row=>row.state!=='alive'))throw new HistoryReadError('invalid_rpc_response');
  return value.data;
}
export async function readCurrentRecord(client:SupabaseClient,owner:string,id:string){
  const data=await rpc(client,'read_train_history_record',{p_id:id});
  if(data?.status==='not_ready')return undefined;if(data?.status==='not_found')return null;
  const value=historyDetailSchema.safeParse(data);
  if(!value.success||value.data.record.ownerId!==owner||value.data.record.id!==id)throw new HistoryReadError('invalid_rpc_response');return value.data.record;
}
export async function readCurrentProgress(client:SupabaseClient,owner:string,scope:HistoryScope={from:null,through:null},retainedIds:string[]=[]){
  const data=await rpc(client,'train_history_progress',{p_scope:scope,p_retained_ids:retainedIds});if(data?.status==='not_ready')return null;
  const value=historyProgressSchema.safeParse(data);
  if(!value.success||value.data.ownerId!==owner||(value.data.scope.from!==scope.from||value.data.scope.through!==scope.through)||!owned(value.data.records,owner)
    ||value.data.resolved.length!==retainedIds.length||value.data.resolved.some((item,index)=>item.id!==retainedIds[index]||item.record!==null&&(item.record.id!==item.id||item.record.ownerId!==owner)))throw new HistoryReadError('invalid_rpc_response');return value.data;
}
export async function executeHistoryCommand(request:Request,client:SupabaseClient,owner:string){
  const body:unknown=await request.json().catch(()=>null);const parsed=historyRequestSchema.safeParse(body);
  if(!parsed.success)return historyFailure('invalid_request',400);const input=parsed.data;
  if(input.ownerId!==owner)return historyFailure('owner_mismatch',403);
  const {data,error}=await client.rpc('execute_train_history_command',{p_request:body});if(error)return historyUnavailable('rpc_error');
  const accepted=historyAcceptedSchema.safeParse(data),rejected=historyRejectedSchema.safeParse(data);
  const outcome=accepted.success?accepted.data.receipt:rejected.success?rejected.data.rejection:undefined;
  if(outcome){
    if(outcome.ownerId!==owner||outcome.operationId!==input.operationId||outcome.operation!==input.command.kind||outcome.workoutId!==input.command.workoutId
      ||accepted.success&&BigInt(accepted.data.receipt.revision)!==BigInt(input.command.expectedRevision)+BigInt(1))return historyUnavailable('invalid_rpc_response');
    return Response.json(data,{status:accepted.success?200:historyRejectionStatus[rejected.success?rejected.data.rejection.code:'invalid_correction'],headers:historyHeaders});
  }
  const statuses:Record<string,number>={not_ready:503,unauthenticated:401,owner_mismatch:403,invalid_request:400,operation_conflict:409};
  return typeof data?.status==='string'&&Object.hasOwn(statuses,data.status)&&data.receipt===undefined&&data.rejection===undefined?historyFailure(data.status,statuses[data.status]):historyUnavailable('invalid_rpc_response');
}
export async function historyReadResponse(kind:'list'|'detail'|'progress'|'capabilities',request:Request,client:SupabaseClient,owner:string,id?:string){
  try{
    if(kind==='capabilities'){
      const data=await rpc(client,'train_history_capabilities');
      if(!z.object({protocolVersion:z.literal(1),historyReady:z.boolean()}).strict().safeParse(data).success)throw new HistoryReadError('invalid_rpc_response');
      return Response.json(data,{headers:historyHeaders});
    }
    if(kind==='detail'){
      if(!historyId.safeParse(id).success)return historyFailure('invalid_request',400);
      const record=await readCurrentRecord(client,owner,id!);return record===undefined?historyFailure('not_ready',503):record===null?historyFailure('not_found',404):Response.json({protocolVersion:1,record},{headers:historyHeaders});
    }
    const body:unknown=await request.json().catch(()=>null),parsed=(kind==='list'?historyListRequest:historyProgressRequest).safeParse(body);
    if(!parsed.success)return historyFailure('invalid_request',400);if(parsed.data.ownerId!==owner)return historyFailure('owner_mismatch',403);
    const result='before'in parsed.data?await readCurrentHistory(client,owner,parsed.data.before):await readCurrentProgress(client,owner,parsed.data.scope,parsed.data.retainedIds);
    return result===null?historyFailure('not_ready',503):Response.json(result,{headers:historyHeaders});
  }catch(error){return historyUnavailable(error instanceof HistoryReadError?error.code as 'rpc_error'|'invalid_rpc_response':'unexpected_exception');}
}
