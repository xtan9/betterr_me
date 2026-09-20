// Explicit deployed verification. Creates only disposable synthetic accounts;
// never reads existing owners or accepts a task/calendar proposal.
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

if(process.env.PHASE_A_DEPLOYED_LIVE!=='1')throw new Error('Set PHASE_A_DEPLOYED_LIVE=1 explicitly');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const accounts=[];
const failures=[];
function verify(condition,label){console.log(`${condition?'PASS':'FAIL'} ${label}`);if(!condition)failures.push(label);}
function check(result,label){if(result.error)throw new Error(`${label} failed (${result.error.status??result.error.code??'unknown'})`);return result.data;}
async function account(){
 const email=`phase-a-verification-${randomUUID()}@example.com`,password=randomUUID()+randomUUID();
 const {user}=check(await admin.auth.admin.createUser({email,password,email_confirm:true}),'Create synthetic account');
 const entry={id:user.id,client:null};accounts.push(entry);
 console.log('Created synthetic account');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});entry.client=client;
 const {session}=check(await client.auth.signInWithPassword({email,password}),'Sign in');
 console.log('Authenticated synthetic account');
 check(await client.from('profiles').update({timezone:'America/Los_Angeles'}).eq('id',user.id),'Set test timezone');
 return {...entry,token:session.access_token};
}
async function send(owner,content,conversationId){
 console.log('Sending synthetic Assistant turn');
 const response=await fetch('https://www.betterr.me/api/mobile/assistant',{method:'POST',headers:{Authorization:`Bearer ${owner.token}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),...(conversationId?{conversationId}:{}),consent:true,locale:'en',messages:[{role:'user',content}]}),signal:AbortSignal.timeout(65000),redirect:'error'});
 if(!response.ok)throw new Error(`Deployed Assistant returned HTTP ${response.status}`);
 const result=await response.json();
 console.log(JSON.stringify({intent:result.intent,planning:result.planning,message:result.message,proposalItemCount:result.proposal?.body?.items?.length??0}));
 assert(!result.proposal?.body?.items?.length,'Discovery must not produce an apply proposal');
 assert(!/capture step|endpoint|subsystem|unsupported schedule optimization/i.test(result.message),'Internal language');
 return result;
}
try{
 const owner=await account();
 const history=await fetch('https://www.betterr.me/api/mobile/assistant/history',{headers:{Authorization:`Bearer ${owner.token}`},redirect:'manual',signal:AbortSignal.timeout(15000)});
 assert.equal(history.status,200,'History must not redirect bearer clients to cookie login');
 assert.deepEqual(await history.json(),{conversationId:null,messages:[],before:null});
 const first=await send(owner,readFileSync('tests/fixtures/assistant/two-week-planning.txt','utf8'));
 assert.equal(first.intent,'planning');assert.equal(first.planning.status,'discovering');
 for(const dimension of ['horizon','sleep','caregiving'])assert(first.planning.missing.includes(dimension),`Missing ${dimension}`);
 assert((first.message.match(/[?？]/g)||[]).length<=3,'Question limit');
 for(const pattern of [/date/i,/sleep|wake/i,/pick.?up/i,/family/i,/calls|admin/i,/next action|one.*(?:task|step|action)|decision/i])verify(pattern.test(first.message),`Golden reflection ${pattern}`);
 console.log('PASS deployed golden discovery');
 const skipped=await send(owner,'Skip. Plan now.',first.conversationId);
 assert.equal(skipped.planning.status,'drafted');assert(skipped.planning.assumptions.length>0);assert(!skipped.message.includes('?'));
 console.log('PASS deployed skip with explicit assumptions');
 const memories=()=>owner.client.from('user_memories').select('id,key,content,status,temporality,effective_until').eq('user_id',owner.id);
 const before=check(await memories(),'Read own memories');
 const routine=before.find(m=>m.status==='active'&&m.temporality==='durable'&&/gym|fitness/i.test(m.content));
 assert(routine,'Durable gym routine persisted');
 const second=await send(owner,'Help me plan next week.');
 assert.equal(second.intent,'planning');
 assert(!/how (?:many|often).*gym|(?:is|are).*gym.*important/i.test(second.message),'Re-asked durable exercise preference');
 console.log('PASS deployed new conversation reuses memory');
 await send(owner,'For the next month I only want to go to the gym four days a week.',second.conversationId);
 const corrected=check(await memories(),'Read corrected memories');
 assert(corrected.some(m=>m.id===routine.id&&m.status==='active'&&m.content===routine.content),'Durable baseline retained');
 const override=corrected.find(m=>m.key===routine.key&&m.status==='active'&&m.temporality==='temporary'&&m.effective_until&&/four|4/.test(m.content));
 assert(override,'One-month temporary override');
 const daysRemaining=(Date.parse(override.effective_until)-Date.now())/86400000;
 assert(daysRemaining>27&&daysRemaining<32,'Temporary override lasts a calendar month');
 const third=await send(owner,'Help me plan next week. Remind me of my current gym frequency.');
 assert(/four|4/.test(third.message),'Current correction recalled');
 console.log('PASS deployed temporary correction and later recall');
 const other=await account();
 for(const table of ['assistant_conversations','user_memories','planning_sessions']){
  const rows=check(await other.client.from(table).select('id').eq('user_id',owner.id),'Foreign read');assert.equal(rows.length,0);
 }
 for(const table of ['tasks','calendar_events']){
  const rows=check(await owner.client.from(table).select('id').eq('user_id',owner.id),'Read test mutations');assert.equal(rows.length,0);
 }
 console.log('PASS deployed owner isolation and no task/calendar mutation');
 if(failures.length)process.exitCode=1;
}catch(error){
 console.error(error instanceof Error?error.message:'Live verification failed');process.exitCode=1;
}finally{
 for(const entry of accounts.reverse()){
  try{if(entry.client)check(await entry.client.auth.signOut({scope:'global'}),'Revoke synthetic session');}
  catch{console.error('Synthetic session cleanup failed');process.exitCode=1;}
  try{check(await admin.auth.admin.deleteUser(entry.id),'Delete synthetic account');}
  catch{console.error('Synthetic account cleanup failed');process.exitCode=1;}
 }
 console.log(`Finished cleanup attempts for ${accounts.length} synthetic accounts`);
}
