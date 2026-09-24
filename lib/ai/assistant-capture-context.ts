import type {SupabaseClient} from '@supabase/supabase-js';

/** Ordinary conversation must not erase the last material preview's identity. */
export function latestCaptureTurn(client:SupabaseClient,userId:string,conversationId:string){
 return client.from('assistant_turns').select('id,response').eq('user_id',userId).eq('conversation_id',conversationId)
  .eq('response->>intent','capture').not('response->proposal->body->items','eq','[]')
  .order('created_at',{ascending:false}).limit(1).maybeSingle();
}
