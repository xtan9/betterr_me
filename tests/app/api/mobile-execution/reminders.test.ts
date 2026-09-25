import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),recommend:vi.fn(),send:vi.fn(),quiet:vi.fn(),allow:true,selected:true,claim:true}));
vi.mock('@/lib/cron/auth',()=>({authorizeCronRequest:()=>({ok:mocks.allow,status:401,error:'unauthorized'})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:mocks.from,rpc:mocks.rpc})}));
vi.mock('@/lib/db/notifications',()=>({NotificationsDB:class{getPushQuietWindow=mocks.quiet;}}));
vi.mock('@/lib/ai/assistant-execution',async importOriginal=>({...await importOriginal<typeof import('@/lib/ai/assistant-execution')>(),executionRecommendation:mocks.recommend}));
import {GET} from '@/app/api/cron/assistant-reminders/route';
beforeEach(()=>{
 vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-01T10:00:00Z'));mocks.allow=true;mocks.claim=true;mocks.selected=true;
 vi.stubGlobal('fetch',mocks.send);mocks.send.mockResolvedValue({ok:true,json:async()=>({data:[{status:'ok'}]})});
 mocks.quiet.mockResolvedValue({pushQuietWindow:{status:'ready',value:{status:'disabled'}},userTimeZone:{status:'resolved',value:'UTC'}});
 mocks.recommend.mockImplementation(async()=>({selected:mocks.selected?{title:'Private task'}:null}));
 mocks.rpc.mockImplementation(async(name:string)=>({data:name==='assistant_active_push_devices'?[{token:'ExpoPushToken[fixture]'}]:name==='assistant_claim_reminder'?mocks.claim:{queue:{},priorities:{}},error:null}));
 mocks.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:[{user_id:'owner',enabled:true,timezone:'UTC',start_minute:540,end_minute:1020,last_sent_at:null,sent_date:null,sent_count:0,snoozed_until:null,locale:'en',version:'version'}]})};return q;});
});
it('sends only a generic owner-scoped notification after eligibility and an atomic claim',async()=>{
 expect((await GET(new Request('https://example.test'))).status).toBe(200);
 const payload=JSON.parse(mocks.send.mock.calls[0][1].body);expect(payload[0].data).toEqual({kind:'assistant-next-action',ownerId:'owner'});expect(JSON.stringify(payload)).not.toContain('Private task');expect(mocks.rpc).toHaveBeenCalledWith('assistant_claim_reminder',{p_user_id:'owner',p_version:'version'});
});
it('does not send without suitable work or after another worker consumed the quota',async()=>{
 mocks.selected=false;await GET(new Request('https://example.test'));expect(mocks.send).not.toHaveBeenCalled();
 mocks.selected=true;mocks.claim=false;await GET(new Request('https://example.test'));expect(mocks.send).not.toHaveBeenCalled();
});
it('requires cron authorization and fails closed on unavailable quiet-hours context',async()=>{
 mocks.allow=false;expect((await GET(new Request('https://example.test'))).status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();
 mocks.allow=true;mocks.quiet.mockResolvedValue(null);await GET(new Request('https://example.test'));expect(mocks.send).not.toHaveBeenCalled();
});
