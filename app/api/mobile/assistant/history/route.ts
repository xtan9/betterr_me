import {z} from 'zod';
import {authenticateNativeRequest} from '@/lib/auth/native-request';
const headers={'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, OPTIONS'};
const respond=(body:unknown,status=200)=>Response.json(body,{status,headers});
export function OPTIONS(){return new Response(null,{status:204,headers});}
export async function GET(request:Request){
 try{
  const params=new URL(request.url).searchParams;
  const parsed=z.object({conversationId:z.string().uuid().optional(),before:z.coerce.number().int().positive().safe().optional()}).strict().safeParse(Object.fromEntries(params));
  if(!parsed.success)return respond({error:'invalid'},400);
  const auth=await authenticateNativeRequest(request);if(!auth)return respond({error:'unauthorized'},401);
  const {client,userId}=auth;
  let query=client.from('assistant_conversations').select('id').eq('user_id',userId);
  if(parsed.data.conversationId)query=query.eq('id',parsed.data.conversationId);
  const conversation=await query.order('last_message_at',{ascending:false}).limit(1).maybeSingle();
  if(conversation.error)return respond({error:'unavailable'},503);
  if(!conversation.data)return parsed.data.conversationId?respond({error:'not-found'},404):respond({conversationId:null,messages:[],before:null});
  let history=client.from('assistant_messages').select('role,content,sequence').eq('user_id',userId).eq('conversation_id',conversation.data.id);
  if(parsed.data.before)history=history.lt('sequence',parsed.data.before);
  const messages=await history.order('sequence',{ascending:false}).limit(41);
  if(messages.error)return respond({error:'unavailable'},503);
  const page=(messages.data??[]).slice(0,40).reverse();
  // Restore the latest proposal using its current state, not the immutable response's old state.
  const turn=await client.from('assistant_turns').select('id,response').eq('user_id',userId).eq('conversation_id',conversation.data.id).not('response','is',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(turn.error)return respond({error:'unavailable'},503);
  const proposal=turn.data?await client.from('planner_ai_proposals').select('*').eq('user_id',userId).eq('id',turn.data.id).maybeSingle():null;
  if(proposal?.error)return respond({error:'unavailable'},503);
  return respond({conversationId:conversation.data.id,messages:page.map(({role,content})=>({role,content})),before:(messages.data?.length??0)>40?page[0].sequence:null,ui:turn.data?.response?.ui,proposal:proposal?.data??null});
 }catch{return respond({error:'unavailable'},503);}
}
