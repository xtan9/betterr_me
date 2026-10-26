// @vitest-environment node
import {NextRequest} from 'next/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({create:vi.fn(),getUser:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:mocks.create}));
vi.mock('@/lib/utils',()=>({hasEnvVars:true}));
import {updateSession} from '@/lib/supabase/proxy';

describe('API routes through the cookie proxy',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:null}});mocks.create.mockReturnValue({auth:{getUser:mocks.getUser}});});
 it.each(['GET','OPTIONS'])('lets %s reach history bearer authentication without a web-session redirect',async method=>{
  const response=await updateSession(new NextRequest('https://www.betterr.me/api/mobile/assistant/history',{method,headers:method==='GET'?{Authorization:'Bearer synthetic-test-token'}:{Origin:'http://localhost:8082','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,content-type'}}));
  expect(response.headers.get('location')).toBeNull();expect(response.headers.get('x-middleware-next')).toBe('1');expect(mocks.create).not.toHaveBeenCalled();
 });
 it('keeps unrelated pages and lookalike history paths cookie-protected',async()=>{
  for(const path of ['/tasks','/api/mobile/train/exercises-extra','/api/mobile/train/templates-extra','/api/mobile/train/templates/commands/export','/api/mobile/train/exercises/commands/export','/api/mobile/train/completions-extra','/api/mobile/assistant/history-export','/api/mobile/assistant/command-extra','/api/mobile/execution/export','/api/cron/assistant-reminders-export','/api/mobile/connections/export','/api/mobile/connections-extra','/api/mobile/planning/command-extra','/api/mobile/sleep-export','/api/mobile/focus/history-export','/api/focus/history-export']){
   const response=await updateSession(new NextRequest(`https://www.betterr.me${path}`));
   expect(response.headers.get('location')).toBe('https://www.betterr.me/auth/login');
  }
 });
 it.each([
  ['/api/mobile/train/templates','GET'],['/api/mobile/train/templates/commands','POST'],['/api/mobile/train/templates/capabilities','GET'],['/api/mobile/train/templates/definitions','GET'],['/api/mobile/train/templates/11111111-1111-4111-8111-111111111111','GET'],
  ['/api/mobile/train/completions','POST'],['/api/mobile/train/completions','OPTIONS'],
  ['/api/mobile/train/exercises','GET'],['/api/mobile/train/exercises/commands','POST'],
  ['/api/mobile/train/exercises/capabilities','GET'],['/api/mobile/train/exercises/11111111-1111-4111-8111-111111111111','GET'],
  ['/api/mobile/execution','POST'],['/api/mobile/execution','OPTIONS'],
  ['/api/mobile/execution/settings','GET'],['/api/mobile/execution/settings','POST'],['/api/mobile/execution/settings','OPTIONS'],
  ['/api/cron/assistant-reminders','GET'],
  ['/api/mobile/connections','GET'],['/api/mobile/connections','POST'],['/api/mobile/connections','OPTIONS'],
  ['/api/mobile/connections/callback','GET'],
  ['/api/mobile/planning/command','POST'],['/api/mobile/planning/command','OPTIONS'],
  ['/api/mobile/assistant/command','POST'],['/api/mobile/assistant/command','OPTIONS'],
  ['/api/mobile/sleep','GET'],['/api/mobile/sleep','POST'],['/api/mobile/sleep','OPTIONS'],
  ['/api/mobile/focus/history','GET'],['/api/mobile/focus/history','POST'],['/api/mobile/focus/history','OPTIONS'],
  ['/api/focus/history','GET'],
  ['/api/mobile/focus/app-limits/history','GET'],['/api/mobile/focus/app-limits/history','POST'],['/api/mobile/focus/app-limits/history','OPTIONS'],
  ['/api/focus/app-limits/history','GET'],
 ])('delegates %s %s to its own route authentication',async(path,method)=>{
  const response=await updateSession(new NextRequest(`https://www.betterr.me${path}`,{method}));
  expect(response.headers.get('location')).toBeNull();expect(response.headers.get('x-middleware-next')).toBe('1');expect(mocks.create).not.toHaveBeenCalled();
 });
});
