import { createClient } from '@supabase/supabase-js';

/** A native session uses the public client and its verified user JWT, never admin credentials. */
export async function authenticateNativeRequest(request: Request) {
  const authorization=request.headers.get('authorization');
  if(!authorization?.startsWith('Bearer ')||authorization.length>8192)return null;
  const token=authorization.slice(7);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)throw new Error('Native auth unavailable');
  const client=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  if(error||!data.user)return null;
  return {userId:data.user.id,client};
}
