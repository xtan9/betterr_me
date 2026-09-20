// @vitest-environment node
import {NextRequest} from 'next/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({create:vi.fn(),getUser:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:mocks.create}));
vi.mock('@/lib/utils',()=>({hasEnvVars:true}));
import {updateSession} from '@/lib/supabase/proxy';

describe('native Assistant history through the cookie proxy',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.getUser.mockResolvedValue({data:{user:null}});mocks.create.mockReturnValue({auth:{getUser:mocks.getUser}});});
 it.each(['GET','OPTIONS'])('lets %s reach history bearer authentication without a web-session redirect',async method=>{
  const response=await updateSession(new NextRequest('https://www.betterr.me/api/mobile/assistant/history',{method,headers:method==='GET'?{Authorization:'Bearer synthetic-test-token'}:{Origin:'http://localhost:8082','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,content-type'}}));
  expect(response.headers.get('location')).toBeNull();expect(response.headers.get('x-middleware-next')).toBe('1');expect(mocks.create).not.toHaveBeenCalled();
 });
 it('keeps unrelated pages and lookalike history paths cookie-protected',async()=>{
  for(const path of ['/tasks','/api/mobile/assistant/history-export']){
   const response=await updateSession(new NextRequest(`https://www.betterr.me${path}`));
   expect(response.headers.get('location')).toBe('https://www.betterr.me/auth/login');
  }
 });
});
