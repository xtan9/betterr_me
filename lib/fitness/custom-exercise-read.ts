import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { customExerciseSchema,exerciseIdSchema } from '@/lib/validations/train-exercises';
import { exerciseFailure,exerciseHeaders,exerciseUnavailable } from './exercise-commands';

const pageSchema=z.object({status:z.literal('available'),definitions:z.array(customExerciseSchema).max(100),nextCursor:exerciseIdSchema.nullable()}).strict();
const detailSchema=z.object({status:z.literal('available'),definition:customExerciseSchema}).strict();
export async function readCustomExercises(client:SupabaseClient,owner:string,id:string|null,after:string|null) {
  if((id!==null&&!exerciseIdSchema.safeParse(id).success)||(after!==null&&!exerciseIdSchema.safeParse(after).success))return exerciseFailure('invalid_request',400);
  const {data,error}=await client.rpc('read_train_custom_exercises',{p_id:id,p_after:after});
  if(error)return exerciseUnavailable('rpc_error');
  if(data?.status==='not_ready')return exerciseFailure('not_ready',503);
  if(data?.status==='not_found')return exerciseFailure('not_found',404);
  if(id!==null) {
    const parsed=detailSchema.safeParse(data);
    if(!parsed.success||parsed.data.definition.ownerId!==owner||parsed.data.definition.id!==id)return exerciseUnavailable('invalid_rpc_response');
    return Response.json({protocolVersion:1,definition:parsed.data.definition},{headers:exerciseHeaders});
  }
  const parsed=pageSchema.safeParse(data);
  if(!parsed.success||parsed.data.definitions.some(definition=>definition.ownerId!==owner))return exerciseUnavailable('invalid_rpc_response');
  return Response.json({protocolVersion:1,definitions:parsed.data.definitions,nextCursor:parsed.data.nextCursor},{headers:exerciseHeaders});
}
