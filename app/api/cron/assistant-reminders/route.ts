import {authorizeCronRequest} from '@/lib/cron/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {executionRecommendation,reminderDue} from '@/lib/ai/assistant-execution';
import {NotificationsDB} from '@/lib/db/notifications';
import {isPushQuietWindowActive} from '@/lib/preferences/push-quiet-window';

export const maxDuration=60;
export async function GET(request:Request){
 const auth=authorizeCronRequest(request.headers.get('authorization'));
 if(!auth.ok)return Response.json({error:auth.error},{status:auth.status});
 try{
  const client=createAdminClient(),now=Date.now();
  // Stable pagination; atomic claims enforce the shared cap across devices.
  let sent=0,checked=0,offset=0;
  while(Date.now()-now<40_000){
   const settings=await client.from('assistant_reminder_settings').select('*').eq('enabled',true).order('user_id').range(offset,offset+99);
   if(settings.error||!settings.data)throw new Error('Unavailable');
   for(const row of settings.data){
    if(Date.now()-now>=40_000)break;
    checked++;
    if(!reminderDue({enabled:row.enabled,timezone:row.timezone,startMinute:row.start_minute,endMinute:row.end_minute,lastSentAt:row.last_sent_at,sentDate:row.sent_date,sentCount:row.sent_count,snoozedUntil:row.snoozed_until},now))continue;
    try{
     const quiet=await new NotificationsDB(client).getPushQuietWindow(row.user_id);
     if(!quiet||quiet.pushQuietWindow.status!=='ready'||quiet.userTimeZone.status!=='resolved'||isPushQuietWindowActive(quiet.pushQuietWindow,quiet.userTimeZone))continue;
     const devices=await client.rpc('assistant_active_push_devices',{p_user_id:row.user_id});
     if(devices.error||!devices.data?.length)continue;
     const end=now+60*60_000;
     const snapshot=await client.rpc('assistant_dispatch_snapshot',{p_user_id:row.user_id,p_at:new Date(now).toISOString(),p_end:new Date(end).toISOString()});
     if(snapshot.error||!snapshot.data)continue;
     // Only the two auth.uid()-based read RPCs require the service-only adapter.
     const scoped=new Proxy(client,{get(target,key){
      if(key==='rpc')return async(name:string)=>({data:name==='action_queue_snapshot'?snapshot.data.queue:name==='priority_snapshot'?snapshot.data.priorities:null,error:null});
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
     }});
     const facts=await executionRecommendation(scoped,row.user_id,end,[],now);
     if(!facts.selected)continue;
     const claim=await client.rpc('assistant_claim_reminder',{p_user_id:row.user_id,p_version:row.version});
     if(claim.error||claim.data!==true)continue;
     const payload=devices.data.map((device:{token:string})=>({to:device.token,title:row.locale==='zh'?'想推进一件小事吗？':'Ready for one small step?',body:row.locale==='zh'?'打开 Assistant，看看接下来适合做什么。':'Open Assistant to choose a useful next step.',data:{kind:'assistant-next-action',ownerId:row.user_id},ttl:300,sound:'default',channelId:'assistant'}));
     const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'Content-Type':'application/json',...(process.env.EXPO_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
     if(!response.ok)continue;
     const result=await response.json();
     if(Array.isArray(result.data))for(let i=0;i<result.data.length;i++){
      if(result.data[i]?.status==='ok')sent++;
      else if(result.data[i]?.details?.error==='DeviceNotRegistered')await client.from('assistant_push_devices').delete().eq('user_id',row.user_id).eq('token',devices.data[i]?.token);
     }
    }catch{ /* Private content and provider payloads must not enter logs. Claim stays consumed. */ }
   }
   if(settings.data.length<100)break;offset+=100;
  }
  return Response.json({checked,sent},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'unavailable'},{status:503});}
}
