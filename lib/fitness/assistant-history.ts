import type { ToolContext } from '@/lib/ai/tools/types';
import { WorkoutsDB } from '@/lib/db/workouts';
import { historyRequestSchema,historyAcceptedSchema,historyRejectedSchema } from '@/lib/validations/train-history';
function authorize(context:ToolContext,permission:'read'|'write'){
 if(context.principal?.credential==='mcp'&&(context.principal.type!=='user'||context.principal.userId!==context.userId||!context.permissions?.includes(permission)))throw new Error(`${permission} permission required`);
}
export function assistantWorkouts(context:ToolContext){
 authorize(context,'read');
 return context.principal?.credential==='mcp'?new WorkoutsDB(context.supabase,async(owner,id,limit,offset)=>{
  if(owner!==undefined&&owner!==context.userId)throw new Error('History owner mismatch');
  return context.supabase.rpc('mcp_train_history',{p_owner:context.userId,p_operation:'compat',p_request:{id,limit,offset}});
 }):new WorkoutsDB(context.supabase);
}
export async function assistantHistoryCommand(context:ToolContext,operationId:string,command:unknown){
 authorize(context,'write');
 const request=historyRequestSchema.parse({protocolVersion:1,ownerId:context.userId,operationId,command});
 const {data,error}=await(context.principal?.credential==='mcp'?context.supabase.rpc('mcp_train_history',{p_owner:context.userId,p_operation:'command',p_request:request}):context.supabase.rpc('execute_train_history_command',{p_request:request}));
 if(error)throw new Error('History command unavailable');
 const accepted=historyAcceptedSchema.safeParse(data),rejected=historyRejectedSchema.safeParse(data);
 const outcome=accepted.success?accepted.data.receipt:rejected.success?rejected.data.rejection:null;
 if(outcome){if(outcome.ownerId!==context.userId||outcome.operationId!==operationId||outcome.workoutId!==request.command.workoutId||outcome.operation!==request.command.kind)throw new Error('Invalid history outcome');return data;}
 if(data?.status==='not_ready'||data?.status==='operation_conflict')return {protocolVersion:1,error:{code:data.status}};
 throw new Error('History command unavailable');
}
